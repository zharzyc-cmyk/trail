import { upsertProjectsBulk } from "@/lib/db/projects";

export const runtime = "nodejs";

type Body = { items?: { name?: string; content?: string }[] };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: "items 必须是非空数组" }, { status: 400 });
  }
  const cleaned = body.items
    .map((x) => ({ name: (x?.name || "").trim(), content: (x?.content || "").trim() }))
    .filter((x) => x.name && x.content);
  if (cleaned.length === 0) {
    return Response.json({ error: "所有条目都缺少 name 或 content" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertProjectsBulk(cleaned);
    return Response.json({ inserted, updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
