import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-12">
      <section className="space-y-4 pt-8">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          每一次投递，都让下一次更准。
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-zinc-600">
          求职轨迹是一个会写、会练、会复盘的求职操作系统——把 AI 内容生成与求职数据资产打通，
          让每一次投递的反馈反向训练下一次的简历和面试表达。
        </p>
        <div className="flex gap-3 pt-2">
          {user ? (
            <Link href="/tailor">
              <Button size="lg">继续使用</Button>
            </Link>
          ) : (
            <>
              <Link href="/register">
                <Button size="lg">免费注册</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  已有账号 · 登录
                </Button>
              </Link>
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          每用户每天 10 次免费简历定制 · 数据加密存储 · 邮箱注册无需信用卡
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>① 沉淀</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600">
            上传你的 Profile、基础简历、项目历程库——一次录入，所有简历都从这里生发。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>② 生成</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600">
            粘贴 JD，AI 自动从项目库挑选最相关的素材，重写 bullet，输出定制简历，一键下载 .docx。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>③ 复盘</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600">
            每次定制自动记录到投递看板，记录状态与结果。积累足够数据后，AI 反推哪版有效、该补什么。
          </CardContent>
        </Card>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">和 ChatGPT 改简历的区别</h2>
        <ul className="space-y-2 text-sm text-zinc-700">
          <li>· ChatGPT：每次从零开始，上次修改不沉淀</li>
          <li>· 求职轨迹：你的项目历程库 + 投递反馈数据，AI 越用越懂你</li>
          <li>· 一份基础资料 → 多个岗位定制 → 全部归档到投递看板</li>
        </ul>
      </section>
    </div>
  );
}
