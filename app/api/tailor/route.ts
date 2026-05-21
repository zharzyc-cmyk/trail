import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { tryIncrementUsage } from "@/lib/db/usage";
import { getMyProfile } from "@/lib/db/profile";
import { listMyProjects } from "@/lib/db/projects";
import { createApplication } from "@/lib/db/applications";
import { RESUME_TAILORING_SYSTEM, buildTailoringUserMessage } from "@/lib/prompts/resume-tailoring";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

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

    const userMessage = buildTailoringUserMessage({
      profile: profile?.self_profile || "",
      resumeBase: profile?.resume_base || "",
      projects: projects.map((p) => ({ name: p.name, content: p.content })),
      jd: body.jd,
      companyName: body.company,
      position: body.position,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "服务端未配置 ANTHROPIC_API_KEY" }, { status: 500 });
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
    const client = new Anthropic({ apiKey, baseURL });

    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: RESUME_TAILORING_SYSTEM,
        messages: [{ role: "user", content: userMessage }],
      });

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
        return Response.json(
          { error: "AI 返回的内容不是合法 JSON，请重试", raw: text.slice(0, 500) },
          { status: 502 }
        );
      }

      const app = await createApplication({
        company: body.company,
        position: body.position,
        channel: body.channel || "",
        jd: body.jd,
        selected_projects: parsed.selectedProjects || [],
        resume_markdown: parsed.resumeMarkdown || "",
      });

      return Response.json({
        ...parsed,
        photoUrl: profile?.photo_url ?? null,
        applicationId: app.id,
        usage: { current: usage.current, limit: usage.limit },
      });
    } catch (e) {
      console.error("[/api/tailor] LLM/post-process error:", e);
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
