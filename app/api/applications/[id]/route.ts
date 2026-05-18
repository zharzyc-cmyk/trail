import { updateApplicationStatus, deleteApplication, type ApplicationStatus } from "@/lib/db/applications";

export const runtime = "nodejs";

const ALLOWED: ApplicationStatus[] = [
  "已生成",
  "已投递",
  "笔试",
  "一面",
  "二面",
  "HR面",
  "Offer",
  "拒信",
  "已读不回",
];

export async function PATCH(req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: ApplicationStatus };
    if (!body.status || !ALLOWED.includes(body.status)) {
      return Response.json({ error: "status 不合法" }, { status: 400 });
    }
    await updateApplicationStatus(id, body.status);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteApplication(id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
