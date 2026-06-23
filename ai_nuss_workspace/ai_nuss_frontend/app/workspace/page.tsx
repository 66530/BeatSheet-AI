"use client";

import { useWorkspace } from "./_components/WorkspaceProvider";
import SceneEditor from "./scene_editor";
import SceneDistribution from "./scene_distribution";
import ScriptBreakdown from "./script_breakdown";
import CharacterGraph from "./character_graph";
import ScreenplayViewer from "./screenplay_viewer";
import ModelConfigPanel, { hasModelConfig, getModelConfig } from "./ModelConfigPanel";
import { retryJob } from "../api_client";
import { useState, useRef } from "react";

export default function WorkspacePage() {
  const ctx = useWorkspace();
  const {
    jobState, activeTab, isProcessing, isCompleted, phases,
    handleJobSubmitted, historyJobs, loadHistoryJob,
    showConfig, setShowConfig, wsConnected,
  } = ctx;

  return (
    <>
      {/* ── Processing Progress (phases) ── */}
      {jobState.jobId && isProcessing && (
        <div className="console-panel animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--nuss-text)]">剧本生成进度</span>
            <span className="text-[11px] text-[var(--nuss-muted)]">{Math.round(jobState.progressPct)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {phases.map(p => (
              <div key={p.key}
                className={`relative p-3 rounded-lg border text-center transition-all duration-500 ${
                  p.status === "done"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : p.status === "running"
                    ? "border-[var(--nuss-purple)]/40 bg-[var(--nuss-purple)]/8"
                    : "border-[var(--nuss-border)]/30 bg-[var(--nuss-surface)]/50"
                }`}
                style={p.status === "running" ? { boxShadow: "0 0 18px rgba(168,85,247,0.12)" } : {}}
              >
                <div className="text-2xl mb-1.5">{p.icon}</div>
                <div className={`text-xs font-semibold ${
                  p.status === "done" ? "text-emerald-400" :
                  p.status === "running" ? "text-[var(--nuss-purple)]" :
                  "text-[var(--nuss-muted)]"
                }`}>
                  {p.status === "running" && (
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--nuss-purple)] animate-pulse mr-1.5 align-middle" />
                  )}
                  {p.label}
                </div>
                <div className="text-[10px] text-[var(--nuss-muted)] mt-0.5">{p.description}</div>
                {p.status === "running" && (
                  <div className="mt-2 h-1 rounded-full bg-[var(--nuss-border)]/30 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        background: "linear-gradient(90deg, #A855F7, #00F0FF)",
                        width: `${Math.min(100, Math.max(5, ((jobState.progressPct - p.startPct) / (p.endPct - p.startPct)) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                {p.status === "done" && <div className="mt-1.5 text-emerald-400 text-xs">✓</div>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--nuss-muted)] mt-3 border-t border-[var(--nuss-border)]/30 pt-2 text-center">
            {jobState.currentStep || "处理中..."}
          </p>
        </div>
      )}

      {/* ── Module Content ── */}
      <div className="min-h-[400px]">
        {activeTab === "home" && (
          <HomePage onStart={() => ctx.setActiveTab("upload")} />
        )}

        {activeTab === "upload" && (
          <UploadPanel
            jobState={jobState}
            wsConnected={wsConnected}
            onJobSubmitted={handleJobSubmitted}
            historyJobs={historyJobs}
            onLoadHistory={loadHistoryJob}
            onOpenConfig={() => setShowConfig(true)}
          />
        )}

        {activeTab === "scenes" && (
          <>
            <SceneDistribution scenes={jobState.scenes} characters={jobState.characters} />
            <ScriptBreakdown scenes={jobState.scenes} characters={jobState.characters} />
            <SceneEditor scenes={jobState.scenes} reviewStatus={jobState.reviewStatus} title={jobState.novelTitle} />
          </>
        )}

        {activeTab === "characters" && (
          <CharacterGraph characters={jobState.characters} scenes={jobState.scenes} reviewStatus={jobState.reviewStatus} />
        )}

        {activeTab === "screenplay" && (
          <ScreenplayViewer
            jobId={jobState.jobId} scenes={jobState.scenes}
            reviewStatus={jobState.reviewStatus} screenplayRaw={jobState.screenplay}
            characters={jobState.characters}
          />
        )}
      </div>

      {/* ── Completion notice ── */}
      {jobState.jobId && isCompleted && (
        <div className="console-panel text-sm" style={{ borderColor: "rgba(0,240,255,0.2)", background: "rgba(0,240,255,0.04)" }}>
          ✅ 处理完成！{jobState.scenes.length} 场 · {jobState.characters.length} 角色
        </div>
      )}

      {/* ── Event log ── */}
      <details className="console-panel text-xs">
        <summary className="cursor-pointer font-medium text-[var(--nuss-muted)] hover:text-[var(--nuss-text)] select-none">
          事件日志（{jobState.eventLog.length} 条）
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5 font-mono text-[10px]">
          {jobState.eventLog.length === 0 ? (
            <p className="text-[var(--nuss-muted)] italic py-2">暂无事件</p>
          ) : (
            jobState.eventLog.slice(-80).map((entry, i) => (
              <div key={i} className="flex gap-2 hover:bg-[var(--nuss-accent-soft)] px-1 rounded">
                <span className="text-[var(--nuss-muted)] shrink-0 w-16">{entry.timestamp?.slice(11, 19) || ""}</span>
                <span className={`shrink-0 ${entry.event === "pipeline_error" ? "text-red-400" : "text-[var(--nuss-accent)]"}`}>
                  [{entry.event}]
                </span>
                <span className="text-[var(--nuss-muted)] truncate">{entry.message || ""}</span>
              </div>
            ))
          )}
        </div>
      </details>

      {/* ── Model Config Modal ── */}
      <ModelConfigPanel open={showConfig} onClose={() => setShowConfig(false)} />
    </>
  );
}

// ═══════════════════════════════════════════════════
// Upload Panel (inlined — business logic unchanged)
// ═══════════════════════════════════════════════════

function UploadPanel({ jobState, onJobSubmitted, historyJobs, onLoadHistory, onOpenConfig }: {
  jobState: import("./_components/WorkspaceProvider").SharedJobState;
  wsConnected: boolean;
  onJobSubmitted: (jid: string, nid: string) => void;
  historyJobs: Array<{ job_id: string; novel_title: string; review_status: string; created_at: string }>;
  onLoadHistory: (jid: string) => void;
  onOpenConfig: () => void;
}) {
  const isCompleted = jobState.reviewStatus === "completed";
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f); setErrMsg(null);
    try { setFileText(await f.text()); }
    catch { setErrMsg("无法读取文件，请检查编码"); }
  };

  const handleSubmit = async () => {
    if (!file || !fileText) return;
    if (!hasModelConfig()) {
      setErrMsg("请先在「模型配置」中设置 API Key、Base URL、Model 并测试连接成功后再上传小说。");
      return;
    }
    setIsSubmitting(true); setErrMsg(null);
    try {
      const mc = getModelConfig();
      const res = await fetch("/api/v1/jobs/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_text: fileText,
          file_type: file.name.split(".").pop()?.toLowerCase() || "txt",
          novel_title: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          llm_config: mc,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { message?: string }).message || `HTTP ${res.status}`); }
      const d = await res.json();
      onJobSubmitted(d.job_id, d.novel_id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "提交失败，请确认后端已启动");
    } finally { setIsSubmitting(false); }
  };

  const handleRetry = async () => {
    if (!jobState.jobId) return;
    setIsRetrying(true); setErrMsg(null);
    try {
      const d = await retryJob(jobState.jobId);
      onJobSubmitted(d.job_id, d.novel_id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "重试失败，请确认后端已启动");
    } finally { setIsRetrying(false); }
  };

  const isProcessing = jobState.reviewStatus !== "idle" && ["uploading", "analyzing", "generating"].includes(jobState.reviewStatus);
  const hasActiveJob = !!jobState.jobId && !jobState.jobId.startsWith("mock");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Left: Upload */}
      <div className="lg:col-span-2 space-y-4">
        {!hasModelConfig() && (
          <div className="p-4 rounded-lg border-2 border-dashed border-amber-400/40 bg-amber-500/5 text-center">
            <p className="text-sm font-semibold text-amber-300 mb-1">请先配置模型</p>
            <p className="text-xs text-amber-400/70 mb-3">需要设置 API Key、Base URL 和 Model Name 后才能上传</p>
            <button onClick={onOpenConfig}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
              打开模型配置
            </button>
          </div>
        )}
        <div
          className={`blank-safe-card p-6 text-center ${isProcessing ? "opacity-40 pointer-events-none" : "cursor-pointer hover:border-[var(--nuss-dim)]"}`}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".txt,.docx,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {file ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-[10px] text-[var(--nuss-muted)]">{(file.size / 1024).toFixed(1)} KB · {fileText.length} 字符</p>
              <button onClick={e => { e.stopPropagation(); setFile(null); setFileText(""); }}
                className="text-[10px] text-[var(--nuss-muted)] hover:text-[var(--nuss-text)] underline" disabled={isProcessing}>移除</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--nuss-text)]">拖拽小说文件或点击选择</p>
              <p className="text-[10px] text-[var(--nuss-muted)]">.txt / .docx / .pdf</p>
            </div>
          )}
        </div>

        {errMsg && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">{errMsg}</div>
        )}

        <button disabled={!file || isSubmitting || isProcessing} onClick={handleSubmit}
          className="console-btn-primary w-full text-sm py-2.5">
          {isSubmitting ? "提交中..."
          : isProcessing ? `处理中 ${Math.round(jobState.progressPct)}%`
          : "开始改编"}
        </button>

        {hasActiveJob && jobState.reviewStatus === "error" && (
          <div className="console-panel" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">❌</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-400">剧本生成失败</p>
                <p className="text-xs text-red-400/70 mt-1">{jobState.currentStep || "未知错误"}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleRetry} disabled={isRetrying}
                    className="px-4 py-1.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center gap-1.5">
                    {isRetrying ? (
                      <><span className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />重试中...</>
                    ) : (<>🔄 重新运行</>)}
                  </button>
                  <button onClick={() => { setFile(null); setFileText(""); }}
                    className="px-4 py-1.5 rounded text-xs font-medium text-[var(--nuss-muted)] border border-[var(--nuss-border)]/30 hover:bg-[var(--nuss-surface)] transition-colors">
                    重新上传文件
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {hasActiveJob && jobState.reviewStatus === "completed_partial" && (
          <div className="console-panel" style={{ borderColor: "rgba(250,204,21,0.3)", background: "rgba(250,204,21,0.04)" }}>
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-yellow-400">部分生成成功</p>
                <p className="text-xs text-yellow-400/70 mt-1">{jobState.currentStep || "部分场景未生成"}</p>
                <p className="text-[10px] text-[var(--nuss-muted)] mt-2">部分场景因文本过短或API限制未能生成节拍。</p>
              </div>
            </div>
          </div>
        )}

        {fileText && (
          <details className="console-panel text-xs">
            <summary className="cursor-pointer text-[var(--nuss-muted)] hover:text-[var(--nuss-text)] select-none">
              文本预览（{fileText.length} 字符）
            </summary>
            <pre className="mt-2 max-h-40 overflow-y-auto text-[10px] leading-relaxed text-[var(--nuss-muted)] whitespace-pre-wrap border-t border-[var(--nuss-border)]/30 pt-2 font-mono">
              {fileText.slice(0, 800)}
            </pre>
          </details>
        )}
      </div>

      {/* Right: History */}
      <div className="space-y-4">
        {historyJobs.length > 0 && (
          <div className="console-panel">
            <h4 className="text-xs font-semibold mb-2">📚 历史任务</h4>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {historyJobs.slice(0, 10).map(j => (
                <button key={j.job_id} onClick={() => onLoadHistory(j.job_id)}
                  className={`w-full text-left p-2 rounded text-xs hover:bg-[var(--nuss-accent-soft)] transition-colors flex items-center justify-between ${
                    j.job_id === jobState.jobId ? "bg-[var(--nuss-accent-soft)] border border-[var(--nuss-accent)]/20" : ""
                  }`}>
                  <span className="truncate flex-1">{j.novel_title || j.job_id}</span>
                  <span className={`text-[10px] ml-2 shrink-0 ${
                    j.review_status === "completed" ? "text-emerald-400"
                    : j.review_status === "error" ? "text-red-400" : "text-amber-400"
                  }`}>
                    {j.review_status === "completed" ? "完成" : j.review_status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🏠 首页 — 产品全局介绍（纯展示，不绑任务数据）
// ═══════════════════════════════════════════════════════════

function HomePage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16 animate-fade-in">
      {/* ── Hero ── */}
      <div className="text-center max-w-2xl space-y-5 mb-14">
        <div className="text-5xl mb-3">🎬</div>
        <h1
          className="text-2xl md:text-3xl font-extrabold tracking-tight leading-snug"
          style={{
            background: "linear-gradient(135deg, #EC4899 0%, #A855F7 40%, #00F0FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          NovaDirector AI
        </h1>
        <p className="text-sm md:text-base text-[var(--nuss-muted)] leading-relaxed max-w-lg mx-auto">
          智能小说到剧本编剧引擎 — 融合前沿 AI 技术与专业创作流程，自动完成角色识别、场景切分、节拍提取、导演注释和统筹拆解，生成专业影视剧本。
        </p>
      </div>

      {/* ── Workflow Guide ── */}
      <div className="w-full max-w-2xl mb-14">
        <h3 className="text-xs font-semibold text-[var(--nuss-muted)] uppercase tracking-widest text-center mb-6">
          创作流程
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "📖", label: "上传小说", desc: "支持 .txt .docx .pdf 格式的原始小说文本" },
            { icon: "🤖", label: "AI 分析", desc: "识别角色、构建故事圣经、消歧实体别名" },
            { icon: "🎬", label: "场景切分", desc: "智能分场、提取节拍、生成导演注释" },
            { icon: "📜", label: "剧本生成", desc: "输出专业格式剧本 + 统筹拆解表" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex flex-col items-center gap-2">
              <div
                className="w-full p-4 rounded-xl text-center transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: "rgba(22, 19, 42, 0.6)",
                  border: "1px solid rgba(168, 85, 247, 0.12)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="text-2xl mb-1.5">{step.icon}</div>
                <div className="text-[11px] font-semibold text-[var(--nuss-text)]">{step.label}</div>
                <div className="text-[9px] text-[var(--nuss-dim-text)] mt-1 leading-relaxed">
                  {step.desc}
                </div>
              </div>
              {i < arr.length - 1 && (
                <span className="hidden md:inline text-[var(--nuss-dim)] rotate-90 md:rotate-0">↓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <button
        onClick={onStart}
        className="px-10 py-3.5 rounded-xl text-base font-bold transition-all duration-300 hover:scale-[1.03] active:scale-95"
        style={{
          background: "linear-gradient(135deg, #EC4899, #A855F7)",
          color: "#fff",
          boxShadow: "0 0 32px rgba(168, 85, 247, 0.3), 0 0 64px rgba(236, 72, 153, 0.1)",
        }}
      >
        ⚡ 开始工作
      </button>

      <p className="text-[10px] text-[var(--nuss-dim-text)] mt-4 opacity-50">
        上传你的第一部小说，AI 将为你完成全流程改编
      </p>
    </div>
  );
}
