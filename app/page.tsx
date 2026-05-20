import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { FolderKanban, Sparkles, MessageSquare, ArrowRight } from "lucide-react";

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.26 5.69.41.35.78 1.05.78 2.12v3.15c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-14">
      <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800 backdrop-blur">
        🔔 本站目前面向有 VPN 的求职社区试用 · 国内直连访问受限 · 完整体验请使用代理
      </div>

      <section className="space-y-5 pt-4">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
          Trail · 求职轨迹 v0.4
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-gradient-brand md:text-6xl">
          每一次投递，<br className="md:hidden" />
          都让下一次更准。
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-600">
          求职轨迹是一个会写、会练、会复盘的求职操作系统——把 AI 内容生成与求职数据资产打通，
          让每一次投递的反馈反向训练下一次的简历和面试表达。
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {user ? (
            <Link href="/tailor">
              <Button size="lg" className="gap-2">
                继续使用 <ArrowRight size={16} />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/register">
                <Button size="lg" className="gap-2">
                  免费注册 <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  已有账号 · 登录
                </Button>
              </Link>
            </>
          )}
          <a
            href="https://github.com/zharzyc-cmyk/trail"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="lg" className="gap-2">
              <GithubIcon size={16} /> View on GitHub
            </Button>
          </a>
        </div>
        <p className="text-xs text-slate-500">
          每用户每天 5 次免费简历定制 · 数据加密存储 · 邮箱注册无需信用卡
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                <FolderKanban size={20} />
              </span>
              <CardTitle>① 沉淀</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            上传你的 Profile、基础简历、项目历程库——一次录入，所有简历都从这里生发。
          </CardContent>
        </Card>
        <Card className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                <Sparkles size={20} />
              </span>
              <CardTitle>② 生成</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            粘贴 JD，AI 自动从项目库挑选最相关的素材，重写 bullet，输出定制简历，一键下载 .docx。
          </CardContent>
        </Card>
        <Card className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-100">
                <MessageSquare size={20} />
              </span>
              <CardTitle>③ 复盘</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            每场面试 AI 自动抽出涉及的项目 + 失分点，反向标注到项目库——让下次面试预热靶向更准。
          </CardContent>
        </Card>
      </section>

      <section className="glass-card p-6 md:p-8">
        <h2 className="mb-3 text-lg font-semibold text-[#1C3D6E]">和 ChatGPT 改简历的区别</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="text-slate-400">·</span>
            <span>
              <span className="font-medium text-slate-900">ChatGPT</span>：每次从零开始，上次修改不沉淀
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500">·</span>
            <span>
              <span className="font-medium text-[#1C3D6E]">求职轨迹</span>：你的项目历程库 + 投递反馈数据，AI 越用越懂你
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500">·</span>
            <span>一份基础资料 → 多个岗位定制 → 全部归档到投递看板</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
