import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { tryIncrementUsage, rollbackUsage } from "@/lib/db/usage";
import { getMyProfile } from "@/lib/db/profile";
import { listMyProjects } from "@/lib/db/projects";
import {
  PROJECT_SELECTOR_SYSTEM,
  buildProjectSelectorUserMessage,
} from "@/lib/prompts/project-selector";
import {
  SECTION_WRITER_SYSTEM,
  buildSectionWriterUserMessage,
  type SectionPlan,
} from "@/lib/prompts/section-writer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Selector: Sonnet 4.6 for accurate internship/project classification.
// Haiku 4.5 kept mis-categorizing nuanced project content (e.g. an
// internship company's sub-project escaping into the standalone project
// section). Sonnet is slower (~10-15s vs ~3-5s) and pricier (~15x per
// call) but the absolute cost stays under ¥0.15 per generation.
const SELECTOR_MODEL = "claude-sonnet-4-6";
// Tailor (section writer): env-switchable. Default Sonnet 4.6 — now that
// each call only emits ONE section (~500 token output), Sonnet finishes in
// ~10-15s per call, and 5 sections run in parallel → max ≈ 15s.
// Override with TAILOR_MODEL=deepseek-v4-pro / claude-haiku-4-5-20251001 etc.
const TAILOR_MODEL = process.env.TAILOR_MODEL || "claude-sonnet-4-6";

type Selection = {
  jdAnalysis: string;
  atsKeywords?: string[];
  selectedProjects: string[];
  excludedProjects?: { name: string; reason: string }[];
  name?: string;
  contactHtml?: string;
  sectionPlans?: SectionPlan[];
};

type Body = {
  jd: string;
  company: string;
  position: string;
  channel?: string;
};

function createTailorClient(): Anthropic {
  if (TAILOR_MODEL.startsWith("deepseek-")) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("服务端未配置 DEEPSEEK_API_KEY");
    return new Anthropic({ apiKey, baseURL: "https://api.deepseek.com/anthropic" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("服务端未配置 ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
}

function extractSectionTitles(resumeBase: string): string[] {
  return resumeBase
    .split("\n")
    .filter((line) => /^##\s/.test(line))
    .map((line) => line.replace(/^##\s*/, "").trim())
    .filter(Boolean);
}

function sectionsToMarkdown(sections: { title: string; html: string }[]): string {
  return sections
    .map((s) => `## ${s.title}\n\n${stripHtmlToText(s.html)}`)
    .join("\n\n");
}

// 简化的 HTML → 纯文本，仅用于 resumeMarkdown 下载场景的兜底
function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.jd || !body.company || !body.position) {
    return Response.json({ error: "缺少 jd / company / position" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "服务端未配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }

  let usage: Awaited<ReturnType<typeof tryIncrementUsage>>;
  try {
    usage = await tryIncrementUsage(user.id, user.email);
  } catch (e) {
    console.error("[/api/tailor] usage error:", e);
    return Response.json({ error: `读取用户数据失败：${formatDbError(e)}` }, { status: 500 });
  }
  if (!usage.ok) {
    return Response.json(
      { error: `今日用量已达上限（${usage.limit} 次）。明天再试。` },
      { status: 429 }
    );
  }

  let profile: Awaited<ReturnType<typeof getMyProfile>>;
  let projects: Awaited<ReturnType<typeof listMyProjects>>;
  try {
    [profile, projects] = await Promise.all([getMyProfile(), listMyProjects()]);
  } catch (e) {
    console.error("[/api/tailor] profile/projects error:", e);
    await rollbackUsage(user.id, user.email);
    return Response.json({ error: `读取用户数据失败：${formatDbError(e)}` }, { status: 500 });
  }

  const profileText = profile?.self_profile || "";
  const resumeBase = profile?.resume_base || "";

  const sectionTitles = extractSectionTitles(resumeBase);
  if (sectionTitles.length === 0) {
    await rollbackUsage(user.id, user.email);
    return Response.json(
      { error: "基础简历为空或未包含任何 ## 章节标题，请去资料库补全基础简历" },
      { status: 400 }
    );
  }

  // 阶段 1: Anthropic Haiku 一次性输出元信息（jdAnalysis + ATS + 筛项目 + name + contactHtml）
  const selectorClient = new Anthropic({
    apiKey: anthropicKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
  let selection: Selection | null = null;
  if (projects.length > 0 || profileText || resumeBase) {
    try {
      const selectorResp = await selectorClient.messages.create({
        model: SELECTOR_MODEL,
        max_tokens: 1024,
        system: PROJECT_SELECTOR_SYSTEM,
        messages: [
          {
            role: "user",
            content: buildProjectSelectorUserMessage({
              jd: body.jd,
              companyName: body.company,
              position: body.position,
              projects: projects.map((p) => ({ name: p.name, summary: p.content.slice(0, 90) })),
              profile: profileText,
              resumeBase,
              sectionTitles,
            }),
          },
        ],
      });
      console.log("[/api/tailor] selector usage:", {
        input: selectorResp.usage.input_tokens,
        output: selectorResp.usage.output_tokens,
      });
      const text = selectorResp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      selection = JSON.parse(stripCodeFence(text)) as Selection;
    } catch (e) {
      console.error("[/api/tailor] selector failed:", e);
      selection = null;
    }
  }

  const filtered = selection
    ? projects.filter((p) => selection!.selectedProjects.includes(p.name))
    : [];
  const effectiveProjects = filtered.length > 0 ? filtered : projects;

  // 阶段 2: TAILOR_MODEL 并发写每个 section
  let tailorClient: Anthropic;
  try {
    tailorClient = createTailorClient();
  } catch (e) {
    await rollbackUsage(user.id, user.email);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // 1) 拿到 selector 给的 sectionPlans，做代码层硬隔离 + 强制重分类 + skip 处理
  const rawPlans = selection?.sectionPlans ?? [];

  // 1a) 代码层分类：白名单（resumeBase 抽出的实习公司）优先 → 关键词兜底。
  // 即便 selector 分错也能纠正。
  const internshipCompanies = extractInternshipCompanies(resumeBase);
  if (internshipCompanies.length > 0) {
    console.log("[/api/tailor] internship companies whitelist:", internshipCompanies);
  }
  const projectKindByName = new Map<string, "internship" | "project" | "unknown">();
  for (const p of projects) {
    projectKindByName.set(p.name, classifyProjectKind(p.name, p.content, internshipCompanies));
  }

  // 1b) 找到实习经历 / 项目经历两个 plan（按 title 字面）
  const internshipPlan = rawPlans.find((p) => p.title.includes("实习"));
  const projectPlan = rawPlans.find((p) => p.title.includes("项目") && !p.title.includes("实习"));

  // 1c) 把 LLM 在这两段里挑的项目合并去重，按 classifier 强制归类
  if (internshipPlan && projectPlan) {
    const allPicked = new Set<string>([
      ...(internshipPlan.useProjects || []),
      ...(projectPlan.useProjects || []),
    ]);
    const reInternship: string[] = [];
    const reProject: string[] = [];
    for (const name of allPicked) {
      const kind = projectKindByName.get(name);
      if (kind === "internship") reInternship.push(name);
      else if (kind === "project") reProject.push(name);
      else {
        // unknown：尊重 LLM 原决定。优先实习段
        if (internshipPlan.useProjects?.includes(name)) reInternship.push(name);
        else reProject.push(name);
      }
    }
    if (
      JSON.stringify([...(internshipPlan.useProjects || [])].sort()) !==
        JSON.stringify([...reInternship].sort()) ||
      JSON.stringify([...(projectPlan.useProjects || [])].sort()) !==
        JSON.stringify([...reProject].sort())
    ) {
      console.log("[/api/tailor] reclassified by code:", {
        internship_before: internshipPlan.useProjects,
        internship_after: reInternship,
        project_before: projectPlan.useProjects,
        project_after: reProject,
      });
    }
    internshipPlan.useProjects = reInternship;
    projectPlan.useProjects = reProject;
  }

  // 1d) useProjects 去重：按 sectionPlans 数组顺序处理，同一项目只能出现在第一个 section
  // 防止其他 section 也想用同一个项目
  const seenProjects = new Set<string>();
  const dedupedPlans: SectionPlan[] = rawPlans.map((p) => ({
    ...p,
    useProjects: (p.useProjects || []).filter((proj) => {
      if (seenProjects.has(proj)) return false;
      seenProjects.add(proj);
      return true;
    }),
  }));

  // 决定实际要生成的章节顺序：保留 sectionTitles 顺序，过滤掉 skip:true 的
  const plansByTitle = new Map<string, SectionPlan>();
  dedupedPlans.forEach((p) => plansByTitle.set(p.title, p));
  const renderTitles = sectionTitles.filter((title) => {
    const plan = plansByTitle.get(title);
    return !(plan && plan.skip === true);
  });
  const skippedTitles = sectionTitles.filter((t) => !renderTitles.includes(t));
  if (skippedTitles.length > 0) {
    console.log("[/api/tailor] skipped sections (selector marked skip:true):", skippedTitles);
  }

  const tailorStart = Date.now();
  const sectionResults = await Promise.allSettled(
    renderTitles.map((title) =>
      tailorClient.messages.create({
        model: TAILOR_MODEL,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: SECTION_WRITER_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildSectionWriterUserMessage({
                  sectionTitle: title,
                  plan: plansByTitle.get(title),
                  profile: profileText,
                  resumeBase,
                  projects: effectiveProjects.map((p) => ({ name: p.name, content: p.content })),
                  jd: body.jd,
                  companyName: body.company,
                  position: body.position,
                  atsKeywords: selection?.atsKeywords,
                }),
                cache_control: { type: "ephemeral" },
              },
            ],
          },
        ],
      })
    )
  );
  const tailorElapsedMs = Date.now() - tailorStart;

  const sections: { title: string; html: string }[] = [];
  let anyFailed = false;
  sectionResults.forEach((r, i) => {
    const title = renderTitles[i];
    if (r.status === "rejected") {
      console.error(`[/api/tailor] section "${title}" failed:`, r.reason);
      sections.push({ title, html: "" });
      anyFailed = true;
      return;
    }
    const text = r.value.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const html = extractHtml(text);
    if (!html) {
      console.warn(`[/api/tailor] section "${title}" produced no HTML. Raw first 200 chars:`, text.slice(0, 200));
      sections.push({ title, html: "" });
      anyFailed = true;
      return;
    }
    sections.push({ title, html });
  });

  console.log("[/api/tailor] tailor parallel usage:", {
    model: TAILOR_MODEL,
    rendered: renderTitles.length,
    skipped: skippedTitles.length,
    elapsed_ms: tailorElapsedMs,
    per_section: sectionResults.map((r, i) => ({
      title: renderTitles[i],
      ok: r.status === "fulfilled",
      input: r.status === "fulfilled" ? r.value.usage.input_tokens : null,
      output: r.status === "fulfilled" ? r.value.usage.output_tokens : null,
      cache_read: r.status === "fulfilled" ? r.value.usage.cache_read_input_tokens : null,
      cache_creation: r.status === "fulfilled" ? r.value.usage.cache_creation_input_tokens : null,
      stop: r.status === "fulfilled" ? r.value.stop_reason : null,
    })),
  });

  if (sections.every((s) => !s.html)) {
    await rollbackUsage(user.id, user.email);
    return Response.json(
      { error: "所有章节生成失败，请重试" },
      { status: 502 }
    );
  }

  const resumeMarkdown = sectionsToMarkdown(sections);
  const finalSelectedProjects = selection?.selectedProjects ?? [];

  // 延迟保存：不再立刻 createApplication。用户在前端点"保存到投递记录"按钮
  // 时再 POST /api/applications。重新生成不污染 applications 表。
  return Response.json({
    jdAnalysis: selection?.jdAnalysis ?? "",
    atsKeywords: selection?.atsKeywords,
    selectedProjects: finalSelectedProjects,
    excludedProjects: selection?.excludedProjects,
    changeLog: anyFailed ? ["部分章节生成失败，已留空"] : [],
    resumeMarkdown,
    name: selection?.name ?? "",
    contactHtml: selection?.contactHtml ?? "",
    sections,
    photoUrl: profile?.photo_url ?? null,
    usage: { current: usage.current, limit: usage.limit },
  });
}

// 从 resumeBase markdown 抽取 ## 实习经历 段下面所有 ### 公司名 作为白名单。
// 这是用户自己声明的"哪些公司是实习"的事实，最可信。
// regex 兼容多种分隔符（· | ｜ - — ( （）。
function extractInternshipCompanies(resumeBase: string): string[] {
  if (!resumeBase) return [];
  const sectionMatch = resumeBase.match(/##\s*实习经历[\s\S]*?(?=\n##|\n*$)/);
  if (!sectionMatch) return [];
  const sectionContent = sectionMatch[0];
  const companies: string[] = [];
  const lineRegex = /###\s+([^\n]+)/g;
  let m;
  while ((m = lineRegex.exec(sectionContent)) !== null) {
    const firstChunk = m[1].split(/[·|｜\-—(（]/)[0].trim();
    if (firstChunk) companies.push(firstChunk);
  }
  return companies;
}

// 判断项目属于"实习"还是"独立项目"。三级优先级：
// 1) 项目 name / content 命中 resumeBase 抽出的实习公司白名单 → internship（最高优先）
// 2) 命中 internshipPattern 关键词 → internship
// 3) 命中 projectPattern 关键词 → project
// 4) unknown → 让 LLM 自由决定
function classifyProjectKind(
  name: string,
  content: string,
  internshipCompanies: string[]
): "internship" | "project" | "unknown" {
  // 优先级 1：白名单命中（用户在 resumeBase 实习段明确列出的公司）
  for (const company of internshipCompanies) {
    if (!company) continue;
    if (name.includes(company) || content.includes(company)) return "internship";
  }
  // 优先级 2-3：关键词
  const text = `${name} ${content}`.toLowerCase();
  const internshipPattern =
    /实习生|实习期间|实习经历|担任\s*[^，。\n]*实习|用户运营|内容运营|产品运营|产品助理|品牌运营|渠道运营|社区运营|商务实习|市场实习|运营实习/;
  const projectPattern =
    /比赛|大赛|竞赛|获奖|金奖|银奖|铜奖|论文|学术成果|课题|课程项目|独立开发|独立项目|个人项目|开源|hackathon|创业项目|毕业设计|科研/;
  if (internshipPattern.test(text)) return "internship";
  if (projectPattern.test(text)) return "project";
  return "unknown";
}

function formatDbError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [o.message, o.code && `code=${o.code}`, o.details, o.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  return e instanceof Error ? e.message : String(e);
}

function stripCodeFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
  }
  t = t.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) return t.slice(start, end + 1);
  return t;
}

// 从 LLM 输出中提取裸 HTML 片段。模型偶尔会包代码块、加 {"html":...} 包装、
// 或在前后加自然语言解释。尽量兼容多种格式，最后兜底截取第一个 < 到最后一个 >。
function extractHtml(raw: string): string {
  let t = raw.trim();
  // 1. 去 markdown 代码块（```html / ``` / ```json 等）
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
    t = t.trim();
  }
  // 2. 若误用 JSON 包装 {"html": "..."}，尝试 parse 抽 html 字段
  if (t.startsWith("{") && t.includes('"html"')) {
    try {
      const obj = JSON.parse(t) as { html?: string };
      if (typeof obj.html === "string" && obj.html.trim()) return obj.html.trim();
    } catch {
      // parse 失败就 fallthrough 走截取
    }
  }
  // 3. 截取第一个 < 到最后一个 >
  const start = t.indexOf("<");
  const end = t.lastIndexOf(">");
  if (start !== -1 && end > start) return t.slice(start, end + 1).trim();
  return "";
}
