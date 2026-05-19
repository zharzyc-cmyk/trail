"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

type Project = {
  id: string;
  name: string;
  content: string;
  created_at: string;
  signal_count?: number;
};

type EnrichedSignal = {
  id: string;
  interview_id: string;
  interviewed_at: string;
  round: string;
  company: string | null;
  position: string | null;
  quoted_question: string;
  quoted_lowlight: string;
  suggestion: string;
};

type PreviewProjectItem = {
  name: string;
  content: string;
  exists: boolean;
  selected: boolean;
};

type PreviewBlock = {
  value: string;
  existingNonEmpty: boolean;
  selected: boolean;
};

type PreviewState = {
  profile: PreviewBlock | null;
  resumeBase: PreviewBlock | null;
  projects: PreviewProjectItem[];
};

const EMPTY_PREVIEW: PreviewState = { profile: null, resumeBase: null, projects: [] };

export default function ProfilePage() {
  const [profile, setProfile] = useState("");
  const [resumeBase, setResumeBase] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importNote, setImportNote] = useState("");
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [committing, setCommitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [signalsByProject, setSignalsByProject] = useState<Record<string, EnrichedSignal[]>>({});
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set());
  const [loadingSignals, setLoadingSignals] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [pr, ps] = await Promise.all([
          fetch("/api/profile").then((r) => r.json()),
          fetch("/api/projects").then((r) => r.json()),
        ]);
        if (pr && !pr.error) {
          setProfile(pr.self_profile || "");
          setResumeBase(pr.resume_base || "");
          setPhotoUrl(pr.photo_url || null);
        }
        if (Array.isArray(ps)) setProjects(ps);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfileText() {
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ self_profile: profile, resume_base: resumeBase }),
    });
    if (r.ok) setSavedAt(new Date().toLocaleTimeString());
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    if (!/^image\//.test(file.type)) {
      setPhotoError("只支持图片文件（jpg / png / webp）");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPhotoError(`图片过大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 3 MB`);
      return;
    }
    setUploadingPhoto(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhotoError("未登录");
        return;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setPhotoError(`上传失败：${upErr.message}（如果是 bucket 不存在，请在 Supabase Dashboard 创建 public 的 avatars bucket）`);
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: url }),
      });
      if (!r.ok) {
        setPhotoError("写入 profile 失败");
        return;
      }
      setPhotoUrl(url);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    setPhotoError("");
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_url: null }),
    });
    if (r.ok) setPhotoUrl(null);
  }

  async function addProject() {
    if (!newName.trim() || !newContent.trim()) return;
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), content: newContent.trim() }),
    });
    if (r.ok) {
      const p = (await r.json()) as Project;
      setProjects([...projects, p]);
      setNewName("");
      setNewContent("");
    }
  }

  async function patchProject(id: string, patch: { name?: string; content?: string }) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function removeProject(id: string) {
    const r = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (r.ok) setProjects(projects.filter((p) => p.id !== id));
  }

  function updateLocal(id: string, patch: Partial<Project>) {
    setProjects(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function toggleSignals(projectId: string) {
    const isOpen = expandedSignals.has(projectId);
    if (isOpen) {
      setExpandedSignals((cur) => {
        const next = new Set(cur);
        next.delete(projectId);
        return next;
      });
      return;
    }
    setExpandedSignals((cur) => new Set(cur).add(projectId));
    if (signalsByProject[projectId] !== undefined) return;
    setLoadingSignals((cur) => new Set(cur).add(projectId));
    try {
      const r = await fetch(`/api/projects/${projectId}/signals`);
      if (r.ok) {
        const data = (await r.json()) as EnrichedSignal[];
        setSignalsByProject((cur) => ({ ...cur, [projectId]: Array.isArray(data) ? data : [] }));
      } else {
        setSignalsByProject((cur) => ({ ...cur, [projectId]: [] }));
      }
    } finally {
      setLoadingSignals((cur) => {
        const next = new Set(cur);
        next.delete(projectId);
        return next;
      });
    }
  }

  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    setImportNote("");
    setPreview(EMPTY_PREVIEW);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/projects/import", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) {
        setImportError(data?.error || "导入失败");
        return;
      }
      const pf = data.profile as { value: string; existingNonEmpty: boolean } | undefined;
      const rb = data.resumeBase as { value: string; existingNonEmpty: boolean } | undefined;
      const pjs = (data.projects || []) as {
        name: string;
        content: string;
        exists: boolean;
      }[];
      setPreview({
        profile: pf?.value
          ? { value: pf.value, existingNonEmpty: !!pf.existingNonEmpty, selected: !pf.existingNonEmpty }
          : null,
        resumeBase: rb?.value
          ? { value: rb.value, existingNonEmpty: !!rb.existingNonEmpty, selected: !rb.existingNonEmpty }
          : null,
        projects: pjs.map((it) => ({
          name: it.name,
          content: it.content,
          exists: it.exists,
          selected: !it.exists,
        })),
      });
      if (data.truncated) {
        setImportNote("简历过长已截断到 30000 字符再交给 AI 抽取，长度过长可能漏项");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setImporting(false);
    }
  }

  function toggleProjectSelected(idx: number) {
    setPreview((cur) => ({
      ...cur,
      projects: cur.projects.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)),
    }));
  }
  function updateProjectField(idx: number, patch: Partial<PreviewProjectItem>) {
    setPreview((cur) => ({
      ...cur,
      projects: cur.projects.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }
  function removeProjectItem(idx: number) {
    setPreview((cur) => ({ ...cur, projects: cur.projects.filter((_, i) => i !== idx) }));
  }
  function toggleBlock(key: "profile" | "resumeBase") {
    setPreview((cur) => {
      const b = cur[key];
      if (!b) return cur;
      return { ...cur, [key]: { ...b, selected: !b.selected } };
    });
  }
  function updateBlockValue(key: "profile" | "resumeBase", value: string) {
    setPreview((cur) => {
      const b = cur[key];
      if (!b) return cur;
      return { ...cur, [key]: { ...b, value } };
    });
  }

  async function commitImport() {
    const chosenProjects = preview.projects.filter(
      (p) => p.selected && p.name.trim() && p.content.trim()
    );
    const writeProfile = !!preview.profile?.selected && !!preview.profile.value.trim();
    const writeResume = !!preview.resumeBase?.selected && !!preview.resumeBase.value.trim();

    if (!writeProfile && !writeResume && chosenProjects.length === 0) {
      setImportError("没有勾选任何条目");
      return;
    }

    setCommitting(true);
    setImportError("");

    try {
      const profilePatch: { self_profile?: string; resume_base?: string } = {};
      if (writeProfile) profilePatch.self_profile = preview.profile!.value;
      if (writeResume) profilePatch.resume_base = preview.resumeBase!.value;

      if (writeProfile || writeResume) {
        const r = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePatch),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          setImportError(data?.error || "Profile 写入失败");
          return;
        }
        if (writeProfile) setProfile(preview.profile!.value);
        if (writeResume) setResumeBase(preview.resumeBase!.value);
      }

      let insertedCount = 0;
      let updatedCount = 0;
      if (chosenProjects.length > 0) {
        const r = await fetch("/api/projects/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chosenProjects.map((p) => ({
              name: p.name.trim(),
              content: p.content.trim(),
            })),
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          setImportError(data?.error || "项目入库失败");
          return;
        }
        const inserted = (data.inserted || []) as Project[];
        const updated = (data.updated || []) as Project[];
        insertedCount = inserted.length;
        updatedCount = updated.length;
        if (inserted.length > 0 || updated.length > 0) {
          const updatedById = new Map(updated.map((p) => [p.id, p]));
          setProjects((cur) => {
            const merged = cur.map((p) => updatedById.get(p.id) || p);
            return [...merged, ...inserted];
          });
        }
      }

      setPreview(EMPTY_PREVIEW);
      const parts: string[] = [];
      if (writeProfile) parts.push("Profile");
      if (writeResume) parts.push("基础简历");
      if (insertedCount > 0) parts.push(`新增 ${insertedCount} 个项目`);
      if (updatedCount > 0) parts.push(`覆盖 ${updatedCount} 个项目`);
      setImportNote(parts.length > 0 ? `已写入：${parts.join("，")}` : "已完成");
    } finally {
      setCommitting(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">加载中...</div>;
  }

  const hasPreview =
    !!preview.profile || !!preview.resumeBase || preview.projects.length > 0;
  const selectedTotal =
    (preview.profile?.selected ? 1 : 0) +
    (preview.resumeBase?.selected ? 1 : 0) +
    preview.projects.filter((p) => p.selected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">资料库</h1>
          <p className="mt-2 text-zinc-600">上传你的 Profile、基础简历、项目历程，作为 AI 定制简历的素材</p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-zinc-500">已保存于 {savedAt}</span>}
          <Button onClick={saveProfileText}>保存 Profile + 简历</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>简历头像</CardTitle>
          <CardDescription>
            可选。会出现在 AI 定制简历的右上角。建议 1 寸 / 2 寸蓝底白底证件照，jpg/png，3 MB 以内。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-[115px] w-[90px] overflow-hidden rounded border border-zinc-300 bg-zinc-50">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">未上传</div>
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {uploadingPhoto ? "上传中..." : photoUrl ? "更换头像" : "上传头像"}
                </Button>
                {photoUrl && (
                  <Button variant="ghost" size="sm" onClick={removePhoto}>
                    移除
                  </Button>
                )}
              </div>
              {photoError && <p className="text-xs text-red-600">{photoError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>从简历 PDF 一键导入</CardTitle>
              <CardDescription>
                上传一份完整的简历 PDF，AI 自动拆出 Profile、基础简历底稿、项目历程库三块，你确认后写入资料库。消耗 1 次今日用量。
              </CardDescription>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={onPickPdf}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? "解析中..." : "选择简历 PDF"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {(importError || importNote || hasPreview) && (
          <CardContent className="space-y-4">
            {(importError || importNote) && (
              <div
                className={
                  "rounded border p-3 text-sm " +
                  (importError
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700")
                }
              >
                {importError || importNote}
              </div>
            )}

            {hasPreview && (
              <div className="space-y-3 rounded border border-amber-300 bg-amber-50/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-800">
                    AI 抽取完成 · 已勾选 {selectedTotal} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreview(EMPTY_PREVIEW)}
                      disabled={committing}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={commitImport}
                      disabled={committing || selectedTotal === 0}
                    >
                      {committing ? "导入中..." : `导入勾选的 ${selectedTotal} 条`}
                    </Button>
                  </div>
                </div>

                {preview.profile && (
                  <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preview.profile.selected}
                        onChange={() => toggleBlock("profile")}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">个人 Profile</span>
                      {preview.profile.existingNonEmpty && (
                        <span className="whitespace-nowrap rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
                          已有内容，勾选 = 覆盖
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={preview.profile.value}
                      onChange={(e) => updateBlockValue("profile", e.target.value)}
                      className="min-h-[160px] font-mono text-xs"
                    />
                  </div>
                )}

                {preview.resumeBase && (
                  <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preview.resumeBase.selected}
                        onChange={() => toggleBlock("resumeBase")}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">基础简历</span>
                      {preview.resumeBase.existingNonEmpty && (
                        <span className="whitespace-nowrap rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
                          已有内容，勾选 = 覆盖
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={preview.resumeBase.value}
                      onChange={(e) => updateBlockValue("resumeBase", e.target.value)}
                      className="min-h-[220px] font-mono text-xs"
                    />
                  </div>
                )}

                {preview.projects.length > 0 && (
                  <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
                    <div className="text-sm font-medium">
                      项目历程库 · {preview.projects.length} 条
                    </div>
                    {preview.projects.map((p, idx) => (
                      <div
                        key={idx}
                        className="space-y-2 rounded border border-zinc-200 bg-white p-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={p.selected}
                            onChange={() => toggleProjectSelected(idx)}
                            className="h-4 w-4"
                          />
                          <Input
                            value={p.name}
                            onChange={(e) => updateProjectField(idx, { name: e.target.value })}
                            className="font-medium"
                          />
                          {p.exists && (
                            <span className="whitespace-nowrap rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
                              已存在，勾选 = 覆盖
                            </span>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => removeProjectItem(idx)}>
                            移除
                          </Button>
                        </div>
                        <Textarea
                          value={p.content}
                          onChange={(e) => updateProjectField(idx, { content: e.target.value })}
                          className="min-h-[140px] font-mono text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>个人 Profile</CardTitle>
          <CardDescription>基本信息、技能标签、求职偏好（建议 markdown 格式）</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="# 基本信息&#10;- 姓名：&#10;- 求职方向：..."
            className="min-h-[240px] font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>基础简历</CardTitle>
          <CardDescription>全量版本（markdown），AI 以此为底稿做定制</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={resumeBase}
            onChange={(e) => setResumeBase(e.target.value)}
            className="min-h-[300px] font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>项目历程库</CardTitle>
          <CardDescription>每个项目一条记录，AI 会根据 JD 挑选最相关的</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.length === 0 && (
            <p className="text-sm text-zinc-500">还没有项目。在下方手动添加，或上方「从简历 PDF 一键导入」拆解。</p>
          )}
          {projects.map((p) => {
            const count = p.signal_count ?? 0;
            const isOpen = expandedSignals.has(p.id);
            const signals = signalsByProject[p.id];
            const isLoading = loadingSignals.has(p.id);
            return (
              <div key={p.id} className="space-y-2 rounded border border-zinc-200 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={p.name}
                    onChange={(e) => updateLocal(p.id, { name: e.target.value })}
                    onBlur={() => patchProject(p.id, { name: p.name })}
                    className="font-medium"
                  />
                  <Button variant="destructive" size="sm" onClick={() => removeProject(p.id)}>
                    删除
                  </Button>
                </div>
                <Textarea
                  value={p.content}
                  onChange={(e) => updateLocal(p.id, { content: e.target.value })}
                  onBlur={() => patchProject(p.id, { content: p.content })}
                  className="min-h-[160px] font-mono text-xs"
                />
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSignals(p.id)}
                    disabled={count === 0}
                    className={
                      "text-xs " +
                      (count === 0
                        ? "cursor-not-allowed text-zinc-400"
                        : "text-amber-700 hover:underline")
                    }
                  >
                    {count === 0 ? "暂未被追问" : `曾被追问 ${count} 次 ${isOpen ? "▴" : "▾"}`}
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50/40 p-3">
                      {isLoading ? (
                        <p className="text-xs text-zinc-500">加载中...</p>
                      ) : !signals || signals.length === 0 ? (
                        <p className="text-xs text-zinc-500">暂无明细</p>
                      ) : (
                        signals.map((s) => (
                          <div key={s.id} className="space-y-1 rounded bg-white p-2 text-xs">
                            <div className="font-medium text-zinc-800">
                              {s.interviewed_at} · {s.round}
                              {s.company ? ` · ${s.company}` : ""}
                              {s.position ? ` · ${s.position}` : ""}
                            </div>
                            {s.quoted_question && (
                              <div className="italic text-zinc-700">「{s.quoted_question}」</div>
                            )}
                            {s.quoted_lowlight && (
                              <div className="text-zinc-500">失分：{s.quoted_lowlight}</div>
                            )}
                            {s.suggestion && (
                              <div className="rounded bg-amber-100 px-2 py-1 text-amber-900">
                                建议：{s.suggestion}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="space-y-2 rounded border border-dashed border-zinc-300 p-3">
            <Label>添加新项目</Label>
            <Input
              placeholder="项目名称，例：哈啰_阶梯式优惠券"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Textarea
              placeholder="项目内容（markdown）：背景、动作、数据、能力标签..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[120px] font-mono text-xs"
            />
            <Button onClick={addProject} size="sm">
              添加项目
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
