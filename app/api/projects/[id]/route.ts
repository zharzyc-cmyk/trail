import { updateProject, deleteProject } from "@/lib/db/projects";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: string; content?: string };
    await updateProject(id, body);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteProject(id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
