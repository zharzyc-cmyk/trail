import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { tryIncrementUsage } from "@/lib/db/usage";
import { listMyProjects } from "@/lib/db/projects";
import { getMyProfile } from "@/lib/db/profile";
import {
  RESUME_IMPORT_SYSTEM,
  buildResumeImportUserMessage,
} from "@/lib/prompts/projects-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;

type SupportedKind = "pdf" | "docx" | "html";

function detectKind(file: File): SupportedKind | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (name.endsWith(".docx") || type.includes("officedocument.wordprocessingml")) return "docx";
  if (name.endsWith(".html") || name.endsWith(".htm") || type.includes("html")) return "html";
  return null;
}

async function extractFromPdf(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

async function extractFromDocx(buf: Uint8Array): Promise<string> {
  // mammoth 接受 Node Buffer
  const buffer = Buffer.from(buf);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

function extractFromHtml(buf: Uint8Array): string {
  const html = new TextDecoder("utf-8").decode(buf);
  // 先 strip script / style 整段，再去所有标签
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  // decode 常见 HTML entities
  const decoded = stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&[a-z]+;/gi, " "); // 兜底，未知 entity 替成空格
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}

type ImportedProject = { name: string; content: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "请求体不是合法的 multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  const kind = detectKind(file);
  if (!kind) {
    return Response.json({ error: "只支持 PDF / DOCX / HTML 三种格式" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 8 MB` },
      { status: 400 }
    );
  }

  const usage = await tryIncrementUsage(user.id, user.email);
  if (!usage.ok) {
    return Response.json(
      { error: `今日用量已达上限（${usage.limit} 次）。明天再试。` },
      { status: 429 }
    );
  }

  let resumeText: string;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (kind === "pdf") resumeText = await extractFromPdf(buf);
    else if (kind === "docx") resumeText = await extractFromDocx(buf);
    else resumeText = extractFromHtml(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `${kind.toUpperCase()} 解析失败：${msg}` }, { status: 400 });
  }

  if (!resumeText) {
    const hint =
      kind === "pdf"
        ? "PDF 没有可提取的文本（常见于「可画」/ Canva 等设计工具导出的 PDF）。请用文本版简历或 Word 导出的 PDF 重试。"
        : kind === "docx"
        ? "DOCX 没有可提取的文本。请确认文件内容非空，或试试导出为 PDF 再上传。"
        : "HTML 没有可提取的文本。请确认文件含正文内容。";
    return Response.json({ error: hint }, { status: 400 });
  }
  const truncated = resumeText.length > MAX_TEXT_CHARS;
  if (truncated) resumeText = resumeText.slice(0, MAX_TEXT_CHARS);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "服务端未配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  const client = new Anthropic({ apiKey, baseURL });

  let parsed: { profile: string; resumeBase: string; projects: ImportedProject[] };
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: RESUME_IMPORT_SYSTEM,
      messages: [{ role: "user", content: buildResumeImportUserMessage(resumeText) }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const cleaned = stripCodeFence(text);
    let obj: { profile?: unknown; resumeBase?: unknown; projects?: unknown };
    try {
      obj = JSON.parse(cleaned);
    } catch (parseErr) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      // 临时调试：返回 raw 文本附近的字符，方便定位语法错误
      const m = /position (\d+)/.exec(parseMsg);
      const pos = m ? Number(m[1]) : -1;
      const window = pos >= 0 ? cleaned.slice(Math.max(0, pos - 100), pos + 100) : cleaned.slice(0, 300);
      return Response.json(
        {
          error: `JSON 解析失败：${parseMsg}\n附近内容: ${window}`,
          rawPreview: cleaned.slice(0, 800),
        },
        { status: 502 }
      );
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error("not an object");
    }
    const projectsRaw = Array.isArray(obj.projects) ? obj.projects : [];
    const projects = projectsRaw
      .filter(
        (x: unknown): x is ImportedProject =>
          Boolean(
            x &&
              typeof x === "object" &&
              typeof (x as ImportedProject).name === "string" &&
              typeof (x as ImportedProject).content === "string"
          )
      )
      .map((x: ImportedProject) => ({ name: x.name.trim(), content: x.content.trim() }))
      .filter((x: ImportedProject) => x.name && x.content);
    parsed = {
      profile: typeof obj.profile === "string" ? obj.profile.trim() : "",
      resumeBase: typeof obj.resumeBase === "string" ? obj.resumeBase.trim() : "",
      projects,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|invalid_api_key|authentication/i.test(msg)) {
      return Response.json({ error: "服务端 Anthropic Key 失效，请联系管理员" }, { status: 500 });
    }
    return Response.json({ error: `AI 抽取失败：${msg}` }, { status: 502 });
  }

  if (!parsed.profile && !parsed.resumeBase && parsed.projects.length === 0) {
    return Response.json(
      { error: "AI 没识别出任何内容，请检查 PDF 文本或手动添加" },
      { status: 422 }
    );
  }

  const [existingProfile, existingProjects] = await Promise.all([
    getMyProfile(),
    listMyProjects(),
  ]);
  const existingNames = new Set(existingProjects.map((p) => p.name.trim()));

  return Response.json({
    profile: {
      value: parsed.profile,
      existingNonEmpty: Boolean(existingProfile?.self_profile?.trim()),
    },
    resumeBase: {
      value: parsed.resumeBase,
      existingNonEmpty: Boolean(existingProfile?.resume_base?.trim()),
    },
    projects: parsed.projects.map((p) => ({
      ...p,
      exists: existingNames.has(p.name),
    })),
    truncated,
    usage: { current: usage.current, limit: usage.limit },
  });
}

function stripCodeFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
  }
  t = t.trim();
  // Claude 偶尔会在 JSON 前后加说明文字（"以下是结果：" 之类），
  // 截取第一个 { 到最后一个 } 之间的内容作为 JSON 主体。
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}
