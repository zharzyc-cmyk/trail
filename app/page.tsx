import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  FolderKanban,
  Sparkles,
  MessageSquare,
  ArrowRight,
  Check,
  X,
} from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-20 pb-12">
      {/* Hero */}
      <section className="space-y-7 pt-6">
        <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1 text-xs font-medium tracking-wide text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Trail · 求职操作系统 v0.4
        </p>
        <h1 className="text-5xl font-semibold leading-[1.15] tracking-tight md:text-6xl">
          <span className="text-gradient-brand">每个岗位</span>
          <span className="text-[#0F172A]">，都值得</span>
          <br />
          <span className="text-[#0F172A]">一份</span>
          <span className="text-gradient-brand">专属简历。</span>
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-600">
          粘贴 JD，30 秒生成。从此告别<span className="text-slate-900 font-medium">「一份简历投天下」</span>。
          每次面试的失分点反向沉淀回项目库——下一次投递更准。
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {user ? (
            <Link href="/tailor">
              <Button size="lg" className="gap-2">
                立刻定制简历 <ArrowRight size={16} />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/register">
                <Button size="lg" className="gap-2">
                  免费开始 <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  已有账号 · 登录
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* 三步工作流 */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="group transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                <FolderKanban size={20} />
              </span>
              <h3 className="text-base font-semibold text-[#1C3D6E]">建档</h3>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              上传一份完整简历 PDF，AI 自动拆成 Profile、基础简历、项目历程库三块。
              <span className="text-slate-500">从此你的项目素材有一个唯一可信源。</span>
            </p>
          </CardContent>
        </Card>
        <Card className="group transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                <Sparkles size={20} />
              </span>
              <h3 className="text-base font-semibold text-[#1C3D6E]">定制</h3>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              粘贴 JD，AI 按岗位需求从项目库挑出最相关的素材、重写 bullet、保留你简历的原版式。
              <span className="text-slate-500">一岗一份，自动归档。</span>
            </p>
          </CardContent>
        </Card>
        <Card className="group transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-100">
                <MessageSquare size={20} />
              </span>
              <h3 className="text-base font-semibold text-[#1C3D6E]">复盘</h3>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              每场面试 AI 自动抽出涉及的项目 + 失分点，反向标注到项目库。
              <span className="text-slate-500">下一场面试，预热靶向更准。</span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* 工作流对比 */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-[#1C3D6E]">
            为什么不是另一个 AI 写简历工具
          </h2>
          <p className="text-sm text-slate-500">
            真正的「一岗一简历」不是把同一份简历喂给 AI 改几次——是一整套工作流。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-6 backdrop-blur">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
              传统改简历
            </p>
            <ul className="space-y-3 text-sm leading-6 text-slate-600">
              <li className="flex items-start gap-2">
                <X size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span>每次粘 JD 都从零开始描述自己</span>
              </li>
              <li className="flex items-start gap-2">
                <X size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span>项目讲不深、数据答不出、上次改完没沉淀</span>
              </li>
              <li className="flex items-start gap-2">
                <X size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span>面试踩坑后只剩聊天记录，下次照样犯</span>
              </li>
              <li className="flex items-start gap-2">
                <X size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span>投了 N 家，回头说不清哪版有效</span>
              </li>
            </ul>
          </div>

          <div className="glass-card relative overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-600">
              Trail 工作流
            </p>
            <ul className="space-y-3 text-sm leading-6 text-slate-700">
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>项目库一次建好，每次 JD 自动挑选最相关</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>简历按你 PDF 的原版式生成，不被套模板</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>面试问答 → AI 反向标注项目库失分点</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <span>所有投递自动归档到看板，反推哪版有效</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 最终 CTA */}
      {!user && (
        <section className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-purple-50/40 p-8 backdrop-blur">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-semibold text-[#1C3D6E]">
                把你的项目库建起来，让下一次投递更准
              </h3>
              <p className="text-sm text-slate-600">邮箱注册无需信用卡 · 数据加密存储</p>
            </div>
            <Link href="/register">
              <Button size="lg" className="gap-2">
                免费开始 <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
