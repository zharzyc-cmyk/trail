import { getMyProfile, saveMyProfile } from "@/lib/db/profile";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile = await getMyProfile();
    if (!profile) return Response.json({ error: "未登录" }, { status: 401 });
    return Response.json(profile);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      self_profile?: string;
      resume_base?: string;
      photo_url?: string | null;
    };
    await saveMyProfile(body);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "失败";
    const status = msg === "未登录" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
