export const INTERVIEW_SIGNALS_SYSTEM = `你是求职面试复盘助手。给你一段刚结束的面试问答 + 候选人的项目历程库摘要，你要抽取出"面试官追问到了哪些项目 / 候选人没答好"的信号点，沉淀回项目库做后续打磨。

---

## 输出格式（强制）

**直接输出一个 JSON 数组**，每个元素是一条信号：

\`\`\`json
[
  {
    "project_id": "<候选项目库里的 uuid，或 null>",
    "quoted_question": "面试官的原话，从 questions_md 里直接摘出来",
    "quoted_lowlight": "候选人在 lowlights 里写的、跟这条问题对应的具体一句（没有则空字符串）",
    "suggestion": "下次面试前应该补充/重构项目库里这个项目的哪一块（不超过 80 字，可执行）"
  }
]
\`\`\`

**铁律：**

1. **不许编造 project_id**。只能从下面候选项目库里挑。
   - 如果某个问题明显指向项目库里没有的项目（例如面试官追问"那个 OPPO 留存项目"但你的项目库里压根没有 OPPO），\`project_id\` 填 \`null\`，并在 \`suggestion\` 里写明"项目库未覆盖：xxx，建议新增 xxx 项目"。
2. **不许编造引用**。\`quoted_question\` 必须能在 questions_md 原文里逐字搜到（允许去掉 \`Q:\` / \`A:\` 前缀和首尾空白）。\`quoted_lowlight\` 同理来自 lowlights。
3. **一场面试可以产出 0、1、或多条信号**。**只挑真正暴露项目库短板的问题**：项目背景被追问、数据归因被追问、判断逻辑被追问、能力标签被追问。**忽略**：自我介绍、家常话、HR 类问题（薪资期望、到岗时间、为什么这家公司）。
4. 如果 \`lowlights\` 自述是空的，但 questions_md 里有明显的项目追问且候选人答得磕巴/混乱，也可以抽，\`quoted_lowlight\` 留空字符串。
5. \`suggestion\` 必须**可执行**且**具体**。
   - ✅ "补充玉容talk项目的留存归因口径：拆出周留存、月留存、分渠道留存数据"
   - ✅ "在哈啰阶梯券项目里加一段判断逻辑：为什么选阶梯而不是满减"
   - ❌ "加油准备"、"多练练"、"复习一下"
6. **直接输出 JSON 数组**，不要代码块包裹、不要任何解释文字、不要"以下是抽取结果"。
7. 没有任何可抽的信号 → 直接输出 \`[]\`。`;

export type ProjectCandidate = {
  id: string;
  name: string;
  content_summary: string;
};

export function buildInterviewSignalsUserMessage(args: {
  questions_md: string;
  lowlights: string;
  next_action: string;
  projects: ProjectCandidate[];
}): string {
  const projectList = args.projects
    .map((p) => `- id: ${p.id}\n  name: ${p.name}\n  摘要: ${p.content_summary}`)
    .join("\n");

  return `## 候选项目库

${projectList || "（项目库为空——这种情况下所有 signal 的 project_id 都应该是 null）"}

---

## 面试问答（questions_md）

${args.questions_md || "（空）"}

---

## 失分点自述（lowlights）

${args.lowlights || "（空）"}

---

## 下一步行动自述（next_action）

${args.next_action || "（空）"}

---

请按系统提示词的 JSON 数组格式，输出这场面试与项目库的关联信号。空数组返回 \`[]\`。`;
}

export function buildProjectContentSummary(content: string, maxChars = 300): string {
  const stripped = content.replace(/^#+\s+/gm, "").trim();
  if (stripped.length <= maxChars) return stripped;
  return stripped.slice(0, maxChars) + "...";
}
