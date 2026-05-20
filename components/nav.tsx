"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  FolderKanban,
  Sparkles,
  Send,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navLoggedIn = [
  { href: "/", label: "首页", icon: Home },
  { href: "/profile", label: "资料库", icon: FolderKanban },
  { href: "/tailor", label: "简历定制", icon: Sparkles },
  { href: "/applications", label: "投递记录", icon: Send },
  { href: "/interviews", label: "面试复盘", icon: MessageSquare },
  { href: "/settings", label: "账号", icon: Settings },
];

const navAnon = [{ href: "/", label: "首页", icon: Home }];

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
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-blue-100/60 bg-white/70 backdrop-blur-md md:flex">
      <div className="px-5 py-5">
        <Link href="/" className="group flex items-center gap-3">
          <span
            className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-fuchsia-500 shadow-xl shadow-indigo-500/40 ring-1 ring-white/40 ring-inset transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-fuchsia-500/50 group-hover:scale-[1.04]"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.55))" }}
            >
              <path
                d="M3 20 L9 13 L14 16 L20 5"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="20" cy="5" r="2.8" fill="white" className="animate-logo-pulse" />
            </svg>
            {/* outer glow ring */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-0.5 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(99,102,241,0.5), rgba(217,70,239,0.5), rgba(99,102,241,0.5))",
                filter: "blur(8px)",
                zIndex: -1,
              }}
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight text-[#1C3D6E]">Trail</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              求职 · 轨迹
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                active
                  ? "bg-blue-50 text-[#1C3D6E] font-medium"
                  : "text-slate-600 hover:bg-blue-50/70 hover:text-[#1C3D6E] hover:translate-x-0.5"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-blue-600" />
              )}
              <Icon
                size={18}
                className={cn(
                  "transition-colors",
                  active ? "text-blue-600" : "text-slate-400 group-hover:text-blue-500"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-blue-100/60 px-4 py-4">
        {!loaded ? (
          <div className="h-9" />
        ) : email ? (
          <div className="space-y-2">
            <p className="truncate text-xs text-slate-500" title={email}>
              {email}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleSignOut}
            >
              <LogOut size={14} />
              登出
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Link href="/login" className="block">
              <Button size="sm" variant="ghost" className="w-full">
                登录
              </Button>
            </Link>
            <Link href="/register" className="block">
              <Button size="sm" className="w-full">
                注册
              </Button>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
