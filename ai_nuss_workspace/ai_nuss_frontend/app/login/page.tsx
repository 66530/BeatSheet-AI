"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already logged in — redirect to home
  if (isAuthenticated) {
    router.replace("/");
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[--nuss-accent] flex items-center justify-center shadow-lg shadow-[--nuss-accent]/25">
            <span className="text-white text-2xl font-bold">N</span>
          </div>
          <h1 className="text-2xl font-bold text-[--nuss-text] mb-1">
            AI-NUSS 3.0
          </h1>
          <p className="text-sm text-[--nuss-muted]">
            导演工作台 · 登录
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="console-panel p-6 space-y-4">
          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium text-[--nuss-muted] mb-1.5"
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-[--nuss-border] bg-[--nuss-bg] text-[--nuss-text] text-sm placeholder:text-[--nuss-muted]/50 focus:outline-none focus:border-[--nuss-accent] focus:ring-1 focus:ring-[--nuss-accent]/30 transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[--nuss-muted] mb-1.5"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-lg border border-[--nuss-border] bg-[--nuss-bg] text-[--nuss-text] text-sm placeholder:text-[--nuss-muted]/50 focus:outline-none focus:border-[--nuss-accent] focus:ring-1 focus:ring-[--nuss-accent]/30 transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="console-btn-primary w-full py-2.5 text-sm font-medium"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                登录中...
              </span>
            ) : (
              "登 录"
            )}
          </button>
        </form>

        {/* Hint */}
        <p className="text-center text-[10px] text-[--nuss-muted]/60 mt-4">
          凭证在 backend/.env 中配置（ADMIN_USERNAME / ADMIN_PASSWORD）
        </p>
      </div>
    </div>
  );
}
