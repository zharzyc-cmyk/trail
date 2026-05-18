"use client";

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

type ParsedLine =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "bullet"; text: string }
  | { type: "hr" }
  | { type: "blank" }
  | { type: "p"; text: string };

function parseMarkdown(md: string): ParsedLine[] {
  const lines = md.split(/\r?\n/);
  return lines.map((raw): ParsedLine => {
    const line = raw.trimEnd();
    if (line === "") return { type: "blank" };
    if (/^---+$/.test(line)) return { type: "hr" };
    if (line.startsWith("### ")) return { type: "h3", text: line.slice(4) };
    if (line.startsWith("## ")) return { type: "h2", text: line.slice(3) };
    if (line.startsWith("# ")) return { type: "h1", text: line.slice(2) };
    if (/^[-*] /.test(line)) return { type: "bullet", text: line.slice(2) };
    return { type: "p", text: line };
  });
}

function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index) }));
    runs.push(new TextRun({ text: m[1].slice(2, -2), bold: true }));
    last = m.index + m[1].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }));
  return runs.length ? runs : [new TextRun({ text })];
}

export async function downloadDocx(markdown: string, filename: string) {
  const parsed = parseMarkdown(markdown);
  const children: Paragraph[] = [];

  for (const line of parsed) {
    if (line.type === "blank" || line.type === "hr") {
      children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      continue;
    }
    if (line.type === "h1") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: line.text, bold: true, size: 36 })],
        })
      );
      continue;
    }
    if (line.type === "h2") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.text, bold: true, size: 28 })],
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }
    if (line.type === "h3") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: line.text, bold: true, size: 24 })],
          spacing: { before: 160, after: 80 },
        })
      );
      continue;
    }
    if (line.type === "bullet") {
      children.push(
        new Paragraph({
          children: inlineRuns(line.text),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        children: inlineRuns(line.text),
        spacing: { after: 80 },
      })
    );
  }

  const doc = new Document({
    creator: "求职轨迹",
    title: filename,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);
}
