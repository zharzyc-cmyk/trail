"use client";

import { useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

/**
 * 单章节的可编辑展示。用 contentEditable 让用户直接点击文字修改。
 *
 * React 受控 + contentEditable 是个老话题——直接 dangerouslySetInnerHTML 每
 * 次 render 都会重置用户输入，所以这里只在 mount 时初始化 innerHTML，之后
 * 由 DOM 自己维护，onBlur 时同步回 state。父组件如果重新生成简历给了不同
 * 的初始 html，会因 key 变化重新 mount 而拿到新内容。
 *
 * 拖动：左侧的 GripVertical 是唯一 draggable 的元素，避免和 contentEditable
 * 内部文字选中拖动冲突。父组件通过 onDragStart / onDragOverIndex / onDrop
 * 协调多个 EditableSection 之间的顺序。
 */
export function EditableSection({
  title,
  html,
  index,
  draggingIndex,
  dragOverIndex,
  onChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  title: string;
  html: string;
  index: number;
  draggingIndex: number | null;
  dragOverIndex: number | null;
  onChange: (newHtml: string) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
    // 故意只在 mount 时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDragging = draggingIndex === index;
  const isDropTarget =
    dragOverIndex === index && draggingIndex !== null && draggingIndex !== index;

  return (
    <section
      className={`space-y-1.5 rounded transition-all ${
        isDragging ? "opacity-40" : ""
      } ${isDropTarget ? "ring-2 ring-blue-300 ring-offset-2" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter(index);
      }}
      onDragOver={(e) => {
        // 允许 drop 必须 preventDefault
        if (draggingIndex !== null) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
    >
      <div className="flex items-center gap-1">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            // Firefox 需要 setData 才会触发 drag
            e.dataTransfer.setData("text/plain", String(index));
            onDragStart(index);
          }}
          onDragEnd={onDragEnd}
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          title="按住拖动调整章节顺序"
          aria-label="拖动调整章节顺序"
        >
          <GripVertical size={14} />
        </span>
        <h2 className="flex-1 border-l-4 border-[#2563a8] bg-[#d8e4f1] px-3 py-1 text-sm font-semibold text-[#1c3d6e]">
          {title}
        </h2>
      </div>
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
.resume-editable .bp { font-weight: bold; color: #000; }
.resume-editable strong { color: #c0392b; }
.resume-editable ul { margin: 4px 0; padding-left: 18px; }
.resume-editable li { margin-bottom: 3px; }
.resume-editable .entry-header { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; margin-top: 8px; margin-bottom: 2px; color: #1c3d6e; }
.resume-editable .entry-date { color: #555; font-weight: normal; }
`;
