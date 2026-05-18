"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROUNDS = ["笔试", "一面", "二面", "HR面", "终面", "自由"] as const;
type Round = (typeof ROUNDS)[number];

type Interview = {
  id: string;
  application_id: string | null;
  round: Round;
  interviewed_at: string;
  questions_md: string;
  self_score: number | null;
  lowlights: string;
  next_action: string;
  company: string | null;
  position: string | null;
  created_at: string;
};

type AppLite = { id: string; company: string; position: string };
type ProjectLite = { id: string; name: string };

type Signal = {
  id: string;
  interview_id: string;
  project_id: string | null;
  quoted_question: string;
  quoted_lowlight: string;
  suggestion: string;
};

type SkipReason = "usage_exhausted" | "ai_failed" | "no_projects";

type CreateResponse = Interview & {
  signals: Signal[];
  signalsSkipped?: SkipReason;
  warning?: string;
};

function todayLocal(): string {
  const d = new Date(new Date().getTime() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function InterviewsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">加载中...</div>}>
      <InterviewsInner />
    </Suspense>
  );
}

function InterviewsInner() {
  const sp = useSearchParams();
  const presetAppId = sp.get("app");
  const presetRound = sp.get("round") as Round | null;

  const [list, setList] = useState<Interview[]>([]);
  const [apps, setApps] = useState<AppLite[]>([]);
  const [projectsLite, setProjectsLite] = useState<ProjectLite[]>([]);
  const [signalsByItv, setSignalsByItv] = useState<Record<string, Signal[]>>({});
  const [skipReasonByItv, setSkipReasonByItv] = useState<Record<string, { reason: SkipReason; warning?: string }>>({});
  const [reExtracting, setReExtracting] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 新建表单 state
  const [creating, setCreating] = useState(false);
  const [newAppId, setNewAppId] = useState<string>(presetAppId || "");
  const [newRound, setNewRound] = useState<Round>(
    presetRound && ROUNDS.includes(presetRound) ? presetRound : "一面"
  );
  const [newDate, setNewDate] = useState(todayLocal());
  const [newQuestions, setNewQuestions] = useState("");
  const [newSelfScore, setNewSelfScore] = useState<string>("");
  const [newLowlights, setNewLowlights] = useState("");
  const [newNextAction, setNewNextAction] = useState("");
  const [newSyncStatus, setNewSyncStatus] = useState(true);
  const [showForm, setShowForm] = useState(!!presetAppId);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    (async () => {
      const [itvs, appsRes, projsRes] = await Promise.all([
        fetch("/api/interviews").then((r) => r.json()),
        fetch("/api/applications").then((r) => r.json()),
        fetch("/api/projects").then((r) => r.json()),
      ]);
      if (Array.isArray(itvs)) setList(itvs);
      if (Array.isArray(appsRes)) {
        setApps(
          appsRes.map((a: { id: string; company: string; position: string }) => ({
            id: a.id,
            company: a.company,
            position: a.position,
          }))
        );
      }
      if (Array.isArray(projsRes)) {
        setProjectsLite(
          projsRes.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        );
      }
      setLoading(false);
    })();
  }, []);

  async function ensureSignalsLoaded(itvId: string) {
    if (signalsByItv[itvId] !== undefined) return;
    const r = await fetch(`/api/interviews/${itvId}/signals`);
    if (r.ok) {
      const data = (await r.json()) as Signal[];
      setSignalsByItv((cur) => ({ ...cur, [itvId]: Array.isArray(data) ? data : [] }));
    } else {
      setSignalsByItv((cur) => ({ ...cur, [itvId]: [] }));
    }
  }

  async function handleToggleOpen(itvId: string) {
    if (openId === itvId) {
      setOpenId(null);
      return;
    }
    setOpenId(itvId);
    await ensureSignalsLoaded(itvId);
  }

  async function patchSignal(sid: string, patch: Partial<Signal>) {
    await fetch(`/api/signals/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function updateSignalLocal(itvId: string, sid: string, patch: Partial<Signal>) {
    setSignalsByItv((cur) => ({
      ...cur,
      [itvId]: (cur[itvId] || []).map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    }));
  }

  async function removeSignal(itvId: string, sid: string) {
    const prev = signalsByItv[itvId] || [];
    setSignalsByItv((cur) => ({ ...cur, [itvId]: prev.filter((s) => s.id !== sid) }));
    const r = await fetch(`/api/signals/${sid}`, { method: "DELETE" });
    if (!r.ok) setSignalsByItv((cur) => ({ ...cur, [itvId]: prev }));
  }

  async function reExtract(itvId: string) {
    setReExtracting((cur) => ({ ...cur, [itvId]: true }));
    try {
      const r = await fetch(`/api/interviews/${itvId}/signals`, { method: "POST" });
      const data = (await r.json()) as { signals: Signal[]; signalsSkipped?: SkipReason; warning?: string };
      if (r.ok && Array.isArray(data.signals)) {
        setSignalsByItv((cur) => ({ ...cur, [itvId]: data.signals }));
        if (data.signalsSkipped) {
          setSkipReasonByItv((cur) => ({ ...cur, [itvId]: { reason: data.signalsSkipped!, warning: data.warning } }));
        } else {
          setSkipReasonByItv((cur) => {
            const next = { ...cur };
            delete next[itvId];
            return next;
          });
        }
      }
    } finally {
      setReExtracting((cur) => ({ ...cur, [itvId]: false }));
    }
  }

  function resetForm() {
    setNewAppId("");
    setNewRound("一面");
    setNewDate(todayLocal());
    setNewQuestions("");
    setNewSelfScore("");
    setNewLowlights("");
    setNewNextAction("");
    setNewSyncStatus(true);
    setCreateError("");
  }

  async function handleCreate() {
    setCreateError("");
    const score = newSelfScore.trim() === "" ? null : Number(newSelfScore);
    if (score !== null && (Number.isNaN(score) || score < 1 || score > 10)) {
      setCreateError("自评必须是 1-10 的数字");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: newAppId || null,
          round: newRound,
          interviewed_at: newDate,
          questions_md: newQuestions,
          self_score: score,
          lowlights: newLowlights,
          next_action: newNextAction,
          sync_application_status: newSyncStatus,
        }),
      });
      const data = (await r.json()) as CreateResponse;
      if (!r.ok) {
        setCreateError((data as unknown as { error?: string })?.error || "保存失败");
        return;
      }
      // 重新拉一次列表，让 company/position join 是新的；同时 application status 可能被推进
      const fresh = await fetch("/api/interviews").then((res) => res.json());
      if (Array.isArray(fresh)) setList(fresh);
      if (data.id) {
        setSignalsByItv((cur) => ({ ...cur, [data.id]: data.signals || [] }));
        if (data.signalsSkipped) {
          setSkipReasonByItv((cur) => ({
            ...cur,
            [data.id]: { reason: data.signalsSkipped!, warning: data.warning },
          }));
        }
        setOpenId(data.id);
      }
      resetForm();
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  }

  async function patchItv(id: string, patch: Partial<Interview>) {
    await fetch(`/api/interviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function removeItv(id: string) {
    const prev = list;
    setList(list.filter((x) => x.id !== id));
    const r = await fetch(`/api/interviews/${id}`, { method: "DELETE" });
    if (!r.ok) setList(prev);
  }

  function updateLocal(id: string, patch: Partial<Interview>) {
    setList(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  if (loading) return <div className="text-sm text-zinc-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">面试复盘</h1>
          <p className="mt-2 text-zinc-600">把每次面试的问答、失分点、下一步留下来，供未来周度复盘 + 项目库优化</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "收起表单" : "新增面试"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新增面试复盘</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>关联投递（可选）</Label>
                <select
                  value={newAppId}
                  onChange={(e) => setNewAppId(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-2 text-sm"
                >
                  <option value="">— 独立面试（无关联） —</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.company} · {a.position}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>轮次</Label>
                <select
                  value={newRound}
                  onChange={(e) => setNewRound(e.target.value as Round)}
                  className="w-full rounded border border-zinc-300 px-2 py-2 text-sm"
                >
                  {ROUNDS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>日期</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>问答记录（markdown）</Label>
              <Textarea
                value={newQuestions}
                onChange={(e) => setNewQuestions(e.target.value)}
                placeholder="Q：你为什么选这家？&#10;A：...&#10;&#10;Q：讲一个最失败的项目..."
                className="min-h-[160px] font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>自评分 (1-10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={newSelfScore}
                  onChange={(e) => setNewSelfScore(e.target.value)}
                  placeholder="8"
                />
              </div>
              <div className="col-span-2 flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  id="sync-status"
                  checked={newSyncStatus}
                  onChange={(e) => setNewSyncStatus(e.target.checked)}
                  disabled={!newAppId}
                  className="h-4 w-4"
                />
                <label htmlFor="sync-status" className="text-xs text-zinc-600">
                  {newAppId ? "同步推进投递状态到对应轮次" : "选定关联投递后才能联动状态"}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>失分点 / 没答好的地方</Label>
              <Textarea
                value={newLowlights}
                onChange={(e) => setNewLowlights(e.target.value)}
                placeholder="冷启动项目被追问数据归因，没准备好"
                className="min-h-[80px] text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>下一步行动</Label>
              <Textarea
                value={newNextAction}
                onChange={(e) => setNewNextAction(e.target.value)}
                placeholder="项目库补充包阅 AI 留存率拆解"
                className="min-h-[60px] text-sm"
              />
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "保存中..." : "保存"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-zinc-500">
            还没有面试记录。点右上「新增面试」开始第一条复盘。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((itv) => {
            const open = openId === itv.id;
            const label = itv.company
              ? `${itv.company} · ${itv.position}`
              : "独立面试";
            return (
              <Card key={itv.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {label} · {itv.round}
                      </CardTitle>
                      <p className="mt-1 text-xs text-zinc-500">
                        {itv.interviewed_at}
                        {itv.self_score != null && ` · 自评 ${itv.self_score}/10`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleOpen(itv.id)}
                      >
                        {open ? "收起" : "详情"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {open && (
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>轮次</Label>
                        <select
                          value={itv.round}
                          onChange={(e) => {
                            updateLocal(itv.id, { round: e.target.value as Round });
                            patchItv(itv.id, { round: e.target.value as Round });
                          }}
                          className="w-full rounded border border-zinc-300 px-2 py-2 text-sm"
                        >
                          {ROUNDS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>日期</Label>
                        <Input
                          type="date"
                          value={itv.interviewed_at}
                          onChange={(e) => updateLocal(itv.id, { interviewed_at: e.target.value })}
                          onBlur={() => patchItv(itv.id, { interviewed_at: itv.interviewed_at })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>自评分</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={itv.self_score ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                            updateLocal(itv.id, { self_score: v });
                          }}
                          onBlur={() => patchItv(itv.id, { self_score: itv.self_score })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>问答记录</Label>
                      <Textarea
                        value={itv.questions_md}
                        onChange={(e) => updateLocal(itv.id, { questions_md: e.target.value })}
                        onBlur={() => patchItv(itv.id, { questions_md: itv.questions_md })}
                        className="min-h-[160px] font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>失分点</Label>
                      <Textarea
                        value={itv.lowlights}
                        onChange={(e) => updateLocal(itv.id, { lowlights: e.target.value })}
                        onBlur={() => patchItv(itv.id, { lowlights: itv.lowlights })}
                        className="min-h-[80px] text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>下一步行动</Label>
                      <Textarea
                        value={itv.next_action}
                        onChange={(e) => updateLocal(itv.id, { next_action: e.target.value })}
                        onBlur={() => patchItv(itv.id, { next_action: itv.next_action })}
                        className="min-h-[60px] text-sm"
                      />
                    </div>

                    <SignalsSection
                      itvId={itv.id}
                      signals={signalsByItv[itv.id]}
                      projects={projectsLite}
                      skip={skipReasonByItv[itv.id]}
                      reExtracting={!!reExtracting[itv.id]}
                      onReExtract={() => reExtract(itv.id)}
                      onPatch={(sid, patch) => {
                        updateSignalLocal(itv.id, sid, patch);
                        patchSignal(sid, patch);
                      }}
                      onDelete={(sid) => removeSignal(itv.id, sid)}
                    />

                    <Button size="sm" variant="destructive" onClick={() => removeItv(itv.id)}>
                      删除
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignalsSection(props: {
  itvId: string;
  signals: Signal[] | undefined;
  projects: ProjectLite[];
  skip?: { reason: SkipReason; warning?: string };
  reExtracting: boolean;
  onReExtract: () => void;
  onPatch: (sid: string, patch: Partial<Signal>) => void;
  onDelete: (sid: string) => void;
}) {
  const { signals, projects, skip, reExtracting, onReExtract, onPatch, onDelete } = props;
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-800">
          AI 抽取出与项目库的关联 · {signals?.length ?? 0} 条
        </div>
        <Button size="sm" variant="outline" onClick={onReExtract} disabled={reExtracting}>
          {reExtracting ? "抽取中..." : "重新抽取"}
        </Button>
      </div>

      {skip && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {skip.warning ||
            (skip.reason === "usage_exhausted"
              ? "今日 AI 用量已用尽"
              : skip.reason === "no_projects"
              ? "项目库为空，无法抽取"
              : "AI 抽取失败")}
        </div>
      )}

      {signals === undefined ? (
        <p className="text-xs text-zinc-500">加载中...</p>
      ) : signals.length === 0 ? (
        <p className="text-xs text-zinc-500">AI 没在这场面试里识别到与项目库相关的内容。可改完上方文本后点「重新抽取」再试。</p>
      ) : (
        signals.map((s) => {
          const projectMissing = s.project_id !== null && !projectNameById.has(s.project_id);
          return (
            <div key={s.id} className="space-y-2 rounded border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <select
                  value={s.project_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    onPatch(s.id, { project_id: v });
                  }}
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs"
                >
                  <option value="">— 未匹配项目 —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {projectMissing && (
                    <option value={s.project_id!} disabled>
                      （项目已删除）
                    </option>
                  )}
                </select>
                <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)}>
                  删除
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">面试官追问</Label>
                <Textarea
                  value={s.quoted_question}
                  onChange={(e) => onPatch(s.id, { quoted_question: e.target.value })}
                  onBlur={() => onPatch(s.id, { quoted_question: s.quoted_question })}
                  className="min-h-[50px] text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">失分点</Label>
                <Textarea
                  value={s.quoted_lowlight}
                  onChange={(e) => onPatch(s.id, { quoted_lowlight: e.target.value })}
                  onBlur={() => onPatch(s.id, { quoted_lowlight: s.quoted_lowlight })}
                  className="min-h-[50px] text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">建议</Label>
                <Textarea
                  value={s.suggestion}
                  onChange={(e) => onPatch(s.id, { suggestion: e.target.value })}
                  onBlur={() => onPatch(s.id, { suggestion: s.suggestion })}
                  className="min-h-[50px] text-xs"
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
