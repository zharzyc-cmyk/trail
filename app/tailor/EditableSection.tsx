"use client";

import { useEffect, useRef } from "react";

/**
 * 单章节的可编辑展示。用 contentEditable 让用户直接点击文字修改。
 *
 * React 受控 + contentEditable 是个老话题——直接 dangerouslySetInnerHTML 每
 * 次 render 都会重置用户输入，所以这里只在 mount 时初始化 innerHTML，之后
 * 由 DOM 自己维护，onBlur 时同步回 state。父组件如果重新生成简历给了不同
 * 的初始 html，会因 key 变化重新 mount 而拿到新内容。
 */
export function EditableSection({
  title,
  html,
  onChange,
}: {
  title: string;
  html: string;
  onChange: (newHtml: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
    // 故意只在 mount 时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-1.5">
      <h2 className="border-l-4 border-[#2563a8] bg-[#d8e4f1] px-3 py-1 text-sm font-semibold text-[#1c3d6e]">
        {title}
      </h2>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="resume-editable rounded border border-transparent px-2 py-1 text-sm leading-relaxed text-zinc-800 hover:border-zinc-200 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
        onBlur={(e) => {
          const next = e.currentTarget.innerHTML.trim();
          if (next !== html) onChange(next);
        }}
      />
    </section>
  );
}

/**
 * 全局样式片段。复刻 PDF 模板里的颜色规则，让浏览器预览的视觉和最终 PDF
 * 尽可能接近。挂在 tailor 页一份就行。
 */
export const EDITABLE_SECTION_STYLES = `
.resume-editable .bp { font-weight: bold; color: #1c3d6e; }
.resume-editable strong { color: #c0392b; }
.resume-editable ul { margin: 4px 0; padding-left: 18px; }
.resume-editable li { margin-bottom: 3px; }
.resume-editable .entry-header { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; margin-top: 8px; margin-bottom: 2px; color: #1c3d6e; }
.resume-editable .entry-date { color: #555; font-weight: normal; }
`;
