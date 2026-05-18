import {
  updateInterview,
  deleteInterview,
  INTERVIEW_ROUNDS,
  type InterviewRound,
  type Interview,
} from "@/lib/db/interviews";

export const runtime = "nodejs";

type PatchBody = Partial<
  Pick<Interview, "round" | "interviewed_at" | "questions_md" | "self_score" | "lowlights" | "next_action">
>;

export async function PATCH(req: Request, ctx: RouteContext<"/api/interviews/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as PatchBody;

    if (body.round != null && !INTERVIEW_ROUNDS.includes(body.round as InterviewRound)) {
      return Response.json({ error: "round 不合法" }, { status: 400 });
    }
    if (body.interviewed_at != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.interviewed_at)) {
      return Response.json({ error: "interviewed_at 必须是 YYYY-MM-DD" }, { status: 400 });
    }
    if (
      body.self_score != null &&
      (typeof body.self_score !== "number" || body.self_score < 1 || body.self_score > 10)
    ) {
      return Response.json({ error: "self_score 必须在 1-10 之间" }, { status: 400 });
    }

    await updateInterview(id, body);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/interviews/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteInterview(id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
