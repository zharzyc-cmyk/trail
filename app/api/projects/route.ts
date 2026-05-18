import { listMyProjectsWithSignalCount, createProject } from "@/lib/db/projects";

export const runtime = "nodejs";

export async function GET() {
  try {
    const list = await listMyProjectsWithSignalCount();
    return Response.json(list);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; content?: string };
    if (!body.name || !body.content) {
      return Response.json({ error: "name 和 content 必填" }, { status: 400 });
    }
    const p = await createProject({ name: body.name, content: body.content });
    return Response.json(p);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
