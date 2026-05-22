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

// D2: stage 2 was claude-sonnet-4-6 but Sonnet held 50+s on small
// contexts and blew Vercel's 60s function limit. Haiku 4.5 finishes
// in 20-30s. Accepting a quality dip on JD keyword nuance in exchange
// for the function actually returning.
const SELECTOR_MODEL = "claude-haiku-4-5-20251001";
const TAILOR_MODEL = "claude-haiku-4-5-20251001";

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

export async function POST(request: Request) {
  try {
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
    if (!user) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    let usage: Awaited<ReturnType<typeof tryIncrementUsage>>;
    let profile: Awaited<ReturnType<typeof getMyProfile>>;
    let projects: Awaited<ReturnType<typeof listMyProjects>>;
    try {
      usage = await tryIncrementUsage(user.id, user.email);
      if (!usage.ok) {
        return Response.json(
          { error: `今日用量已达上限（${usage.limit} 次）。明天再试。` },
          { status: 429 }
        );
      }
      profile = await getMyProfile();
      projects = await listMyProjects();
    } catch (e) {
      console.error("[/api/tailor] DB error:", e);
      const msg = formatDbError(e);
      return Response.json({ error: `读取用户数据失败：${msg}` }, { status: 500 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await rollbackUsage(user.id, user.email);
      return Response.json({ error: "服务端未配置 ANTHROPIC_API_KEY" }, { status: 500 });
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
    const client = new Anthropic({ apiKey, baseURL });

    // ===== 阶段 1：Haiku 筛选最相关的 3-5 个项目 =====
    let selection: Selection | null = null;
    if (projects.length > 0) {
      try {
        const selectorResp = await client.messages.create({
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
                projects: projects.map((p) => ({
                  name: p.name,
                  summary: p.content.slice(0, 90),
                })),
              }),
            },
          ],
        });
        console.log("[/api/tailor] selector usage:", {
          input: selectorResp.usage.input_tokens,
          output: selectorResp.usage.output_tokens,
          stop_reason: selectorResp.stop_reason,
        });
        const selectorText = selectorResp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        selection = JSON.parse(stripCodeFence(selectorText)) as Selection;
      } catch (e) {
        console.warn("[/api/tailor] selector failed, fallback to all projects:", e);
        selection = null;
      }
    }

    // 兜底：Haiku 没挑到 / 失败 / 项目库为空 → 全量项目送 Sonnet（退化为旧行为）
    const projectsForSonnet =
      selection && selection.selectedProjects.length > 0
        ? projects.filter((p) => selection!.selectedProjects.includes(p.name))
        : projects;
    if (
      selection &&
      selection.selectedProjects.length > 0 &&
      projectsForSonnet.length === 0
    ) {
      // Haiku 挑了名字但都对不上库（说明它幻觉了名字），用全量兜底
      console.warn(
        "[/api/tailor] selector picked names not in library, fallback to all:",
        selection.selectedProjects
      );
    }

    // ===== 阶段 2：Sonnet 用筛选后的小 context 生成完整简历 =====
    const stableContext = buildStableUserContext({
      profile: profile?.self_profile || "",
      resumeBase: profile?.resume_base || "",
      projects: projectsForSonnet.map((p) => ({ name: p.name, content: p.content })),
    });
    const variableContext = buildVariableUserContext({
      jd: body.jd,
      companyName: body.company,
      position: body.position,
      atsKeywords: selection?.atsKeywords,
    });

    try {
      const resp = await client.messages.create({
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
                text: stableContext,
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: variableContext },
            ],
          },
        ],
      });

      console.log("[/api/tailor] tailor usage:", {
        input: resp.usage.input_tokens,
        output: resp.usage.output_tokens,
        cache_read: resp.usage.cache_read_input_tokens,
        cache_creation: resp.usage.cache_creation_input_tokens,
        stop_reason: resp.stop_reason,
        selected_count: projectsForSonnet.length,
        total_count: projects.length,
      });
      if (resp.stop_reason === "max_tokens") {
        console.warn("[/api/tailor] output truncated at max_tokens=2048");
      }

      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      const cleaned = stripCodeFence(text);

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
        parsed = JSON.parse(cleaned);
      } catch {
        await rollbackUsage(user.id, user.email);
        return Response.json(
          { error: "AI 返回的内容不是合法 JSON，请重试", raw: text.slice(0, 500) },
          { status: 502 }
        );
      }

      // 优先用 Haiku 阶段 1 的筛选输出（更精炼），Sonnet 的对应字段作为兜底
      const finalSelectedProjects =
        selection?.selectedProjects ?? parsed.selectedProjects ?? [];
      const finalExcludedProjects =
        selection?.excludedProjects ?? parsed.excludedProjects;
      const finalJdAnalysis = selection?.jdAnalysis ?? parsed.jdAnalysis;

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
        jdAnalysis: finalJdAnalysis,
        atsKeywords: selection?.atsKeywords,
        selectedProjects: finalSelectedProjects,
        excludedProjects: finalExcludedProjects,
        photoUrl: profile?.photo_url ?? null,
        applicationId: app.id,
        usage: { current: usage.current, limit: usage.limit },
      });
    } catch (e) {
      console.error("[/api/tailor] LLM/post-process error:", e);
      await rollbackUsage(user.id, user.email);
      const msg = e instanceof Error ? e.message : String(e);
      if (/401|invalid_api_key|authentication/i.test(msg)) {
        return Response.json({ error: "服务端 Anthropic Key 失效，请联系管理员" }, { status: 500 });
      }
      return Response.json({ error: `AI 调用失败：${msg}` }, { status: 500 });
    }
  } catch (e) {
    console.error("[/api/tailor] uncaught:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `服务器异常：${msg}` }, { status: 500 });
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
  // Claude 偶尔在 JSON 前后加说明文字，截取第一个 { 到最后一个 }。
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}
