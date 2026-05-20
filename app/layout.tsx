import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "求职轨迹 · Trail",
  description: "每一次投递，都让下一次更准。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full antialiased">
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 px-8 py-10 lg:px-12">
            <div className="mx-auto max-w-5xl animate-fade-in-up">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
