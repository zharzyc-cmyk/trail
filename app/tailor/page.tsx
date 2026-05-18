"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { downloadDocx } from "@/lib/docx";
import { renderResumeHtml, openPrintWindow } from "@/lib/resume-template";

type TailorResult = {
  jdAnalysis: string;
  selectedProjects: string[];
  excludedProjects?: { name: string; reason: string }[];
  changeLog: string[];
  resumeMarkdown: string;
  resumeHtmlFragments?: {
    coreCompetenciesHtml?: string;
    internshipsHtml?: string;
  };
  applicationId?: string;
  usage?: { current: number; limit: number };
};

export default function TailorPage() {
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TailorResult | null>(null);
  const [readiness, setReadiness] = useState<{
    hasProfile: boolean;
    hasProjects: boolean;
    usage: { count: number; limit: number };
  }>({ hasProfile: false, hasProjects: false, usage: { count: 0, limit: 10 } });

  useEffect(() => {
    (async () => {
      const [pr, ps, us] = await Promise.all([
        fetch("/api/profile").then((r) => r.json()),
        fetch("/api/projects").then((r) => r.json()),
        fetch("/api/usage").then((r) => r.json()),
      ]);
      setReadiness({
        hasProfile: !!(pr?.self_profile || pr?.resume_base),
        hasProjects: Array.isArray(ps) && ps.length > 0,
        usage: us && !us.error ? us : { count: 0, limit: 10 },
      });
    })();
  }, []);

  async function handleGenerate() {
    setError("");
    setResult(null);
    if (!jd.trim() || !company.trim() || !position.trim()) {
      setError("请填写公司、岗位、JD 三项");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd: jd.trim(),
          company: company.trim(),
          position: position.trim(),
          channel: channel.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "生成失败");
        return;
      }
      setResult(json as TailorResult);
      if (json.usage) {
        setReadiness((r) => ({ ...r, usage: { count: json.usage.current, limit: json.usage.limit } }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!result?.resumeMarkdown) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fname = `${company}_${position}_${today}.docx`.replace(/[/\\?%*:|"<>]/g, "_");
    await downloadDocx(result.resumeMarkdown, fname);
  }

  function handlePrintPdf() {
    const f = result?.resumeHtmlFragments;
    if (!f?.coreCompetenciesHtml && !f?.internshipsHtml) {
      alert("AI 没返回可打印的 HTML 片段，请重新生成一次");
      return;
    }
    const html = renderResumeHtml(
      {
        coreCompetenciesHtml: f?.coreCompetenciesHtml || "",
        internshipsHtml: f?.internshipsHtml || "",
      },
      { title: `${company}_${position}` }
    );
    openPrintWindow(html);
  }

  const ready = readiness.hasProfile || readiness.hasProjects;
  const quotaReached = readiness.usage.count >= readiness.usage.limit;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">简历定制</h1>
          <p className="mt-2 text-zinc-600">粘贴 JD，AI 自动挑选最相关的项目，生成定制简历</p>
        </div>
        <div className="text-sm text-zinc-500">
          今日已用 <span className="font-medium text-zinc-900">{readiness.usage.count}</span> /{" "}
          {readiness.usage.limit} 次
        </div>
      </div>

      {!ready && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 pt-6 text-sm">
            <p className="font-medium text-amber-900">先去资料库准备素材：</p>
            <p>
              <Link href="/profile" className="underline">
                前往资料库
              </Link>{" "}
              上传 Profile / 基础简历 / 项目历程，AI 才有素材可用。
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>目标岗位</CardTitle>
          <CardDescription>填写后会自动归档到投递记录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>公司</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="例：美团" />
            </div>
            <div className="space-y-2">
              <Label>岗位</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="例：AI 产品运营实习" />
            </div>
            <div className="space-y-2">
              <Label>渠道（可选）</Label>
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="例：实习僧 / BOSS" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>JD 原文</Label>
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="粘贴完整的岗位描述..."
              className="min-h-[180px]"
            />
          </div>
          <Button onClick={handleGenerate} disabled={loading || quotaReached} size="lg">
            {quotaReached ? "今日用量已满" : loading ? "AI 生成中（约 30 秒）..." : "生成定制简历"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>AI 的判断</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium">JD 分析</p>
                <p className="mt-1 text-zinc-700">{result.jdAnalysis}</p>
              </div>
              <div>
                <p className="font-medium">选中的项目</p>
                <ul className="mt-1 list-disc pl-5 text-zinc-700">
                  {result.selectedProjects.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              {result.excludedProjects && result.excludedProjects.length > 0 && (
                <div>
                  <p className="font-medium">排除的项目及原因</p>
                  <ul className="mt-1 list-disc pl-5 text-zinc-700">
                    {result.excludedProjects.map((p) => (
                      <li key={p.name}>
                        <span className="font-medium">{p.name}</span> — {p.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="font-medium">改动说明</p>
                <ul className="mt-1 list-disc pl-5 text-zinc-700">
                  {result.changeLog.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>定制简历预览</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleDownload}>
                    下载 .docx
                  </Button>
                  <Button
                    onClick={handlePrintPdf}
                    disabled={!result.resumeHtmlFragments?.coreCompetenciesHtml}
                  >
                    打印 / 保存 PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded bg-zinc-50 p-4 font-mono text-xs leading-6">
                {result.resumeMarkdown}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
