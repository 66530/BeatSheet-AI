import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-NUSS 3.0 — 导演工作台",
  description: "小说到剧本AI改编引擎 — 将小说转化为工业化拍摄剧本",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[--nuss-bg] text-[--nuss-text] antialiased">
        <header className="sticky top-0 z-50 border-b border-[--nuss-border] bg-[--nuss-surface]/95 backdrop-blur">
          <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[--nuss-accent] flex items-center justify-center">
                <span className="text-white font-bold text-sm">N</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight">AI-NUSS 3.0 导演工作台</h1>
                <p className="text-[10px] text-[--nuss-muted] -mt-0.5">小说 → 剧本 智能改编引擎</p>
              </div>
            </div>
            <nav className="flex items-center gap-4 text-xs text-[--nuss-muted]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                系统运行中
              </span>
            </nav>
          </div>
        </header>
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
      </body>
    </html>
  );
}
