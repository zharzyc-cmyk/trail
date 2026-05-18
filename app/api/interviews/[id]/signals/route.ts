import { createClient } from "@/lib/supabase/server";
import {
  listSignalsByInterview,
  replaceSignalsForInterview,
} from "@/lib/db/signals";
import { extractSignalsForInterview } from "@/app/api/interviews/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: RouteContext<"/api/interviews/[id]/signals">) {
  try {
    const { id } = await ctx.params;
    const signals = await listSignalsByInterview(id);
    return Response.json(signals);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function POST(_req: Request, ctx: RouteContext<"/api/interviews/[id]/signals">) {
  try {
    const { id } = await ctx.params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const { data: itv, error: itvErr } = await supabase
      .from("interviews")
      .select("id, questions_md, lowlights, next_action")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (itvErr) throw itvErr;
    if (!itv) return Response.json({ error: "面试不存在" }, { status: 404 });

    await replaceSignalsForInterview(id, []);

    const result = await extractSignalsForInterview({
      interviewId: id,
      questions_md: itv.questions_md || "",
      lowlights: itv.lowlights || "",
      next_action: itv.next_action || "",
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
