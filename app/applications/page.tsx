"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { renderResumeHtml, openPrintWindow } from "@/lib/resume-template";
import { cn } from "@/lib/utils";
import { Send, Target, Award, BadgePercent } from "lucide-react";

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
  sections: { title: string; html: string }[] | null;
  name: string | null;
  contact_html: string | null;
  photo_url: string | null;
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
const FUNNEL_STAGES: ApplicationStatus[] = [
  "已生成",
  "已投递",
  "笔试",
  "一面",
  "二面",
  "HR面",
  "Offer",
];

const STAGE_GRADIENT: Record<ApplicationStatus, string> = {
  已生成: "bg-blue-100 text-blue-800",
  已投递: "bg-blue-200 text-blue-900",
  笔试: "bg-indigo-300 text-indigo-950",
  一面: "bg-indigo-400 text-white",
  二面: "bg-purple-400 text-white",
  HR面: "bg-purple-500 text-white",
  Offer: "bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md shadow-amber-500/40",
  拒信: "bg-red-100 text-red-700",
  已读不回: "bg-slate-100 text-slate-500",
};

const COLUMN_STYLES: Record<ApplicationStatus, string> = {
  已生成: "border-blue-100 bg-blue-50/30",
  已投递: "border-blue-200 bg-blue-50/40",
  笔试: "border-indigo-200 bg-indigo-50/40",
  一面: "border-indigo-300 bg-indigo-50/50",
  二面: "border-purple-300 bg-purple-50/40",
  HR面: "border-purple-400 bg-purple-50/50",
  Offer: "border-amber-300 bg-amber-50/60",
  拒信: "border-red-200 bg-red-50/30",
  已读不回: "border-slate-200 bg-slate-50/40",
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

// 0 → target 的 count-up，requestAnimationFrame 驱动，零依赖
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

type View = "list" | "board";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [dragOverCol, setDragOverCol] = useState<ApplicationStatus | null>(null);
  const [funnelFilter, setFunnelFilter] = useState<ApplicationStatus | null>(null);

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

  function printResume(app: Application) {
    if (!app.sections || app.sections.length === 0) {
      alert("这条记录在 PDF 持久化功能上线前生成，无法重新打印。重新跑一次简历定制即可。");
      return;
    }
    const html = renderResumeHtml(
      {
        name: app.name || "",
        contactHtml: app.contact_html || "",
        photoUrl: app.photo_url ?? null,
        sections: app.sections,
      },
      { title: `${app.company}_${app.position}` }
    );
    openPrintWindow(html);
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

  const stats = useMemo(() => {
    const total = apps.length;
    const submitted = total - byStatus["已生成"].length;
    const active = BOARD_ACTIVE.filter((s) => s !== "已生成").reduce(
      (n, s) => n + byStatus[s].length,
      0
    );
    const offers = byStatus["Offer"].length;
    const offerRate = submitted > 0 ? Math.round((offers / submitted) * 100) : 0;
    return { total, active, offers, offerRate };
  }, [apps, byStatus]);

  const totalAnim = useCountUp(stats.total);
  const activeAnim = useCountUp(stats.active);
  const offersAnim = useCountUp(stats.offers);
  const rateAnim = useCountUp(stats.offerRate);

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

  const filteredApps = funnelFilter ? apps.filter((a) => a.status === funnelFilter) : apps;

  if (loading) return <div className="text-sm text-slate-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A]">投递记录</h1>
          <p className="mt-2 text-slate-600">所有定制过的简历自动记录在这里</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-blue-200 bg-white/70 p-0.5 backdrop-blur">
            <button
              onClick={() => setView("list")}
              className={cn(
                "rounded px-3 py-1 text-sm transition-all",
                view === "list"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
              )}
            >
              列表
            </button>
            <button
              onClick={() => setView("board")}
              className={cn(
                "rounded px-3 py-1 text-sm transition-all",
                view === "board"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
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

      {/* Dashboard */}
      {apps.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              icon={<Send size={18} />}
              label="总投递"
              value={totalAnim}
              tone="blue"
            />
            <KpiCard
              icon={<Target size={18} />}
              label="进行中"
              value={activeAnim}
              tone="indigo"
            />
            <KpiCard
              icon={<Award size={18} />}
              label="Offer 数"
              value={offersAnim}
              tone="amber"
            />
            <KpiCard
              icon={<BadgePercent size={18} />}
              label="Offer 率"
              value={rateAnim}
              suffix="%"
              tone="purple"
            />
          </div>

          <FunnelBar
            byStatus={byStatus}
            activeFilter={funnelFilter}
            onToggle={(s) => setFunnelFilter((cur) => (cur === s ? null : s))}
          />
        </>
      )}

      {apps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            还没有任何投递记录。去{" "}
            <Link href="/tailor" className="text-blue-700 underline underline-offset-2">
              简历定制
            </Link>{" "}
            生成第一份。
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <div className="space-y-3">
          {funnelFilter && (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2 text-sm">
              <span className="text-blue-800">
                正在筛选：<span className="font-semibold">{funnelFilter}</span>
                <span className="ml-2 text-blue-600">共 {filteredApps.length} 条</span>
              </span>
              <button
                onClick={() => setFunnelFilter(null)}
                className="text-xs text-blue-700 hover:underline"
              >
                清除筛选
              </button>
            </div>
          )}
          {filteredApps.map((app, i) => {
            const open = openId === app.id;
            return (
              <Card
                key={app.id}
                className="animate-fade-in-stagger transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {app.company} · {app.position}
                      </CardTitle>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(app.created_at).toLocaleString()} · 渠道：{app.channel || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-medium",
                          STAGE_GRADIENT[app.status]
                        )}
                      >
                        {app.status}
                      </span>
                      <select
                        value={app.status}
                        onChange={(e) => setStatus(app.id, e.target.value as ApplicationStatus)}
                        className="rounded border border-blue-100 bg-white/80 px-2 py-1 text-xs"
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
                      <p className="mt-1 text-sm text-slate-700">
                        {app.selected_projects.join("、") || "—"}
                      </p>
                    </div>
                    <div>
                      <Label>JD 原文</Label>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50/80 p-3 text-xs">
                        {app.jd}
                      </pre>
                    </div>
                    <div>
                      <Label>简历 markdown</Label>
                      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50/80 p-3 font-mono text-xs">
                        {app.resume_markdown}
                      </pre>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => printResume(app)}
                        disabled={!app.sections || app.sections.length === 0}
                        title={
                          !app.sections || app.sections.length === 0
                            ? "本记录在 PDF 持久化功能上线前生成，无法重新打印"
                            : undefined
                        }
                      >
                        打印 / 保存 PDF
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
          <div className="text-xs text-slate-500">拖动卡片到对应列即可改投递状态</div>
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

type KpiTone = "blue" | "indigo" | "purple" | "amber";

const TONE_STYLES: Record<KpiTone, { bg: string; icon: string; value: string; label: string }> = {
  blue: {
    bg: "from-blue-50 to-blue-100/50 border-blue-200/70",
    icon: "bg-blue-100 text-blue-600",
    value: "text-[#1C3D6E]",
    label: "text-blue-700/80",
  },
  indigo: {
    bg: "from-indigo-50 to-indigo-100/50 border-indigo-200/70",
    icon: "bg-indigo-100 text-indigo-600",
    value: "text-indigo-900",
    label: "text-indigo-700/80",
  },
  purple: {
    bg: "from-purple-50 to-fuchsia-100/40 border-purple-200/70",
    icon: "bg-purple-100 text-purple-600",
    value: "text-purple-900",
    label: "text-purple-700/80",
  },
  amber: {
    bg: "from-amber-50 to-orange-100/40 border-amber-200/70",
    icon: "bg-amber-100 text-amber-600",
    value: "text-amber-900",
    label: "text-amber-700/80",
  },
};

function KpiCard({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  tone: KpiTone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        t.bg
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", t.label)}>{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", t.icon)}>{icon}</span>
      </div>
      <div className={cn("mt-3 text-3xl font-bold tracking-tight tabular-nums", t.value)}>
        {value}
        {suffix && <span className="ml-0.5 text-xl">{suffix}</span>}
      </div>
    </div>
  );
}

function FunnelBar({
  byStatus,
  activeFilter,
  onToggle,
}: {
  byStatus: Record<ApplicationStatus, Application[]>;
  activeFilter: ApplicationStatus | null;
  onToggle: (s: ApplicationStatus) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">求职漏斗</h3>
        <p className="text-xs text-slate-500">点击任意阶段筛选下方列表</p>
      </div>
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {FUNNEL_STAGES.map((stage, i) => {
          const count = byStatus[stage].length;
          const weight = count + 1;
          const isActive = activeFilter === stage;
          const isOffer = stage === "Offer";
          return (
            <button
              key={stage}
              onClick={() => onToggle(stage)}
              style={{ flex: `${weight} 1 0%` }}
              className={cn(
                "group relative flex min-w-[72px] flex-col items-center justify-center rounded-lg px-3 py-3 text-center transition-all duration-200",
                STAGE_GRADIENT[stage],
                "hover:scale-[1.03] hover:shadow-lg",
                isActive && "ring-2 ring-offset-2 ring-blue-500",
                isOffer && "ring-1 ring-amber-300/60"
              )}
              title={
                byStatus[stage].length > 0
                  ? byStatus[stage].slice(0, 5).map((a) => a.company).join("、") +
                    (byStatus[stage].length > 5 ? " 等" : "")
                  : "暂无"
              }
            >
              <span className="text-2xl font-bold leading-none tabular-nums">{count}</span>
              <span className="mt-1 text-[10px] font-medium tracking-wider opacity-90">{stage}</span>
              {i < FUNNEL_STAGES.length - 1 && (
                <span className="pointer-events-none absolute -right-1.5 top-1/2 z-10 -translate-y-1/2 text-slate-300">
                  ▸
                </span>
              )}
            </button>
          );
        })}
      </div>
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
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
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
                "flex w-56 shrink-0 flex-col rounded-lg border p-2 transition-all duration-200",
                COLUMN_STYLES[col],
                isOver && "border-blue-500 bg-blue-50/80 ring-2 ring-blue-300/40"
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs">
                <span className="font-medium text-slate-700">{col}</span>
                <span className="text-slate-500">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-200 px-2 py-3 text-center text-xs text-slate-400">
                    —
                  </div>
                ) : (
                  items.map((app, i) => (
                    <div
                      key={app.id}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, app.id)}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className="animate-fade-in-stagger cursor-grab rounded-md border border-blue-100 bg-white/90 p-2 text-xs shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-md active:cursor-grabbing"
                    >
                      <div className="font-medium text-[#1C3D6E]">{app.company}</div>
                      <div className="text-slate-600">{app.position}</div>
                      <div className="mt-1 text-slate-400">{timeAgo(app.created_at)}</div>
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
