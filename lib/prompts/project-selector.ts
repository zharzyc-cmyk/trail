export const PROJECT_SELECTOR_SYSTEM = `你是简历定制助手的「前置分析员」。任务：根据用户给的 JD 与目标岗位，**一次性完成 3 件事**：
1. 对 JD 做简短分析
2. 从 JD 原文抽取 8-12 个核心 ATS 关键词
3. 从用户的项目库中挑选最相关的 3-5 个项目

## 输出格式（严格 JSON，无 markdown 代码块包裹）

\`\`\`json
{
  "jdAnalysis": "对 JD 的简短分析（2-3 句），点出核心要求与候选人匹配度",
  "atsKeywords": ["关键词1", "关键词2", "..."],
  "selectedProjects": ["项目名1", "项目名2"],
  "excludedProjects": [{"name": "项目名", "reason": "为什么不选"}]
}
\`\`\`

## 铁律

1. \`atsKeywords\` 必须 8-12 个，**完整复刻 JD 原文用词**（如 JD 写"用户增长"就别改成"获客"；写"AI Coding"就别改成"AI 编程"）。优先选：技能名、工具名、行业术语、岗位职责动词
2. \`selectedProjects\` 数组里的字符串必须与项目库中的项目名**完全一致**（不要改写、不要翻译、不要省略）
3. 选 3-5 个最相关的项目，宁缺毋滥
4. 排除的项目要给具体理由（如"与 JD 要求的 B 端能力不匹配"），不要笼统说"不相关"
5. 不要在 JSON 外输出任何文字
6. \`jdAnalysis\` 控制在 80 中文字符以内`;

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
