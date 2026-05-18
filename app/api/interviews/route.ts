import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  listMyInterviews,
  createInterview,
  INTERVIEW_ROUNDS,
  type InterviewRound,
} from "@/lib/db/interviews";
import { listMyProjects } from "@/lib/db/projects";
import { tryIncrementUsage } from "@/lib/db/usage";
import { createSignalsBulk, type Signal, type SignalDraft } from "@/lib/db/signals";
import {
  INTERVIEW_SIGNALS_SYSTEM,
  buildInterviewSignalsUserMessage,
  buildProjectContentSummary,
} from "@/lib/prompts/interview-signals";
import { parseJsonFromLLM, JsonParseError } from "@/lib/ai/json";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

type Body = {
  application_id?: string | null;
  round?: string;
  interviewed_at?: string;
  questions_md?: string;
  self_score?: number | null;
  lowlights?: string;
  next_action?: string;
  sync_application_status?: boolean;
};

type RawSignal = {
  project_id: unknown;
  quoted_question: unknown;
  quoted_lowlight: unknown;
  suggestion: unknown;
};

export async function GET() {
  try {
    const list = await listMyInterviews();
    return Response.json(list);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.round || !INTERVIEW_ROUNDS.includes(body.round as InterviewRound)) {
      return Response.json({ error: "round 不合法" }, { status: 400 });
    }
    if (!body.interviewed_at || !/^\d{4}-\d{2}-\d{2}$/.test(body.interviewed_at)) {
      return Response.json({ error: "interviewed_at 必须是 YYYY-MM-DD" }, { status: 400 });
    }
    if (
      body.self_score != null &&
      (typeof body.self_score !== "number" || body.self_score < 1 || body.self_score > 10)
    ) {
      return Response.json({ error: "self_score 必须在 1-10 之间" }, { status: 400 });
    }

    const itv = await createInterview({
      application_id: body.application_id ?? null,
      round: body.round as InterviewRound,
      interviewed_at: body.interviewed_at,
      questions_md: body.questions_md,
      self_score: body.self_score ?? null,
      lowlights: body.lowlights,
      next_action: body.next_action,
      sync_application_status: body.sync_application_status,
    });

    const extraction = await extractSignalsForInterview({
      interviewId: itv.id,
      questions_md: body.questions_md || "",
      lowlights: body.lowlights || "",
      next_action: body.next_action || "",
    });

    return Response.json({ ...itv, ...extraction });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export type ExtractionResult = {
  signals: Signal[];
  signalsSkipped?: "usage_exhausted" | "ai_failed" | "no_projects";
  warning?: string;
};

export async function extractSignalsForInterview(args: {
  interviewId: string;
  questions_md: string;
  lowlights: string;
  next_action: string;
}): Promise<ExtractionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const usage = await tryIncrementUsage(user.id, user.email);
  if (!usage.ok) {
    return {
      signals: [],
      signalsSkipped: "usage_exhausted",
      warning: `今日 AI 用量已达上限（${usage.limit}），明天再试或在详情页手动重新抽取`,
    };
  }

  const projects = await listMyProjects();
  if (projects.length === 0) {
    return { signals: [], signalsSkipped: "no_projects" };
  }

  const candidates = projects.map((p) => ({
    id: p.id,
    name: p.name,
    content_summary: buildProjectContentSummary(p.content),
  }));
  const candidateIds = new Set(candidates.map((c) => c.id));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      signals: [],
      signalsSkipped: "ai_failed",
      warning: "服务端未配置 ANTHROPIC_API_KEY",
    };
  }

  let rawSignals: RawSignal[];
  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: INTERVIEW_SIGNALS_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildInterviewSignalsUserMessage({
            questions_md: args.questions_md,
            lowlights: args.lowlights,
            next_action: args.next_action,
            projects: candidates,
          }),
        },
      ],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const parsed = parseJsonFromLLM<unknown>(text);
    if (!Array.isArray(parsed)) {
      return {
        signals: [],
        signalsSkipped: "ai_failed",
        warning: "AI 返回的不是数组，可在详情页重新抽取",
      };
    }
    rawSignals = parsed as RawSignal[];
  } catch (e) {
    const detail = e instanceof JsonParseError ? "AI 返回的内容不是合法 JSON" : e instanceof Error ? e.message : "未知错误";
    console.error("[signal-extract] AI call failed:", detail);
    return {
      signals: [],
      signalsSkipped: "ai_failed",
      warning: `AI 抽取失败：${detail}，可在详情页重新抽取`,
    };
  }

  const drafts: SignalDraft[] = [];
  for (const r of rawSignals) {
    const quoted_question = typeof r.quoted_question === "string" ? r.quoted_question.trim() : "";
    const quoted_lowlight = typeof r.quoted_lowlight === "string" ? r.quoted_lowlight.trim() : "";
    const suggestion = typeof r.suggestion === "string" ? r.suggestion.trim() : "";
    if (!quoted_question && !quoted_lowlight && !suggestion) continue;

    let project_id: string | null = null;
    let finalSuggestion = suggestion;
    if (typeof r.project_id === "string" && r.project_id.length > 0) {
      if (candidateIds.has(r.project_id)) {
        project_id = r.project_id;
      } else {
        finalSuggestion = `[AI 误指 project_id=${r.project_id}] ${suggestion}`;
      }
    }

    drafts.push({
      interview_id: args.interviewId,
      project_id,
      quoted_question,
      quoted_lowlight,
      suggestion: finalSuggestion,
    });
  }

  if (drafts.length === 0) return { signals: [] };

  try {
    const inserted = await createSignalsBulk(drafts);
    return { signals: inserted };
  } catch (e) {
    console.error("[signal-extract] DB insert failed:", e);
    return {
      signals: [],
      signalsSkipped: "ai_failed",
      warning: "信号写入数据库失败，可在详情页重新抽取",
    };
  }
}
