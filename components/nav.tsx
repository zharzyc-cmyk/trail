"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navLoggedIn = [
  { href: "/", label: "首页" },
  { href: "/profile", label: "资料库" },
  { href: "/tailor", label: "简历定制" },
  { href: "/applications", label: "投递记录" },
  { href: "/interviews", label: "面试复盘" },
  { href: "/settings", label: "账号" },
];

const navAnon = [{ href: "/", label: "首页" }];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const items = email ? navLoggedIn : navAnon;

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-zinc-900">
          求职轨迹 · Trail
        </Link>
        <nav className="ml-8 flex flex-1 items-center gap-1">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          {!loaded ? null : email ? (
            <>
              <span className="hidden text-xs text-zinc-500 md:inline">{email}</span>
              <Button size="sm" variant="outline" onClick={handleSignOut}>
                登出
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button size="sm" variant="ghost">
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">注册</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
