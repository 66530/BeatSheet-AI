"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, username, isLoading, logout } = useAuth();
  const [mounted, setMounted] = useState(false);

  // 确保客户端水合之后再渲染认证相关 UI，避免服务端/客户端 HTML 不一致
  useEffect(() => { setMounted(true); }, []);

  // Don't show header on login page
  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[--nuss-border] bg-[--nuss-subtle]/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => router.push("/")}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[--nuss-accent] to-[#3d7be8] flex items-center justify-center shadow-lg shadow-[--nuss-accent]/25">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[--nuss-text]">
              NovaDirector<span className="text-[--nuss-accent] ml-0.5">AI</span>
            </h1>
            <p className="text-[10px] text-[--nuss-muted] -mt-0.5 tracking-wide">
              From Novel to Screenplay, From Story to Screen.
            </p>
          </div>
        </div>

        {/* Right: Auth status — 服务端和客户端统一渲染占位，水合后再显示真实状态 */}
        <nav className="flex items-center gap-3 text-xs">
          {!mounted ? (
            <span className="text-[--nuss-muted]">加载中...</span>
          ) : isLoading ? (
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
