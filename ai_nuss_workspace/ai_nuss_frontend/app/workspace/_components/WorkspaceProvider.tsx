"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { SceneUIModel, CharacterUIModel, BeatUIModel, ReviewStatus, JobStatusModel, WebSocketFrameModel } from "../../api_client";
import { getJobStatus, connectJobStream } from "../../api_client";
import Sidebar from "./Sidebar";
import JobHeader from "./JobHeader";
import Metrics from "./Metrics";

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

export type TabId = "home" | "upload" | "scenes" | "characters" | "screenplay";

export interface SharedJobState {
  jobId: string; novelId: string; novelTitle: string;
  reviewStatus: ReviewStatus; progressPct: number; currentStep: string;
  scenes: SceneUIModel[]; beats: BeatUIModel[]; characters: CharacterUIModel[];
  screenplay: Record<string, unknown>; storyBible: Record<string, unknown>;
  eventLog: Array<{ timestamp: string; event: string; message?: string; stage?: string }>;
}

export interface WorkspaceContextValue {
  jobState: SharedJobState;
  setJobState: React.Dispatch<React.SetStateAction<SharedJobState>>;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  wsConnected: boolean;
  isProcessing: boolean;
  isCompleted: boolean;
  phases: PhaseDisplay[];
  sceneProgress: { current: number; total: number } | null;
  refreshJobState: (jid: string) => Promise<void>;
  handleJobSubmitted: (newJobId: string, newNovelId: string) => void;
  historyJobs: Array<{ job_id: string; novel_title: string; review_status: string; created_at: string }>;
  loadHistoryJob: (jid: string) => void;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
}

export interface PhaseDisplay {
  key: string; label: string; description: string; icon: string;
  startPct: number; endPct: number; status: "pending" | "running" | "done";
}

const USER_PHASES = [
  { key: "reading",     label: "理解故事", description: "分析人物关系与故事结构", icon: "📖", startPct: 0,  endPct: 40 },
  { key: "structuring", label: "整理结构", description: "划分场景，构建戏剧节奏", icon: "🎬", startPct: 40, endPct: 65 },
  { key: "writing",     label: "撰写剧本", description: "生成对话与导演注释",   icon: "✍️", startPct: 65, endPct: 100 },
];

const STAGE_TO_PHASE: Record<string, string> = {
  parsing: "reading", narrative: "reading", bible: "reading", characters: "reading",
  scenes: "structuring", beats: "writing", done: "writing",
};

function getPhases(progress: number, stage: string): PhaseDisplay[] {
  const currentPhase = STAGE_TO_PHASE[stage] || "reading";
  return USER_PHASES.map((p) => {
    if (progress >= p.endPct) return { ...p, status: "done" as const };
    if (p.key === currentPhase && progress >= p.startPct && progress < p.endPct)
      return { ...p, status: "running" as const };
    return { ...p, status: "pending" as const };
  });
}

// ═══════════════════════════════════════
// Context
// ═══════════════════════════════════════

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

// ═══════════════════════════════════════
// Provider
// ═══════════════════════════════════════

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlJobId = searchParams.get("job_id") || "";
  const connectedJobRef = useRef("");

  const [jobState, setJobState] = useState<SharedJobState>({
    jobId: urlJobId, novelId: searchParams.get("novel_id") || "", novelTitle: "",
    reviewStatus: "idle" as ReviewStatus, progressPct: 0, currentStep: "",
    scenes: [], beats: [], characters: [], screenplay: {}, storyBible: {},
    eventLog: [],
  });

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [wsConnected, setWsConnected] = useState(false);
  const [currentStage, setCurrentStage] = useState("parsing");
  const [sceneProgress, setSceneProgress] = useState<{ current: number; total: number } | null>(null);
  const [historyJobs, setHistoryJobs] = useState<Array<{ job_id: string; novel_title: string; review_status: string; created_at: string }>>([]);
  const [showConfig, setShowConfig] = useState(false);

  const hasJob = !!jobState.jobId && !jobState.jobId.startsWith("mock");
  const isProcessing = jobState.reviewStatus !== "idle" && ["uploading", "analyzing", "generating"].includes(jobState.reviewStatus);
  const isCompleted = jobState.reviewStatus === "completed";
  const phases = getPhases(jobState.progressPct, currentStage);

  // ── Fetch history ──
  useEffect(() => {
    fetch("/api/v1/jobs/").then(r => r.json()).then(d => setHistoryJobs(d.jobs || [])).catch(() => {});
  }, []);

  // ── refreshJobState ──
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

      if (event === "scenes_segmented" || event === "scenes_enriched" || event === "screenplay_generated" || event === "pipeline_complete") {
        refreshJobState(jid);
      }
      if (event === "scene_refining") {
        setSceneProgress({ current: (p.current_scene as number) || 0, total: (p.total_scenes as number) || 0 });
      }
      if (event === "scene_refined") {
        setSceneProgress(prev => prev ? { ...prev, current: (p.current_scene as number) || prev.current } : null);
      }
    }, async () => { await refreshJobState(jid); });

    return () => { ws.close(); setWsConnected(false); };
  }, [jobState.jobId]);

  const handleJobSubmitted = useCallback((newJobId: string, newNovelId: string) => {
    router.replace(`/workspace?job_id=${newJobId}&novel_id=${newNovelId}`, { scroll: false });
    setJobState(prev => ({ ...prev, jobId: newJobId, novelId: newNovelId, reviewStatus: "uploading", progressPct: 0, eventLog: [] }));
    setCurrentStage("parsing");
    setActiveTab("upload");
  }, [router]);

  const loadHistoryJob = useCallback((jid: string) => {
    router.replace(`/workspace?job_id=${jid}`, { scroll: false });
    setJobState(prev => ({ ...prev, jobId: jid, novelId: "", reviewStatus: "uploading", progressPct: 0, eventLog: [] }));
    refreshJobState(jid);
  }, [router, refreshJobState]);

  const ctx: WorkspaceContextValue = {
    jobState, setJobState, activeTab, setActiveTab, wsConnected,
    isProcessing, isCompleted, phases, sceneProgress,
    refreshJobState, handleJobSubmitted, historyJobs, loadHistoryJob,
    showConfig, setShowConfig,
  };

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="flex h-screen bg-[var(--nuss-bg)] overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className={activeTab === "home" ? "" : "p-4 md:p-6 max-w-7xl mx-auto space-y-4"}>
            {activeTab !== "home" && (
              <>
                <JobHeader />
                <Metrics />
              </>
            )}
            {children}
          </div>
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}
