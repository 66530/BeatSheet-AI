import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { HeaderNav } from "./components/HeaderNav";

export const metadata: Metadata = {
  title: "AI-NUSS 3.0 — 导演工作台",
  description: "小说到剧本AI改编引擎 — 将小说转化为工业化拍摄剧本",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[--nuss-bg] text-[--nuss-text] antialiased">
        <AuthProvider>
          <HeaderNav />
          <div className="max-w-screen-2xl mx-auto flex">
            {/* 左侧提示 */}
            <aside className="hidden lg:block w-16 shrink-0 py-6 pl-3">
              <div className="sticky top-20 text-[9px] text-[--nuss-muted] leading-relaxed space-y-3 select-none">
                <div className="border-l-2 border-[--nuss-border] pl-2">
                  开发测试中
                </div>
                <div className="border-l-2 border-[--nuss-border] pl-2 text-[8px] opacity-60">
                  消耗开发者<br/>API额度
                </div>
              </div>
            </aside>
            <main className="flex-1 min-w-0 px-3 lg:px-6 py-6">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
