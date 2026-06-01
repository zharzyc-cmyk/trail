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
 * 布局：
 * - 容器自身 relative。grip 用 absolute 浮在左侧 -28px，不占布局空间，
 *   确保 section 的 h2 + body 与上层 header（姓名/联系方式）左对齐。
 * - hover section 时右上角浮出格式工具栏（加粗 .bp / 数据 strong / 清除），
 *   按钮 onMouseDown preventDefault 避免 contentEditable 失焦丢失选区。
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

  // 工具栏操作：把当前选区包裹到指定 tag/className 里。execCommand 已过时，
  // 用 Range API 直接操作 DOM。包装后立刻 read innerHTML 同步给父组件。
  function wrapSelection(tag: string, className?: string) {
    const editable = ref.current;
    if (!editable) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return;
    const wrapper = document.createElement(tag);
    if (className) wrapper.className = className;
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      sel.removeAllRanges();
      onChange(editable.innerHTML);
    } catch (e) {
      console.error("[wrapSelection]", e);
    }
  }

  // 清除选区内的格式包装：把选区内所有 span.bp / strong 用 textContent 替换
  function unwrapSelection() {
    const editable = ref.current;
    if (!editable) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return;
    const text = range.toString();
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    sel.removeAllRanges();
    onChange(editable.innerHTML);
  }

  return (
    <section
      className={`group relative space-y-1.5 rounded transition-all ${
        isDragging ? "opacity-40" : ""
      } ${isDropTarget ? "ring-2 ring-blue-300 ring-offset-2" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter(index);
      }}
      onDragOver={(e) => {
        if (draggingIndex !== null) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
    >
      {/* 拖动把手 — absolute，不占布局空间 */}
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
          onDragStart(index);
        }}
        onDragEnd={onDragEnd}
        className="absolute -left-7 top-1.5 flex h-6 w-6 cursor-grab items-center justify-center rounded text-zinc-400 opacity-50 transition-opacity hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 active:cursor-grabbing"
        title="按住拖动调整章节顺序"
        aria-label="拖动调整章节顺序"
      >
        <GripVertical size={14} />
      </span>

      {/* 格式工具栏 — hover section 时浮在右上角 */}
      <div
        className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border border-zinc-200 bg-white/95 px-1.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={() => wrapSelection("span", "bp")}
          className="rounded px-1.5 py-0.5 text-[11px] font-bold text-zinc-900 hover:bg-zinc-100"
          title="将选中文字加粗（黑色）"
        >
          加粗
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("strong")}
          className="rounded px-1.5 py-0.5 text-[11px] font-bold text-[#c0392b] hover:bg-zinc-100"
          title="将选中文字标为数据点（红色加粗）"
        >
          数据
        </button>
        <span className="h-3 w-px bg-zinc-200" />
        <button
          type="button"
          onClick={unwrapSelection}
          className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100"
          title="清除选中文字的格式"
        >
          清除
        </button>
      </div>

      <h2 className="border-l-4 border-[#2563a8] bg-[#d8e4f1] px-3 py-1 text-sm font-semibold text-[#1c3d6e]">
        {title}
      </h2>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="resume-editable rounded border border-transparent px-2 py-1 text-zinc-800 hover:border-zinc-200 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
