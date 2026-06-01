export const SECTION_WRITER_SYSTEM = `你是简历定制助手的章节写作员。任务：根据用户的资料库、目标 JD、**以及总指挥下达的本章节执行指令**，只生成 user 消息指定的那一个章节的 HTML 片段。

---

## 核心原则

- 所有项目细节必须来自项目历程库，不允许凭空编造
- 姓名、邮箱、电话、城市、教育背景、技能列表等基础信息**必须来自用户的 Profile / 基础简历**，不允许编造任何信息
- 每次只生成 user 指定的**一个章节**，不要生成其他章节
- 输出**不包含外层 <h2> 标题**（标题由模板渲染），只输出该章节内部的 HTML 片段

## 总指挥指令铁律（最重要）

user 消息会给你一份本章节的执行指令（来自前置总指挥）：

\`\`\`
maxBullets: N            # 最多 N 条 bullet
maxCharsPerBullet: M     # 每条 bullet 最多 M 个中文字符
useProjects: [...]       # 只能用这些项目的内容（实习经历 / 项目经历章节特有）
instruction: "..."       # 具体写作指令（包含与其他章节的去重要求）
\`\`\`

**严格遵守**：
- bullet 数量 ≤ maxBullets（多了你的章节会让总简历溢出 2 页）
- 单条 bullet ≤ maxCharsPerBullet
- 若 useProjects 非空：**只能用列表里的项目**，其他项目即使再相关也不写（它们归属于别的章节）
- 若 useProjects 为空（核心能力 / 教育背景 / 专业技能等）：按 instruction 自由发挥

## ATS 关键词

user 消息会给你一份"ATS 关键词"列表。**本章节嵌入其中 2-3 个相关的即可**（不必塞满 — 5 个章节共同承担覆盖率），字面照搬 JD 原文用词。

## HTML 高亮约定

- 数据点（百分比、金额、数量、排名）用 \`<strong>\`，渲染红色，例：\`<strong>421W+</strong>\`、\`<strong>30%</strong>\`
- 关键术语 / 标签用 \`<span class="bp">\`，渲染蓝色加粗
- 单个 bullet 典型结构：\`<li><span class="bp">小标题</span>：正文描述，含 <strong>数据点</strong>。</li>\`
- **实习经历** 段：每段公司用 \`<div class="entry-header"><span>公司名｜岗位</span><span class="entry-date">YYYY.MM - YYYY.MM</span></div>\`，紧接 \`<ul><li>...</li></ul>\`，多家按时间倒序
- **教育背景** 同理用 entry-header + 可选 ul
- **核心能力 / 专业技能 / 项目经历**：直接 \`<ul><li>...</li></ul>\` 列表（项目经历也用 entry-header 也可）
- **不要**在输出里写外层 \`<h2>\`、\`<style>\`、\`<html>\`

---

## 输出格式（裸 HTML 片段，不要 JSON 包装，不要 markdown 代码块）

直接输出该章节的 HTML 字符串，例如：

\`\`\`
<ul><li><span class="bp">小标题</span>：正文，<strong>数据点</strong>。</li></ul>
\`\`\`

或 entry-header 类型：

\`\`\`
<div class="entry-header"><span>公司｜岗位</span><span class="entry-date">2024.07 - 2024.09</span></div>
<ul><li>...</li></ul>
\`\`\`

**铁律**：
- 不要 \`{"html": "..."}\` 之类的 JSON 包装
- 不要 \`\`\`html ... \`\`\` 代码块
- 不要任何解释、前后缀
- 简历原文里的中文短语引号用 \`「」\` 而非半角引号，避免与 HTML 属性引号混淆
- 第一个字符就是 \`<\`，最后一个字符就是 \`>\``;

export type SectionPlan = {
  title: string;
  maxBullets: number;
  maxCharsPerBullet: number;
  useProjects: string[];
  instruction: string;
};

export function buildSectionWriterUserMessage(opts: {
  sectionTitle: string;
  plan?: SectionPlan;
  profile: string;
  resumeBase: string;
  projects: { name: string; content: string }[];
  jd: string;
  companyName: string;
  position: string;
  atsKeywords?: string[];
}) {
  const {
    sectionTitle,
    plan,
    profile,
    resumeBase,
    projects,
    jd,
    companyName,
    position,
    atsKeywords,
  } = opts;

  const keywordsBlock =
    atsKeywords && atsKeywords.length > 0
      ? `## ATS 关键词（本章节自然嵌入 2-3 个相关的，字面照搬）

${atsKeywords.join("、")}

`
      : "";

  const planBlock = plan
    ? `## 总指挥下达的本章节执行指令（必须严格遵守）

- **maxBullets**: ${plan.maxBullets === 0 ? "不限单条（按 instruction 走）" : plan.maxBullets}
- **maxCharsPerBullet**: ${plan.maxCharsPerBullet} 中文字符
- **useProjects**: ${plan.useProjects.length === 0 ? "（不限定项目）" : `**只能用这些项目** [${plan.useProjects.join(", ")}]，其他项目即使相关也不写`}
- **instruction**: ${plan.instruction}

`
    : "";

  // 如果 plan 有 useProjects 限定，project library 过滤一下减小 input
  const effectiveProjects =
    plan && plan.useProjects.length > 0
      ? projects.filter((p) => plan.useProjects.includes(p.name))
      : projects;

  return `## 目标章节

**${sectionTitle}** — 你只需要生成这一个章节的 HTML 片段

${planBlock}## 目标岗位

公司：${companyName}
岗位：${position}

${keywordsBlock}## JD 原文

${jd}

---

## 用户个人 Profile

${profile || "（未提供）"}

## 用户基础简历（请参考对应章节的内容 / 风格）

${resumeBase || "（未提供）"}

## 项目库${plan && plan.useProjects.length > 0 ? `（已按总指挥指令筛选为 useProjects）` : `（已由前置分析员筛选）`}

${effectiveProjects.length === 0 ? "（无）" : effectiveProjects.map((p) => `### ${p.name}\n\n${p.content}`).join("\n\n---\n\n")}

---

直接输出 **${sectionTitle} 章节的内部 HTML 片段**，第一个字符必须是 \`<\`，不要 JSON、不要代码块、不要解释。`;
}
