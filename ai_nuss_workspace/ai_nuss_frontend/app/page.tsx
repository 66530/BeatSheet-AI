"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./contexts/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show nothing while checking auth
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-[--nuss-accent]/30 border-t-[--nuss-accent] rounded-full animate-spin" />
          <p className="text-sm text-[--nuss-muted]">验证身份中...</p>
        </div>
      </div>
    );
  }

  const handleFile = (f: File) => {
    setError(null);
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (![".txt", ".docx", ".pdf"].includes(ext)) {
      setError(`不支持的文件格式：${ext}`);
      return;
    }
    if (f.size > 50 * 1024 * 1024) { setError("文件太大，最大 50MB"); return; }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file || isUploading) return;
    setIsUploading(true); setError(null);
    try {
      let text = "";
      try {
        text = await file.text();
      } catch {
        throw new Error("文件读取失败，请检查文件编码是否为 UTF-8");
      }
      if (!text.trim()) throw new Error("文件内容为空");
      const res = await fetch("/api/v1/jobs/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_text: text, file_type: file.name.split(".").pop()?.toLowerCase() || "txt", novel_title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as {detail?:string}).detail || `服务器错误 (${res.status})`);
      }
      const data = await res.json();
      if (!data.job_id) throw new Error("服务器返回异常");
      router.push(`/workspace?job_id=${data.job_id}&novel_id=${data.novel_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败，请确认后端已启动");
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 animate-fade-in">
      {/* 标题 */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[--nuss-accent] flex items-center justify-center">
          <span className="text-white text-xl font-bold">N</span>
        </div>
        <h2 className="text-xl font-bold mb-2">小说 → 剧本 智能改编引擎</h2>
        <p className="text-[--nuss-muted] text-sm">上传小说文件，AI 导演工作室将逐场逐节拍转化为工业化拍摄剧本</p>
      </div>

      {/* 上传区 */}
      <div
        className="blank-safe-card p-8 text-center cursor-pointer mb-4"
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input id="file-input" type="file" accept=".txt,.docx,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {file ? (
          <div>
            <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-green-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-[--nuss-muted] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            <button onClick={e => { e.stopPropagation(); setFile(null); }} className="text-xs text-[--nuss-muted] hover:text-[--nuss-text] underline mt-2">重新选择</button>
          </div>
        ) : (
          <div>
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl border-2 border-dashed border-[--nuss-border] flex items-center justify-center">
              <svg className="w-6 h-6 text-[--nuss-muted]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="font-medium">点击选择小说文件</p>
            <p className="text-xs text-[--nuss-muted] mt-1">.txt / .docx / .pdf — 最大 50MB</p>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      {file && (
        <div className="text-center mb-8">
          <button onClick={handleSubmit} disabled={isUploading} className="console-btn-primary px-8 py-3 text-base w-full max-w-xs">
            {isUploading ? "提交中..." : "开始改编 →"}
          </button>
        </div>
      )}

      {/* 功能说明 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "1", title: "叙事分析", desc: "主题/类型/冲突" },
          { icon: "2", title: "角色消歧", desc: "别名合并+约束" },
          { icon: "3", title: "场景+节拍", desc: "可解释切场" },
        ].map(f => (
          <div key={f.title} className="console-panel text-center py-3">
            <div className="w-6 h-6 mx-auto mb-1 rounded-full bg-[--nuss-accent]/20 flex items-center justify-center text-[10px] font-bold text-[--nuss-accent]">{f.icon}</div>
            <h3 className="text-[11px] font-semibold">{f.title}</h3>
            <p className="text-[9px] text-[--nuss-muted]">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
