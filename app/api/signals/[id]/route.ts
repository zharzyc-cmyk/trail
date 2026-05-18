import { updateSignal, deleteSignal, type Signal } from "@/lib/db/signals";

export const runtime = "nodejs";

type PatchBody = Partial<
  Pick<Signal, "project_id" | "quoted_question" | "quoted_lowlight" | "suggestion">
>;

export async function PATCH(req: Request, ctx: RouteContext<"/api/signals/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as PatchBody;

    const patch: PatchBody = {};
    if (body.project_id !== undefined) {
      if (body.project_id !== null && typeof body.project_id !== "string") {
        return Response.json({ error: "project_id 必须是字符串或 null" }, { status: 400 });
      }
      patch.project_id = body.project_id;
    }
    if (typeof body.quoted_question === "string") patch.quoted_question = body.quoted_question;
    if (typeof body.quoted_lowlight === "string") patch.quoted_lowlight = body.quoted_lowlight;
    if (typeof body.suggestion === "string") patch.suggestion = body.suggestion;

    await updateSignal(id, patch);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/signals/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteSignal(id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
