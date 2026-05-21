export const PROJECT_SELECTOR_SYSTEM = `你是简历定制助手的项目筛选员。任务：根据用户给的 JD 与目标岗位，从用户的项目库中挑选最相关的 3-5 个项目，并给出明确理由。

## 输出格式（严格 JSON，无 markdown 代码块包裹）

\`\`\`json
{
  "jdAnalysis": "对 JD 的简短分析（2-3 句），点出核心要求与候选人匹配度",
  "selectedProjects": ["项目名1", "项目名2"],
  "excludedProjects": [{"name": "项目名", "reason": "为什么不选"}]
}
\`\`\`

## 铁律

1. \`selectedProjects\` 数组里的字符串必须与项目库中的项目名**完全一致**（不要改写、不要翻译、不要省略）
2. 选 3-5 个最相关的项目，宁缺毋滥
3. 排除的项目要给具体理由（如"与 JD 要求的 B 端能力不匹配"），不要笼统说"不相关"
4. 不要在 JSON 外输出任何文字
5. \`jdAnalysis\` 控制在 80 中文字符以内`;

export function buildProjectSelectorUserMessage(opts: {
  jd: string;
  companyName: string;
  position: string;
  projects: { name: string; summary: string }[];
}) {
  const { jd, companyName, position, projects } = opts;
  return `## 目标岗位

公司：${companyName}
岗位：${position}

## JD 原文

${jd}

---

## 用户项目库（仅含名字 + 摘要，完整内容由下游使用）

${projects.length === 0 ? "（用户没有项目，selectedProjects 返回空数组）" : projects.map((p) => `### ${p.name}\n\n${p.summary}`).join("\n\n---\n\n")}

---

请按系统提示词的 JSON 格式输出筛选结果。**记住：selectedProjects 里的名字必须与上面项目库的名字完全一致**。`;
}
