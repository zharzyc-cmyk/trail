import { listSignalsByProject } from "@/lib/db/signals";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/signals">) {
  try {
    const { id } = await ctx.params;
    const signals = await listSignalsByProject(id);
    return Response.json(signals);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
