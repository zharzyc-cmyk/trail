import { getMyTodayUsage } from "@/lib/db/usage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await getMyTodayUsage();
    return Response.json(u);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}
