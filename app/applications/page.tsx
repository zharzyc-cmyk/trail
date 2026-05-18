"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { downloadDocx } from "@/lib/docx";
import { cn } from "@/lib/utils";

type ApplicationStatus =
  | "已生成"
  | "已投递"
  | "笔试"
  | "一面"
  | "二面"
  | "HR面"
  | "Offer"
  | "拒信"
  | "已读不回";

type Application = {
  id: string;
  company: string;
  position: string;
  channel: string;
  jd: string;
  selected_projects: string[];
  resume_markdown: string;
  status: ApplicationStatus;
  created_at: string;
};

const STATUS_OPTIONS: ApplicationStatus[] = [
  "已生成",
  "已投递",
  "笔试",
  "一面",
  "二面",
  "HR面",
  "Offer",
  "拒信",
  "已读不回",
];

const BOARD_ACTIVE: ApplicationStatus[] = ["已生成", "已投递", "笔试", "一面", "二面", "HR面"];
const BOARD_CLOSED: ApplicationStatus[] = ["Offer", "拒信", "已读不回"];

const COLUMN_STYLES: Record<ApplicationStatus, string> = {
  已生成: "border-zinc-200",
  已投递: "border-zinc-200",
  笔试: "border-zinc-200",
  一面: "border-zinc-200",
  二面: "border-zinc-200",
  HR面: "border-amber-300",
  Offer: "border-emerald-400 bg-emerald-50/40",
  拒信: "border-red-300 bg-red-50/30",
  已读不回: "border-zinc-300 bg-zinc-50",
};

const NEXT_ROUND: Record<ApplicationStatus, string> = {
  已生成: "一面",
  已投递: "一面",
  笔试: "一面",
  一面: "二面",
  二面: "HR面",
  HR面: "终面",
  Offer: "自由",
  拒信: "自由",
  已读不回: "自由",
};

function nextRound(status: ApplicationStatus): string {
  return NEXT_ROUND[status] || "一面";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (d <= 0) return "今天";
  if (d === 1) return "昨天";
  if (d < 30) return `${d} 天前`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} 个月前`;
  return `${Math.floor(d / 365)} 年前`;
}

type View = "list" | "board";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [dragOverCol, setDragOverCol] = useState<ApplicationStatus | null>(null);

  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setApps(d);
        setLoading(false);
      });
  }, []);

  async function setStatus(id: string, status: ApplicationStatus) {
    const prev = apps;
    setApps((cur) => cur.map((a) => (a.id === id ? { ...a, status } : a)));
    const r = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) setApps(prev);
  }

  async function removeApp(id: string) {
    const prev = apps;
    setApps(apps.filter((a) => a.id !== id));
    const r = await fetch(`/api/applications/${id}`, { method: "DELETE" });
    if (!r.ok) setApps(prev);
  }

  async function downloadResume(app: Application) {
    const today = new Date(app.created_at).toISOString().slice(0, 10).replace(/-/g, "");
    const fname = `${app.company}_${app.position}_${today}.docx`.replace(/[/\\?%*:|"<>]/g, "_");
    await downloadDocx(app.resume_markdown, fname);
  }

  const byStatus = useMemo(() => {
    const m: Record<ApplicationStatus, Application[]> = {
      已生成: [],
      已投递: [],
      笔试: [],
      一面: [],
      二面: [],
      HR面: [],
      Offer: [],
      拒信: [],
      已读不回: [],
    };
    for (const a of apps) m[a.status].push(a);
    return m;
  }, [apps]);

  function onCardDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onColumnDragOver(e: React.DragEvent, col: ApplicationStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== col) setDragOverCol(col);
  }
  function onColumnDragLeave(col: ApplicationStatus) {
    if (dragOverCol === col) setDragOverCol(null);
  }
  function onColumnDrop(e: React.DragEvent, col: ApplicationStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const cur = apps.find((a) => a.id === id);
    if (!cur || cur.status === col) return;
    setStatus(id, col);
  }

  if (loading) return <div className="text-sm text-zinc-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">投递记录</h1>
          <p className="mt-2 text-zinc-600">所有定制过的简历自动记录在这里</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-200 p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                view === "list" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              列表
            </button>
            <button
              onClick={() => setView("board")}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                view === "board" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              看板
            </button>
          </div>
          <Link href="/tailor">
            <Button>新建投递</Button>
          </Link>
        </div>
      </div>

      {apps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-zinc-500">
            还没有任何投递记录。去{" "}
            <Link href="/tailor" className="underline">
              简历定制
            </Link>{" "}
            生成第一份。
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <div className="space-y-3">
          {apps.map((app) => {
            const open = openId === app.id;
            return (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {app.company} · {app.position}
                      </CardTitle>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(app.created_at).toLocaleString()} · 渠道：{app.channel || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={app.status}
                        onChange={(e) => setStatus(app.id, e.target.value as ApplicationStatus)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="outline" onClick={() => setOpenId(open ? null : app.id)}>
                        {open ? "收起" : "详情"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {open && (
                  <CardContent className="space-y-3">
                    <div>
                      <Label>选中的项目</Label>
                      <p className="mt-1 text-sm text-zinc-700">
                        {app.selected_projects.join("、") || "—"}
                      </p>
                    </div>
                    <div>
                      <Label>JD 原文</Label>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs">
                        {app.jd}
                      </pre>
                    </div>
                    <div>
                      <Label>简历 markdown</Label>
                      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 font-mono text-xs">
                        {app.resume_markdown}
                      </pre>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => downloadResume(app)}>
                        重新下载 .docx
                      </Button>
                      <Link href={`/interviews?app=${app.id}&round=${nextRound(app.status)}`}>
                        <Button size="sm" variant="outline">
                          + 添加面试复盘
                        </Button>
                      </Link>
                      <Button size="sm" variant="destructive" onClick={() => removeApp(app.id)}>
                        删除
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">拖动卡片到对应列即可改投递状态</div>
          <div className="space-y-4">
            <BoardRow
              title="进行中"
              cols={BOARD_ACTIVE}
              byStatus={byStatus}
              dragOverCol={dragOverCol}
              onCardDragStart={onCardDragStart}
              onColumnDragOver={onColumnDragOver}
              onColumnDragLeave={onColumnDragLeave}
              onColumnDrop={onColumnDrop}
            />
            <BoardRow
              title="已结束"
              cols={BOARD_CLOSED}
              byStatus={byStatus}
              dragOverCol={dragOverCol}
              onCardDragStart={onCardDragStart}
              onColumnDragOver={onColumnDragOver}
              onColumnDragLeave={onColumnDragLeave}
              onColumnDrop={onColumnDrop}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type BoardRowProps = {
  title: string;
  cols: ApplicationStatus[];
  byStatus: Record<ApplicationStatus, Application[]>;
  dragOverCol: ApplicationStatus | null;
  onCardDragStart: (e: React.DragEvent, id: string) => void;
  onColumnDragOver: (e: React.DragEvent, col: ApplicationStatus) => void;
  onColumnDragLeave: (col: ApplicationStatus) => void;
  onColumnDrop: (e: React.DragEvent, col: ApplicationStatus) => void;
};

function BoardRow({
  title,
  cols,
  byStatus,
  dragOverCol,
  onCardDragStart,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
}: BoardRowProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((col) => {
          const items = byStatus[col];
          const isOver = dragOverCol === col;
          return (
            <div
              key={col}
              onDragOver={(e) => onColumnDragOver(e, col)}
              onDragLeave={() => onColumnDragLeave(col)}
              onDrop={(e) => onColumnDrop(e, col)}
              className={cn(
                "flex w-56 shrink-0 flex-col rounded-md border p-2 transition-colors",
                COLUMN_STYLES[col],
                isOver && "border-zinc-900 bg-zinc-100"
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs">
                <span className="font-medium text-zinc-700">{col}</span>
                <span className="text-zinc-500">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <div className="rounded border border-dashed border-zinc-200 px-2 py-3 text-center text-xs text-zinc-400">
                    —
                  </div>
                ) : (
                  items.map((app) => (
                    <div
                      key={app.id}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, app.id)}
                      className="cursor-grab rounded border border-zinc-200 bg-white p-2 text-xs shadow-sm active:cursor-grabbing"
                    >
                      <div className="font-medium text-zinc-900">{app.company}</div>
                      <div className="text-zinc-600">{app.position}</div>
                      <div className="mt-1 text-zinc-400">{timeAgo(app.created_at)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
