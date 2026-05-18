import { listMyApplications } from "@/lib/db/applications";

export const runtime = "nodejs";

export async function GET() {
  try {
    const list = await listMyApplications();
    return Response.json(list);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}
