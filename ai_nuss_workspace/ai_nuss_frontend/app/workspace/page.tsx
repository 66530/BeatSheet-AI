"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import SceneEditor from "./scene_editor";
import SceneDistribution from "./scene_distribution";
import CharacterGraph from "./character_graph";
import ScreenplayViewer from "./screenplay_viewer";
import ModelConfigPanel, { hasModelConfig, getModelConfig } from "./ModelConfigPanel";
import {
  type ReviewStatus, type SceneUIModel, type CharacterUIModel, type BeatUIModel,
  type JobStatusModel, type WebSocketFrameModel,
  getJobStatus, connectJobStream,
} from "../api_client";

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

type TabId = "upload" | "scenes" | "characters" | "screenplay";

interface SubTask {
  key: string;
  label: string;
  startPct: number;
  endPct: number;
  status: "pending" | "running" | "done" | "error";
}

interface SharedJobState {
  jobId: string; novelId: string; novelTitle: string;
  reviewStatus: ReviewStatus; progressPct: number; currentStep: string;
  scenes: SceneUIModel[]; beats: BeatUIModel[]; characters: CharacterUIModel[];
  screenplay: Record<string, unknown>; storyBible: Record<string, unknown>;
  eventLog: Array<{ timestamp: string; event: string; message?: string; stage?: string }>;
}

// ═══════════════════════════════════════════════════
// Sub-task definitions
// ═══════════════════════════════════════════════════

const SUB_TASKS: SubTask[] = [
  { key: "parsing",   label: "文档解析",     startPct: 0,  endPct: 10,  status: "pending" },
  { key: "narrative", label: "叙事分析",     startPct: 10, endPct: 20,  status: "pending" },
  { key: "bible",     label: "故事圣经",     startPct: 20, endPct: 28,  status: "pending" },
  { key: "characters",label: "角色消歧",     startPct: 28, endPct: 40,  status: "pending" },
  { key: "scenes",    label: "场景切分",     startPct: 40, endPct: 65,  status: "pending" },
  { key: "beats",     label: "节拍与剧本",   startPct: 65, endPct: 95,  status: "pending" },
  { key: "done",      label: "完成",         startPct: 95, endPct: 100, status: "pending" },
];

function getSubTasks(progress: number, currentStage: string): SubTask[] {
  return SUB_TASKS.map((t) => {
    if (progress >= t.endPct) return { ...t, status: "done" as const };
    if (progress >= t.startPct && progress < t.endPct && t.key === currentStage) return { ...t, status: "running" as const };
    if (t.key === "error") return { ...t, status: "error" as const };
    return { ...t, status: "pending" as const };
  });
}

// ═══════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════

export default function WorkspacePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const urlJobId = searchParams.get("job_id") || "";
  const urlNovelId = searchParams.get("novel_id") || "";
  const connectedJobRef = useRef("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const [jobState, setJobState] = useState<SharedJobState>({
    jobId: urlJobId, novelId: urlNovelId, novelTitle: "",
    reviewStatus: "idle" as ReviewStatus, progressPct: 0, currentStep: "",
    scenes: [], beats: [], characters: [], screenplay: {}, storyBible: {},
    eventLog: [],
  });

  const [activeTab, setActiveTab] = useState<TabId>("upload");
  const [wsConnected, setWsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState("parsing");
  const [sceneProgress, setSceneProgress] = useState<{ current: number; total: number } | null>(null);
  const [historyJobs, setHistoryJobs] = useState<Array<{ job_id: string; novel_title: string; review_status: string; created_at: string }>>([]);
  const [showConfig, setShowConfig] = useState(false);

  // ── Fetch history ──
  useEffect(() => {
    fetch("/api/v1/jobs/").then(r => r.json()).then(d => setHistoryJobs(d.jobs || [])).catch(() => {});
  }, []);

  // ── WebSocket ──
  useEffect(() => {
    const jid = jobState.jobId;
    if (!jid || jid === connectedJobRef.current) return;
    connectedJobRef.current = jid;
    setWsConnected(false);

    const ws = connectJobStream(jid, (frame: WebSocketFrameModel) => {
      setWsConnected(true);
      const { event, payload } = frame;
      const p = payload as Record<string, unknown>;

      setJobState(prev => ({
        ...prev,
        eventLog: [...prev.eventLog, {
          timestamp: frame.timestamp, event,
          message: (p.message as string) || (p.stage as string) || event,
          stage: p.stage as string,
        }].slice(-100),
      }));

      if (event === "state_snapshot" || event === "job_updated" || event === "progress_update") {
        setJobState(prev => ({
          ...prev,
          reviewStatus: (p.review_status as ReviewStatus) || prev.reviewStatus,
          progressPct: (p.progress_pct as number) ?? prev.progressPct,
          currentStep: (p.current_step as string) || prev.currentStep,
        }));
        if (p.stage) setCurrentStage(p.stage as string);
      }

      if (event === "scenes_segmented" || event === "screenplay_generated" || event === "pipeline_complete") {
        refreshJobState(jid);
      }
      if (event === "scene_refining") {
        setSceneProgress({
          current: (p.current_scene as number) || 0,
          total: (p.total_scenes as number) || 0,
        });
      }
      if (event === "scene_refined") {
        setSceneProgress(prev => prev ? { ...prev, current: (p.current_scene as number) || prev.current } : null);
      }
    }, async () => { await refreshJobState(jid); });

    return () => { ws.close(); setWsConnected(false); };
  }, [jobState.jobId]);

  const refreshJobState = useCallback(async (jid: string) => {
    if (!jid) return;
    try {
      const s: JobStatusModel = await getJobStatus(jid);
      setJobState(prev => ({
        ...prev,
        jobId: s.job_id, novelId: s.novel_id,
        novelTitle: (s as Record<string, unknown>).novel_title as string || prev.novelTitle,
        reviewStatus: s.review_status as ReviewStatus,
        progressPct: s.progress_pct,
        currentStep: (s as Record<string, unknown>).current_step as string || "",
        scenes: ((s as Record<string, unknown>).scenes as SceneUIModel[]) || [],
        beats: ((s as Record<string, unknown>).beats as BeatUIModel[]) || [],
        characters: ((s as Record<string, unknown>).master_cast_list as CharacterUIModel[]) || [],
        screenplay: ((s as Record<string, unknown>).screenplay as Record<string, unknown>) || {},
        storyBible: ((s as Record<string, unknown>).story_bible as Record<string, unknown>) || {},
      }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (urlJobId) refreshJobState(urlJobId); }, [urlJobId, refreshJobState]);

  const handleJobSubmitted = useCallback((newJobId: string, newNovelId: string) => {
    router.replace(`/workspace?job_id=${newJobId}&novel_id=${newNovelId}`, { scroll: false });
    setJobState(prev => ({ ...prev, jobId: newJobId, novelId: newNovelId, reviewStatus: "uploading", progressPct: 0, eventLog: [] }));
    setCurrentStage("parsing");
  }, [router]);

  const loadHistoryJob = useCallback((jid: string) => {
    router.replace(`/workspace?job_id=${jid}`, { scroll: false });
    setJobState(prev => ({ ...prev, jobId: jid, novelId: "", reviewStatus: "uploading", progressPct: 0, eventLog: [] }));
    refreshJobState(jid);
  }, [router, refreshJobState]);

  const hasJob = !!jobState.jobId && !jobState.jobId.startsWith("mock");
  const isProcessing = jobState.reviewStatus !== "idle" && ["uploading", "analyzing", "generating"].includes(jobState.reviewStatus);
  const isCompleted = jobState.reviewStatus === "completed";
  const subTasks = getSubTasks(jobState.progressPct, currentStage);

  const tabs: { id: TabId; label: string; icon: string; badge?: string }[] = [
    { id: "upload", label: "上传", icon: "", badge: undefined },
    { id: "scenes", label: "场景工作台", icon: "", badge: jobState.scenes.length > 0 ? String(jobState.scenes.length) : undefined },
    { id: "characters", label: "角色图谱", icon: "", badge: jobState.characters.length > 0 ? String(jobState.characters.length) : undefined },
    { id: "screenplay", label: "剧本查看器", icon: "", badge: isCompleted ? "✓" : undefined },
  ];

  // Show loading while checking auth
  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-[--nuss-accent]/30 border-t-[--nuss-accent] rounded-full animate-spin" />
          <p className="text-sm text-[--nuss-muted]">验证身份中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* ── 顶部状态栏 ── */}
      <div className="flex items-center justify-between mb-4 p-3 console-panel text-xs gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[--nuss-muted]">任务: <code className="text-[--nuss-text]">{jobState.jobId || "—"}</code></span>
          {jobState.novelTitle && <span className="text-[--nuss-muted]">📖 <span className="text-[--nuss-text]">{jobState.novelTitle}</span></span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfig(true)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${hasModelConfig() ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10 animate-pulse"}`}
          >
            {hasModelConfig() ? "模型已配置" : "配置模型"}
          </button>
          {hasJob && isProcessing && (
            <div className="flex items-center gap-2">
              <div className="w-28 h-2 rounded-full bg-[--nuss-border] overflow-hidden">
                <div className="h-full rounded-full bg-[--nuss-accent] transition-all duration-700" style={{ width: `${Math.max(jobState.progressPct, 1)}%` }} />
              </div>
              <span className="text-[11px] text-[--nuss-accent] font-medium">{Math.round(jobState.progressPct)}%</span>
            </div>
          )}
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
            {wsConnected ? "实时连接" : "未连接"}
          </span>
          <StatusBadge status={jobState.reviewStatus} />
        </div>
        {jobState.currentStep && (
          <div className="w-full text-[10px] text-[--nuss-muted] truncate mt-0.5 flex items-center gap-2">
            <span>⏳ {jobState.currentStep}</span>
            {sceneProgress && sceneProgress.current > 0 && (
              <span className="text-[--nuss-accent] font-medium">
                ▸ 场景 {sceneProgress.current}/{sceneProgress.total}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Scene Health Dashboard (完成时显示) ── */}
      {hasJob && isCompleted && jobState.screenplay && (jobState.screenplay as Record<string,unknown>).generation_stats && (() => {
        const st = (jobState.screenplay as Record<string,unknown>).generation_stats as Record<string,unknown>;
        const h = (st.scene_health || {}) as Record<string,unknown>;
        return (
          <div className="mb-4 console-panel animate-slide-up grid grid-cols-4 md:grid-cols-7 gap-2 text-center text-[10px]">
            {[
              ["场景", `${st.total_scenes || 0}场`],
              ["节拍", `${st.total_beats || 0}个`],
              ["覆盖率", `${Math.round((st.coverage as number || 0) * 100)}%`],
              ["平均字", `${h.avg_chars || 0}字`],
              ["节拍/场", `${h.avg_beats || 0}`],
              ["空场率", `${Math.round((h.empty_scene_rate as number || 0) * 100)}%`],
              ["质量", `${h.avg_quality ? (Number(h.avg_quality)*100).toFixed(0)+"%" : "—"}`],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div className="text-[--nuss-muted]">{label}</div>
                <div className="font-semibold text-[--nuss-text]">{val}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Tab 导航 ── */}
      <div className="flex gap-1 mb-4 border-b border-[--nuss-border] overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-[1px] flex items-center gap-1.5 ${
              activeTab === tab.id ? "border-[--nuss-accent] text-[--nuss-text]" : "border-transparent text-[--nuss-muted] hover:text-[--nuss-text]"
            }`}>
            <span>{tab.icon}</span>{tab.label}
            {tab.badge && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[--nuss-accent]/20 text-[--nuss-accent]">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── 子任务进度条（处理中时显示）── */}
      {hasJob && isProcessing && (
        <div className="mb-4 console-panel animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">处理进度</span>
            <span className="text-[10px] text-[--nuss-muted]">{Math.round(jobState.progressPct)}%</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {subTasks.map(t => (
              <div key={t.key} className={`text-center p-2 rounded border text-[10px] transition-all ${
                t.status === "done" ? "border-green-500/30 bg-green-500/5 text-green-400" :
                t.status === "running" ? "border-[--nuss-accent]/50 bg-[--nuss-accent]/10 text-[--nuss-accent] animate-pulse" :
                t.status === "error" ? "border-red-500/30 bg-red-500/5 text-red-400" :
                "border-[--nuss-border]/30 text-[--nuss-muted]"
              }`}>
                <div className="text-base mb-0.5">
                  {t.status === "done" ? "✅" : t.status === "running" ? "🔄" : t.status === "error" ? "❌" : "⬜"}
                </div>
                <div className="font-medium">{t.label}</div>
                <div className="text-[8px] opacity-60">{t.startPct}-{t.endPct}%</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[--nuss-muted] mt-2 border-t border-[--nuss-border]/30 pt-1.5 font-medium">
            {jobState.currentStep}
          </p>
          <p className="text-[12px] text-amber-600 mt-1.5 font-semibold animate-pulse">
            ⏳ 若进度长时间未变化，请刷新页面查看最新进度或重新提交
          </p>
        </div>
      )}

      {/* ── Tab 内容 ── */}
      <div className="min-h-[400px]">
        <div className={activeTab === "upload" ? "" : "hidden"}>
          <UploadPanelInline jobState={jobState} wsConnected={wsConnected} onJobSubmitted={handleJobSubmitted}
            historyJobs={historyJobs} onLoadHistory={loadHistoryJob} onOpenModelConfig={() => setShowConfig(true)} />
        </div>
        <div className={activeTab === "scenes" ? "" : "hidden"}>
          <SceneDistribution scenes={jobState.scenes} characters={jobState.characters} />
          <SceneEditor scenes={jobState.scenes} reviewStatus={jobState.reviewStatus} title={jobState.novelTitle} />
        </div>
        <div className={activeTab === "characters" ? "" : "hidden"}>
          <CharacterGraph characters={jobState.characters} scenes={jobState.scenes} reviewStatus={jobState.reviewStatus} />
        </div>
        <div className={activeTab === "screenplay" ? "" : "hidden"}>
          <ScreenplayViewer scenes={jobState.scenes} reviewStatus={jobState.reviewStatus} screenplayRaw={jobState.screenplay} characters={jobState.characters} />
        </div>
      </div>

      {/* ── 模型配置弹窗 ── */}
      <ModelConfigPanel open={showConfig} onClose={() => setShowConfig(false)} />

      {/* ── 事件日志 ── */}
      <details className="mt-6 console-panel text-xs">
        <summary className="cursor-pointer font-medium text-[--nuss-muted] hover:text-[--nuss-text] select-none">
          事件日志（{jobState.eventLog.length} 条）
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5 font-mono text-[10px]">
          {jobState.eventLog.length === 0 ? (
            <p className="text-[--nuss-muted] italic py-2">暂无事件</p>
          ) : (
            jobState.eventLog.slice(-80).map((entry, i) => (
              <div key={i} className="flex gap-2 hover:bg-[--nuss-accent]/5 px-1 rounded">
                <span className="text-[--nuss-muted] shrink-0 w-16">{entry.timestamp?.slice(11, 19) || ""}</span>
                <span className={`shrink-0 ${entry.event === "pipeline_error" ? "text-red-400" : "text-[--nuss-accent]"}`}>[{entry.event}]</span>
                <span className="text-[--nuss-muted] truncate">{entry.message || ""}</span>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Upload Panel (inline)
// ═══════════════════════════════════════════════════

function UploadPanelInline({ jobState, onJobSubmitted, historyJobs, onLoadHistory, onOpenModelConfig }: {
  jobState: SharedJobState; wsConnected: boolean;
  onJobSubmitted: (jid: string, nid: string) => void;
  historyJobs: Array<{ job_id: string; novel_title: string; review_status: string; created_at: string }>;
  onLoadHistory: (jid: string) => void;
  onOpenModelConfig: () => void;
}) {
  const isCompleted = jobState.reviewStatus === "completed";
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f); setErrMsg(null);
    try { setFileText(await f.text()); }
    catch { setErrMsg("无法读取文件，请检查编码"); }
  };

  const handleSubmit = async () => {
    if (!file || !fileText) return;
    // 上传前校验模型配置
    if (!hasModelConfig()) {
      setErrMsg("请先在「模型配置」中设置 API Key、Base URL、Model 并测试连接成功后再上传小说。");
      return;
    }
    setIsSubmitting(true); setErrMsg(null);
    try {
      const mc = getModelConfig();
      const res = await fetch("/api/v1/jobs/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_text: fileText, file_type: file.name.split(".").pop()?.toLowerCase() || "txt", novel_title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, llm_config: mc }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { message?: string }).message || `HTTP ${res.status}`); }
      const d = await res.json();
      onJobSubmitted(d.job_id, d.novel_id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "提交失败，请确认后端已启动");
    } finally { setIsSubmitting(false); }
  };

  const isProcessing = jobState.reviewStatus !== "idle" && ["uploading", "analyzing", "generating"].includes(jobState.reviewStatus);
  const hasActiveJob = !!jobState.jobId && !jobState.jobId.startsWith("mock");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* 左列：上传 */}
      <div className="lg:col-span-2 space-y-4">
        {!hasModelConfig() && (
          <div className="p-4 rounded-lg border-2 border-dashed border-amber-400/60 bg-amber-50 text-center">
            <p className="text-sm font-semibold text-amber-700 mb-1">请先配置模型</p>
            <p className="text-xs text-amber-600 mb-3">需要设置 API Key、Base URL 和 Model Name 后才能上传小说</p>
            <button onClick={onOpenModelConfig} className="px-4 py-1.5 rounded text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              打开模型配置
            </button>
          </div>
        )}
        <div className={`blank-safe-card p-6 text-center ${isProcessing ? "opacity-40 pointer-events-none cursor-not-allowed" : "cursor-pointer"}`} onClick={() => !isProcessing && fileInputRef.current?.click()}>
          <input ref={fileInputRef} type="file" accept=".txt,.docx,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {file ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-[10px] text-[--nuss-muted]">{(file.size / 1024).toFixed(1)} KB · {fileText.length} 字符</p>
              <button onClick={e => { e.stopPropagation(); setFile(null); setFileText(""); }} className="text-[10px] text-[--nuss-muted] hover:text-[--nuss-text] underline" disabled={isProcessing}>移除</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[--nuss-text]">拖拽小说文件或点击选择</p>
              <p className="text-[10px] text-[--nuss-muted]">.txt / .docx / .pdf</p>
            </div>
          )}
        </div>

        {errMsg && <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">{errMsg}</div>}

        <button disabled={!file || isSubmitting || isProcessing} onClick={handleSubmit} className="console-btn-primary w-full text-sm py-2.5">
          {isSubmitting ? "提交中..."
          : isProcessing ? `处理中 ${Math.round(jobState.progressPct)}%`
          : "开始改编"}
        </button>

        {hasActiveJob && isCompleted && (
          <div className="console-panel bg-green-500/5 border-green-500/30 animate-slide-up text-sm">
            ✅ 处理完成！{jobState.scenes.length} 场 · {jobState.characters.length} 角色 · 切换标签页查看结果 →
          </div>
        )}
        {hasActiveJob && jobState.reviewStatus === "error" && (
          <div className="console-panel bg-red-500/5 border-red-500/30 animate-slide-up">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">❌</span>
              <div>
                <p className="text-sm font-semibold text-red-400">剧本生成失败</p>
                <p className="text-xs text-red-400/70 mt-1">{jobState.currentStep || "未知错误"}</p>
                <p className="text-[10px] text-[--nuss-muted] mt-2">请重新提交文件重试。持续失败请检查 DeepSeek API。</p>
              </div>
            </div>
          </div>
        )}
        {hasActiveJob && jobState.reviewStatus === "completed_partial" && (
          <div className="console-panel bg-yellow-500/5 border-yellow-500/30 animate-slide-up">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-yellow-400">部分生成成功</p>
                <p className="text-xs text-yellow-400/70 mt-1">{jobState.currentStep || "部分场景未生成"}</p>
                <p className="text-[10px] text-[--nuss-muted] mt-2">部分场景因文本过短或API限制未能生成节拍。已生成的场景可正常查看。</p>
              </div>
            </div>
          </div>
        )}

        {fileText && (
          <details className="console-panel text-xs">
            <summary className="cursor-pointer text-[--nuss-muted] hover:text-[--nuss-text] select-none">文本预览（{fileText.length} 字符）</summary>
            <pre className="mt-2 max-h-40 overflow-y-auto text-[10px] leading-relaxed text-[--nuss-muted] whitespace-pre-wrap border-t border-[--nuss-border]/30 pt-2 font-mono">{fileText.slice(0, 800)}</pre>
          </details>
        )}
      </div>

      {/* 右列：历史 + 事件 */}
      <div className="space-y-4">
        {historyJobs.length > 0 && (
          <div className="console-panel">
            <h4 className="text-xs font-semibold mb-2">📚 历史任务</h4>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {historyJobs.slice(0, 10).map(j => (
                <button key={j.job_id} onClick={() => onLoadHistory(j.job_id)}
                  className={`w-full text-left p-2 rounded text-xs hover:bg-[--nuss-accent]/10 transition-colors flex items-center justify-between ${
                    j.job_id === jobState.jobId ? "bg-[--nuss-accent]/10 border border-[--nuss-accent]/30" : ""
                  }`}>
                  <span className="truncate flex-1">{j.novel_title || j.job_id}</span>
                  <span className={`text-[10px] ml-2 shrink-0 ${
                    j.review_status === "completed" ? "text-green-400" : j.review_status === "error" ? "text-red-400" : "text-yellow-400"
                  }`}>{j.review_status === "completed" ? "完成" : j.review_status === "generating" ? "生成中" : j.review_status === "analyzing" ? "分析中" : j.review_status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="console-panel">
          <h4 className="text-xs font-semibold mb-2">📡 实时事件</h4>
          <div className="max-h-52 overflow-y-auto space-y-1 font-mono text-[10px]">
            {jobState.eventLog.length === 0 ? <p className="text-[--nuss-muted] italic">等待事件...</p>
            : jobState.eventLog.slice(-12).reverse().map((e, i) => (
                <div key={i} className="flex gap-1.5 text-[--nuss-muted]"><span className="text-[--nuss-accent] shrink-0">[{e.event}]</span><span className="truncate">{e.message || ""}</span></div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const map: Record<string, { label: string; cls: string }> = {
    uploading:  { label: "上传中",  cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    analyzing:  { label: "分析中",  cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    pending_character: { label: "需审核", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    pending_scene:     { label: "需审核", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    generating: { label: "生成中",  cls: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    completed:  { label: "已完成 ✓", cls: "bg-green-500/20 text-green-400 border-green-500/30" },
    error:      { label: "失败",    cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const cfg = map[status] || map.error;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.cls}`}>{cfg.label}</span>;
}
