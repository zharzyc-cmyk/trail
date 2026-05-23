import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { tryIncrementUsage, rollbackUsage } from "@/lib/db/usage";
import { getMyProfile } from "@/lib/db/profile";
import { listMyProjects } from "@/lib/db/projects";
import { createApplication } from "@/lib/db/applications";
import {
  RESUME_TAILORING_SYSTEM,
  buildStableUserContext,
  buildVariableUserContext,
} from "@/lib/prompts/resume-tailoring";
import {
  PROJECT_SELECTOR_SYSTEM,
  buildProjectSelectorUserMessage,
} from "@/lib/prompts/project-selector";

export const runtime = "nodejs";
export const maxDuration = 60;

// Selector 固定 Anthropic Haiku（轻量任务，速度快）
const SELECTOR_MODEL = "claude-haiku-4-5-20251001";
// Tailor 模型由 env 切换：以 deepseek- 开头走 DeepSeek 兼容端点，否则走 Anthropic
const TAILOR_MODEL = process.env.TAILOR_MODEL || "claude-haiku-4-5-20251001";

type Selection = {
  jdAnalysis: string;
  atsKeywords?: string[];
  selectedProjects: string[];
  excludedProjects?: { name: string; reason: string }[];
};

type Body = {
  jd: string;
  company: string;
  position: string;
  channel?: string;
};

function createTailorClient(): Anthropic {
  if (TAILOR_MODEL.startsWith("deepseek-")) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("服务端未配置 DEEPSEEK_API_KEY");
    return new Anthropic({ apiKey, baseURL: "https://api.deepseek.com/anthropic" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("服务端未配置 ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.jd || !body.company || !body.position) {
    return Response.json({ error: "缺少 jd / company / position" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "服务端未配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }

  // 配额先 await（超限直接 return，避免浪费 DB 和 LLM 调用）
  let usage: Awaited<ReturnType<typeof tryIncrementUsage>>;
  try {
    usage = await tryIncrementUsage(user.id, user.email);
  } catch (e) {
    console.error("[/api/tailor] usage error:", e);
    return Response.json({ error: `读取用户数据失败：${formatDbError(e)}` }, { status: 500 });
  }
  if (!usage.ok) {
    return Response.json(
      { error: `今日用量已达上限（${usage.limit} 次）。明天再试。` },
      { status: 429 }
    );
  }

  // profile + projects 并行
  let profile: Awaited<ReturnType<typeof getMyProfile>>;
  let projects: Awaited<ReturnType<typeof listMyProjects>>;
  try {
    [profile, projects] = await Promise.all([getMyProfile(), listMyProjects()]);
  } catch (e) {
    console.error("[/api/tailor] profile/projects error:", e);
    await rollbackUsage(user.id, user.email);
    return Response.json({ error: `读取用户数据失败：${formatDbError(e)}` }, { status: 500 });
  }

  // 阶段 1：Anthropic Haiku 筛选项目 + 抽 ATS 关键词
  const selectorClient = new Anthropic({
    apiKey: anthropicKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
  let selection: Selection | null = null;
  if (projects.length > 0) {
    try {
      const selectorResp = await selectorClient.messages.create({
        model: SELECTOR_MODEL,
        max_tokens: 1024,
        system: PROJECT_SELECTOR_SYSTEM,
        messages: [
          {
            role: "user",
            content: buildProjectSelectorUserMessage({
              jd: body.jd,
              companyName: body.company,
              position: body.position,
              projects: projects.map((p) => ({ name: p.name, summary: p.content.slice(0, 90) })),
            }),
          },
        ],
      });
      console.log("[/api/tailor] selector usage:", {
        input: selectorResp.usage.input_tokens,
        output: selectorResp.usage.output_tokens,
      });
      const text = selectorResp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      selection = JSON.parse(stripCodeFence(text)) as Selection;
    } catch (e) {
      console.error("[/api/tailor] selector failed, fallback to all projects:", e);
      selection = null;
    }
  }

  // 选中项目；如果 selection 给的名字全对不上（幻觉）就退回全量
  const filtered = selection
    ? projects.filter((p) => selection!.selectedProjects.includes(p.name))
    : [];
  const effectiveProjects = filtered.length > 0 ? filtered : projects;

  // 阶段 2：TAILOR_MODEL 生成完整简历（可能是 Claude 也可能是 DeepSeek）
  let tailorClient: Anthropic;
  try {
    tailorClient = createTailorClient();
  } catch (e) {
    await rollbackUsage(user.id, user.email);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  try {
    const resp = await tailorClient.messages.create({
      model: TAILOR_MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: RESUME_TAILORING_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildStableUserContext({
                profile: profile?.self_profile || "",
                resumeBase: profile?.resume_base || "",
                projects: effectiveProjects.map((p) => ({ name: p.name, content: p.content })),
              }),
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: buildVariableUserContext({
                jd: body.jd,
                companyName: body.company,
                position: body.position,
                atsKeywords: selection?.atsKeywords,
              }),
            },
          ],
        },
      ],
    });

    console.log("[/api/tailor] tailor usage:", {
      model: TAILOR_MODEL,
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
      cache_read: resp.usage.cache_read_input_tokens,
      cache_creation: resp.usage.cache_creation_input_tokens,
      stop_reason: resp.stop_reason,
      selected: effectiveProjects.length,
      total: projects.length,
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    let parsed: {
      jdAnalysis: string;
      selectedProjects: string[];
      excludedProjects?: { name: string; reason: string }[];
      changeLog: string[];
      resumeMarkdown: string;
      name?: string;
      contactHtml?: string;
      sections?: { title: string; html: string }[];
    };
    try {
      parsed = JSON.parse(stripCodeFence(text));
    } catch {
      await rollbackUsage(user.id, user.email);
      return Response.json(
        { error: "AI 返回的内容不是合法 JSON，请重试", raw: text.slice(0, 500) },
        { status: 502 }
      );
    }

    const finalSelectedProjects = selection?.selectedProjects ?? parsed.selectedProjects ?? [];
    const app = await createApplication({
      company: body.company,
      position: body.position,
      channel: body.channel || "",
      jd: body.jd,
      selected_projects: finalSelectedProjects,
      resume_markdown: parsed.resumeMarkdown || "",
    });

    return Response.json({
      ...parsed,
      jdAnalysis: selection?.jdAnalysis ?? parsed.jdAnalysis,
      atsKeywords: selection?.atsKeywords,
      selectedProjects: finalSelectedProjects,
      excludedProjects: selection?.excludedProjects ?? parsed.excludedProjects,
      photoUrl: profile?.photo_url ?? null,
      applicationId: app.id,
      usage: { current: usage.current, limit: usage.limit },
    });
  } catch (e) {
    console.error("[/api/tailor] tailor error:", e);
    await rollbackUsage(user.id, user.email);
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|invalid_api_key|authentication/i.test(msg)) {
      return Response.json({ error: "服务端 API Key 失效，请联系管理员" }, { status: 500 });
    }
    return Response.json({ error: `AI 调用失败：${msg}` }, { status: 500 });
  }
}

function formatDbError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [o.message, o.code && `code=${o.code}`, o.details, o.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  return e instanceof Error ? e.message : String(e);
}

function stripCodeFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
  }
  t = t.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) return t.slice(start, end + 1);
  return t;
}
