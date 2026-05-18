"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [usage, setUsage] = useState<{ count: number; limit: number } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setUsage(d))
      .catch(() => {});
  }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPwMsg({ type: "err", text: "密码至少 6 位" });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwMsg({ type: "err", text: error.message });
      } else {
        setPwMsg({ type: "ok", text: "密码已更新" });
        setNewPassword("");
      }
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">账号</h1>
        <p className="mt-2 text-zinc-600">查看用量、修改密码</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-zinc-500">邮箱：</span>
            <span className="font-medium">{email || "—"}</span>
          </div>
          {usage && (
            <div>
              <span className="text-zinc-500">今日已用：</span>
              <span className="font-medium">
                {usage.count} / {usage.limit} 次
              </span>
              {usage.count >= usage.limit && (
                <span className="ml-2 text-xs text-amber-600">（已达上限，明天再试）</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>下次登录时使用新密码</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="np">新密码（至少 6 位）</Label>
              <Input
                id="np"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pwLoading}>
              {pwLoading ? "更新中..." : "更新密码"}
            </Button>
            {pwMsg && (
              <p className={pwMsg.type === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"}>
                {pwMsg.text}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
