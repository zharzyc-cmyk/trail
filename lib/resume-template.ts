export type ResumeHtmlFragments = {
  coreCompetenciesHtml: string;
  internshipsHtml: string;
};

const TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>{{TITLE}}</title>
<style>
  @page { size: A4; margin: 1.2cm 1.4cm; }
  body { font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif; color: #222; font-size: 9.8pt; line-height: 1.42; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #2563a8; margin-bottom: 10px; }
  .header-text { flex: 1; }
  .name { font-size: 22pt; font-weight: bold; color: #1c3d6e; letter-spacing: 3px; margin: 0; }
  .contact { font-size: 9.8pt; color: #555; margin-top: 4px; }
  .photo { width: 90px; height: 115px; object-fit: cover; margin-left: 20px; border: 1px solid #ddd; }
  h2 { background: #d8e4f1; color: #1c3d6e; padding: 3px 10px; font-size: 11pt; margin-top: 10px; margin-bottom: 5px; border-left: 4px solid #2563a8; }
  .entry-header { display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px; margin-bottom: 2px; font-size: 10pt; color: #1c3d6e; }
  .entry-date { color: #555; font-weight: normal; }
  ul { margin-top: 2px; margin-bottom: 4px; padding-left: 18px; }
  li { margin-bottom: 2px; }
  .bp { font-weight: bold; color: #1c3d6e; }
  strong { color: #c0392b; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>

<div class="header">
  <div class="header-text">
    <div class="name">黄 子 强</div>
    <div class="contact">邮箱：H2459969448@163.com ｜ 电话：15907945713 ｜ 上海 ｜ <strong>可实习 6 个月，立即到岗</strong></div>
  </div>
  <img class="photo" src="{{PHOTO_URL}}" alt="照片">
</div>

<h2>核心能力</h2>
<ul>
{{CORE_COMPETENCIES}}
</ul>

<h2>教育背景</h2>
<div class="entry-header">
  <span>华东师范大学（985）｜数字经济（硕士）</span>
  <span class="entry-date">2026.09 - 2028.06</span>
</div>
<div class="entry-header">
  <span>上海电机学院（一本招生）｜国际经济与贸易（中美合作）</span>
  <span class="entry-date">2022.06 - 2026.09</span>
</div>
<ul>
  <li>GPA <strong>3.85 / 4.5</strong>（前 5%），上海电机学院 2023-2024 二等奖学金、上海市调查分析大赛市二等奖；<span class="bp">主修课程</span>：商务统计、微观经济学、宏观经济学、全英文会计学。</li>
</ul>

<h2>实习经历</h2>

{{INTERNSHIPS}}

<h2>专业技能</h2>
<ul>
  <li><span class="bp">AI 工具</span>：ChatGPT、Deep Seek、Claude（日常重度使用，覆盖内容生产 / 数据分析 / 方案输出）；</li>
  <li><span class="bp">数据分析</span>：SQL（用户行为分析）、SPSS（AB 测试 / 聚类）、Python（GMV 预测模型，准确率 85%）；</li>
  <li><span class="bp">内容生产</span>：剪映、Photoshop（脚本撰写 / 视频剪辑 / 封面设计）；<span class="bp">行业研究</span>：撰写《社区电商内容趋势分析报告》；</li>
  <li><span class="bp">语言</span>：CET6（英文工作语言），全英文课程学习。</li>
</ul>

<script>
  window.addEventListener('load', () => {
    setTimeout(() => window.print(), 400);
  });
</script>

</body>
</html>`;

export function renderResumeHtml(
  fragments: ResumeHtmlFragments,
  opts: { title?: string; photoUrl?: string } = {}
): string {
  const title = opts.title || "黄子强 - 简历";
  const photoUrl = opts.photoUrl || "/photo.jpg";
  return TEMPLATE.replace(/{{TITLE}}/g, escapeAttr(title))
    .replace(/{{PHOTO_URL}}/g, escapeAttr(photoUrl))
    .replace(/{{CORE_COMPETENCIES}}/g, fragments.coreCompetenciesHtml || "")
    .replace(/{{INTERNSHIPS}}/g, fragments.internshipsHtml || "");
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
    }
    return c;
  });
}

export function openPrintWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("浏览器拦截了新窗口，请允许该网站打开弹窗后再试");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
