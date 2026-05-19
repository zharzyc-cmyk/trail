export type TailoredResume = {
  name: string;
  contactHtml: string;
  photoUrl: string | null;
  sections: { title: string; html: string }[];
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
  .section-body { margin-bottom: 4px; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>

<div class="header">
  <div class="header-text">
    <div class="name">{{NAME}}</div>
    <div class="contact">{{CONTACT}}</div>
  </div>
  {{PHOTO}}
</div>

{{SECTIONS}}

<script>
  window.addEventListener('load', () => {
    setTimeout(() => window.print(), 400);
  });
</script>

</body>
</html>`;

export function renderResumeHtml(
  resume: TailoredResume,
  opts: { title?: string } = {}
): string {
  const title = opts.title || `${resume.name || "简历"} - 简历`;
  const photoTag = resume.photoUrl
    ? `<img class="photo" src="${escapeAttr(resume.photoUrl)}" alt="照片">`
    : "";
  const sectionsHtml = resume.sections
    .map(
      (s) =>
        `<h2>${escapeText(s.title)}</h2>\n<div class="section-body">${s.html}</div>`
    )
    .join("\n");
  return TEMPLATE.replace(/{{TITLE}}/g, escapeAttr(title))
    .replace(/{{NAME}}/g, escapeText(resume.name || ""))
    .replace(/{{CONTACT}}/g, resume.contactHtml || "")
    .replace(/{{PHOTO}}/g, photoTag)
    .replace(/{{SECTIONS}}/g, sectionsHtml);
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

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
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
