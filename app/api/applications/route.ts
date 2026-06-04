import { createApplication, listMyApplications } from "@/lib/db/applications";

export const runtime = "nodejs";

export async function GET() {
  try {
    const list = await listMyApplications();
    return Response.json(list);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: {
    company?: string;
    position?: string;
    channel?: string;
    jd?: string;
    selectedProjects?: string[];
    resumeMarkdown?: string;
    sections?: { title: string; html: string }[];
    name?: string;
    contactHtml?: string;
    photoUrl?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.company || !body.position || !body.jd) {
    return Response.json({ error: "缺少 company / position / jd" }, { status: 400 });
  }
  try {
    const app = await createApplication({
      company: body.company,
      position: body.position,
      channel: body.channel || "",
      jd: body.jd,
      selected_projects: body.selectedProjects || [],
      resume_markdown: body.resumeMarkdown || "",
      sections: body.sections,
      name: body.name,
      contact_html: body.contactHtml,
      photo_url: body.photoUrl ?? null,
    });
    return Response.json({ id: app.id });
  } catch (e) {
    console.error("[POST /api/applications] failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 500 }
    );
  }
}
