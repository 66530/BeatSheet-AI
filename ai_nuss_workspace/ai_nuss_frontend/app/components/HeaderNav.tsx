"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, username, isLoading, logout } = useAuth();

  // Don't show header on login page
  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[--nuss-border] bg-[--nuss-surface]/95 backdrop-blur">
      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => router.push("/")}
        >
          <div className="w-8 h-8 rounded-md bg-[--nuss-accent] flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">
              AI-NUSS 3.0 导演工作台
            </h1>
            <p className="text-[10px] text-[--nuss-muted] -mt-0.5">
              小说 → 剧本 智能改编引擎
            </p>
          </div>
        </div>

        {/* Right: Auth status */}
        <nav className="flex items-center gap-3 text-xs">
          {isLoading ? (
            <span className="text-[--nuss-muted]">加载中...</span>
          ) : isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[--nuss-muted]">
                  {username}
                </span>
              </span>
              <button
                onClick={logout}
                className="text-[--nuss-muted] hover:text-red-400 transition-colors border border-[--nuss-border] rounded px-2.5 py-1 hover:border-red-500/30"
              >
                退出登录
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="console-btn text-xs"
            >
              登录
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
