"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { SceneUIModel, BeatUIModel, ReviewStatus, LocalEditOperation, LocalEditTone, LocalEditResult } from "../api_client";
import { localEdit } from "../api_client";
import ExportModal from "./export_modal";
import FloatingToolbar from "./floating_toolbar";
import { recordEdit, acceptEdit, type EditRecord } from "./local_edit_utils";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface RichBeat {
  beat_id: string; beat_type: string;
  summary?: string; emotion?: string; intensity?: number;
  cast?: string[];
  actions?: Array<{ character_id?: string; description: string }>;
  dialogues?: Array<{ speaker_id?: string; line?: string; emotion?: string; subtext?: string }>;
  voice_overs?: Array<{ character_id?: string; content: string }>;
  inner_monologues?: Array<{ character_id?: string; content: string }>;
  captions?: Array<{ content: string }>;
  flashbacks?: Array<{ trigger?: string; content?: string }>;
}

interface DirectorNote {
  emotion?: string; visual_style?: string; camera_plan?: string[];
  lighting?: string; music?: string; pacing?: string; director_comment?: string;
}

type EditorMode = "viewing" | "editing";
type EditPhase = "idle" | "selecting" | "processing" | "preview";

// ═══════════════════════════════════════════════════════════
// Labels (unchanged)
// ═══════════════════════════════════════════════════════════

const EMOTION_LABELS: Record<string, string> = {
  suspense: "悬疑", tense: "紧张", sad: "悲伤", romantic: "浪漫",
  warm: "温暖", action: "动作", hopeful: "希望", mysterious: "神秘", neutral: "中性",
};
const EMOTION_COLORS: Record<string, string> = {
  suspense: "bg-purple-500/20 text-purple-400", tense: "bg-red-500/20 text-red-400",
  sad: "bg-blue-500/20 text-blue-400", romantic: "bg-pink-500/20 text-pink-400",
  warm: "bg-orange-500/20 text-orange-400", action: "bg-yellow-500/20 text-yellow-400",
  hopeful: "bg-green-500/20 text-green-400", mysterious: "bg-indigo-500/20 text-indigo-400",
  neutral: "bg-gray-500/20 text-gray-400",
};
const STYLE_LABELS: Record<string, string> = {
  crime_drama: "犯罪剧", suspense_thriller: "悬疑惊悚", realism: "现实主义",
  romantic_drama: "浪漫剧", sci_fi: "科幻", historical: "历史", action: "动作", fantasy: "奇幻",
};
const SHOT_LABELS: Record<string, string> = {
  wide_shot: "广角", medium_shot: "中景", close_up: "特写",
  tracking_shot: "跟拍", over_shoulder: "过肩", handheld: "手持", establishing_shot: "定场",
};
const PACING_LABELS: Record<string, string> = { slow: "慢", medium: "中速", fast: "快" };
const PACING_COLORS: Record<string, string> = {
  slow: "bg-blue-500/20 text-blue-400", medium: "bg-yellow-500/20 text-yellow-400", fast: "bg-red-500/20 text-red-400",
};
const TIMELINE_LABELS: Record<string, string> = {
  location_shift: "转场", time_shift: "时间推移", flashback: "闪回",
  montage: "蒙太奇", simultaneous: "平行时空", sequential: "",
};

// ═══════════════════════════════════════════════════════════
// Text replacement helper — finds and replaces text within scene beats
// ═══════════════════════════════════════════════════════════

function replaceTextInScene(scene: SceneUIModel, originalText: string, newText: string): SceneUIModel {
  const searchStr = originalText.trim();

  const clone = JSON.parse(JSON.stringify(scene)) as SceneUIModel;
  const beats = (clone as Record<string, unknown>).beats as RichBeat[] | undefined;
  const rawBlock = (clone as Record<string, unknown>).raw_scene_text_block as string | undefined;
  const sceneSummary = (clone as Record<string, unknown>).summary as string | undefined;

  let replaceCount = 0;
  let replaceLocation = "";

  if (rawBlock?.includes(searchStr)) {
    (clone as Record<string, unknown>).raw_scene_text_block = rawBlock.replace(searchStr, newText);
    replaceCount++; replaceLocation = "raw_scene_text_block";
  }

  if (beats) {
    beats.forEach((beat, bi) => {
      (beat.actions || []).forEach((a, ai) => {
        if (a.description?.includes(searchStr)) { a.description = a.description.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].actions[${ai}].description`; }
      });
      (beat.dialogues || []).forEach((d, di) => {
        if (d.line?.includes(searchStr)) { d.line = d.line.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].dialogues[${di}].line`; }
        if (d.subtext?.includes(searchStr)) { d.subtext = d.subtext.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].dialogues[${di}].subtext`; }
      });
      (beat.voice_overs || []).forEach((v, vi) => {
        if (v.content?.includes(searchStr)) { v.content = v.content.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].voice_overs[${vi}].content`; }
      });
      (beat.inner_monologues || []).forEach((m, mi) => {
        if (m.content?.includes(searchStr)) { m.content = m.content.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].inner_monologues[${mi}].content`; }
      });
      (beat.captions || []).forEach((c, ci) => {
        if (c.content?.includes(searchStr)) { c.content = c.content.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].captions[${ci}].content`; }
      });
      (beat.flashbacks || []).forEach((f, fi) => {
        if (f.content?.includes(searchStr)) { f.content = f.content.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].flashbacks[${fi}].content`; }
      });
      if (beat.summary?.includes(searchStr)) { beat.summary = beat.summary.replace(searchStr, newText); replaceCount++; replaceLocation = `beats[${bi}].summary`; }
    });
  }

  if (sceneSummary?.includes(searchStr)) {
    (clone as Record<string, unknown>).summary = sceneSummary.replace(searchStr, newText);
    replaceCount++; replaceLocation = "scene.summary";
  }

  return clone;
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export default function ScreenplayViewer({ jobId: propJobId, scenes: originalScenes, reviewStatus, screenplayRaw, characters }: {
  jobId?: string; scenes: SceneUIModel[]; reviewStatus: ReviewStatus; screenplayRaw?: Record<string, unknown>;
  characters?: Array<{ character_id: string; canonical_name: string }>;
}) {
  // Build character ID → name mapping
  const charNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of (characters || [])) m[c.character_id] = c.canonical_name;
    return m;
  }, [characters]);

  const [currentPage, setCurrentPage] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [showSingleExport, setShowSingleExport] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // ── Two-Mode State Machine ──
  const [editorMode, setEditorMode] = useState<EditorMode>("viewing");
  const [editPhase, setEditPhase] = useState<EditPhase>("idle");

  // ── Mutable scenes (local edits applied here) ──
  const [editedScenes, setEditedScenes] = useState<SceneUIModel[]>([]);
  const initializedRef = useRef(false);

  // Sync editedScenes from originalScenes ONLY on first data load, NOT on every prop change.
  // Previously a useEffect([originalScenes]) reset edits every time the parent re-rendered.
  useEffect(() => {
    if (!initializedRef.current && originalScenes.length > 0) {
      setEditedScenes(JSON.parse(JSON.stringify(originalScenes)));
      initializedRef.current = true;
    }
  }, [originalScenes]);

  // If originalScenes changes entirely (new job loaded), reset
  const originalLenRef = useRef(originalScenes.length);
  useEffect(() => {
    if (originalScenes.length > 0 && originalScenes.length !== originalLenRef.current) {
      originalLenRef.current = originalScenes.length;
      setEditedScenes(JSON.parse(JSON.stringify(originalScenes)));
    }
  }, [originalScenes.length]);

  const scenes = editedScenes.length > 0 ? editedScenes : originalScenes;
  if (scenes.length === 0 && originalScenes.length > 0) {
    // fallback during initial render before useEffect runs
    // scenes will use originalScenes on next line, this block ensures consistency
  }
  const isEmpty = scenes.length === 0;
  const totalPages = scenes.length;
  const scene = scenes[currentPage];
  const hasAnnotations = scenes.some(s => !!((s as Record<string, unknown>).director_note as DirectorNote | undefined)?.emotion);

  // ── AI Local Editing State ──
  const [selectedText, setSelectedText] = useState<string>("");
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const [showEditDoneToast, setShowEditDoneToast] = useState<boolean>(false);
  const editDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editResult, setEditResult] = useState<LocalEditResult | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [lastEditRecord, setLastEditRecord] = useState<EditRecord | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const originalTextRef = useRef<string>("");
  const scrollRef = useRef<number>(0);

  // Reset edit state when changing pages
  useEffect(() => {
    setSelectedText("");
    setToolbarPos(null);
    setEditResult(null);
    setEditError(null);
    setEditPhase("idle");
  }, [currentPage]);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => { if (editDoneTimerRef.current) clearTimeout(editDoneTimerRef.current); };
  }, []);

  // ── Enter / Exit Edit Mode ──
  const enterEditMode = useCallback(() => {
    setEditorMode("editing");
    setEditPhase("idle");
    setSelectedText("");
    setToolbarPos(null);
    setEditResult(null);
    setEditError(null);
  }, []);

  const exitEditMode = useCallback(() => {
    setEditorMode("viewing");
    setEditPhase("idle");
    setSelectedText("");
    setToolbarPos(null);
    setEditResult(null);
    setEditError(null);
  }, []);

  // ── Selection Handler (only active in edit mode + idle/selecting phases) ──
  const handleSelection = useCallback((e?: MouseEvent) => {
    if (editorMode !== "editing") return;
    // STRICT guard: only process selection in idle or selecting phase.
    // Preview/processing states must never trigger selection updates.
    if (editPhase !== "selecting" && editPhase !== "idle") return;

    // If the click target is inside the floating toolbar, don't clear selection
    if (e?.target instanceof Node && document.querySelector('[data-floating-toolbar]')?.contains(e.target)) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setTimeout(() => {
        // Re-check: if focus moved to toolbar, don't clear
        if (document.activeElement?.closest('[data-floating-toolbar]')) return;
        const currentSel = window.getSelection();
        if (!currentSel || currentSel.isCollapsed || !currentSel.toString().trim()) {
          if (editPhase === "selecting" || editPhase === "idle") {
            setSelectedText("");
            setToolbarPos(null);
          }
        }
      }, 200);
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 5) return;

    const pageEl = pageRef.current;
    if (!pageEl) return;
    const range = sel.getRangeAt(0);
    if (!pageEl.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    setPreviewAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
    setEditResult(null);
    setEditError(null);
    setEditPhase("selecting");
    originalTextRef.current = text;
  }, [editorMode, editPhase]);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [handleSelection]);

  // ── AI Edit Action ──
  const handleEditAction = useCallback(async (operation: LocalEditOperation, tone?: LocalEditTone, customInstruction?: string) => {
    if (!selectedText || !scenes[currentPage]) return;

    scrollRef.current = window.scrollY;

    const jobId = propJobId || (screenplayRaw as Record<string, unknown>)?.job_id as string;
    if (!jobId) {
      setEditError("无法确定任务 ID，请刷新页面后重试");
      return;
    }

    const prevScene = currentPage > 0
      ? (scenes[currentPage - 1] as Record<string, unknown>)?.raw_scene_text_block as string || scenes[currentPage - 1]?.summary || ""
      : undefined;
    const nextScene = currentPage < totalPages - 1
      ? (scenes[currentPage + 1] as Record<string, unknown>)?.raw_scene_text_block as string || scenes[currentPage + 1]?.summary || ""
      : undefined;

    setEditLoading(true);
    setEditError(null);
    setEditResult(null);
    setEditPhase("processing");

    try {
      const result = await localEdit(jobId, operation, selectedText, tone, customInstruction, prevScene, nextScene);
      setEditResult(result);
      setEditPhase("preview");

      const sceneId = scene?.scene_id || `scene_${currentPage}`;
      const record = recordEdit(operation, sceneId, selectedText, result.edited_text, tone);
      setLastEditRecord(record);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "编辑失败");
      setEditPhase("selecting");
    } finally {
      setEditLoading(false);
    }
  }, [selectedText, scenes, currentPage, totalPages, scene, screenplayRaw, propJobId]);

  // ── Accept: replace text in React state, trigger re-render ──
  // Store latest values in refs to avoid stale closure (same pattern as handleDiscard)
  const acceptStateRef = useRef({ editResult: null as LocalEditResult | null, selectedText: "", scene: null as SceneUIModel | null, currentPage: 0, originalScenes: [] as SceneUIModel[] });
  acceptStateRef.current = { editResult, selectedText, scene, currentPage, originalScenes };

  const handleAccept = useCallback(() => {
    const s = acceptStateRef.current;
    if (!s.editResult || !s.selectedText || !s.scene) return;

    const updatedScene = replaceTextInScene(s.scene, s.selectedText, s.editResult.edited_text);
    setEditedScenes(prev => {
      const base = prev.length > 0 ? prev : s.originalScenes;
      const next = [...base];
      next[s.currentPage] = updatedScene;
      return next;
    });

    if (editDoneTimerRef.current) clearTimeout(editDoneTimerRef.current);
    setShowEditDoneToast(true);
    editDoneTimerRef.current = setTimeout(() => setShowEditDoneToast(false), 2500);
    setEditResult(null);
    setSelectedText("");
    setToolbarPos(null);
    setEditPhase("idle");
    setTimeout(() => window.scrollTo(0, scrollRef.current), 50);
  }, []);

  // ── Discard: close preview, keep editing ──
  const handleDiscard = useCallback(() => {
    setEditResult(null);
    setLastEditRecord(null);
    setEditError(null);
    setEditPhase("selecting");
  }, []);

  // (handleContinueEditing removed — Accept auto-returns to editing mode)

  const goPrev = useCallback(() => setCurrentPage(p => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => setCurrentPage(p => Math.min(totalPages - 1, p + 1)), [totalPages]);
  const goTo = useCallback((idx: number) => setCurrentPage(idx), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "Escape" && editorMode === "editing") {
      exitEditMode();
    }
  }, [goPrev, goNext, editorMode, exitEditMode]);

  // ── Operation label for display ──
  const operationLabel: Record<string, string> = {
    rewrite: "重写", expand: "扩写", shorten: "缩写", change_tone: "改语气", regenerate: "重新生成",
  };

  // ── Stable preview panel (inline JSX, no useMemo) ──
  const _showPreview = editPhase === "preview" && editResult && previewAnchor;
  // Position preview directly below selected text, flip above if no room
  const _gap = 8;
  const _estH = 260;
  const _top = _showPreview ? (previewAnchor.bottom + _estH + _gap > window.innerHeight ? previewAnchor.top - _estH - _gap : previewAnchor.bottom + _gap) : 0;
  const _left = _showPreview ? Math.max(12, Math.min(previewAnchor.left, window.innerWidth - 460)) : 0;

  return (
    <div className="animate-fade-in" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* ── Top Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">剧本查看器</h3>
          {/* ── Mode Indicator ── */}
          {editorMode === "editing" && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse">
              ✦ AI 编辑模式
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasAnnotations && (
            <button
              onClick={() => setShowAnnotations(!showAnnotations)}
              className={`text-[10px] px-2 py-1 rounded border ${showAnnotations ? "border-[--nuss-accent] text-[--nuss-accent] bg-[--nuss-accent]/10" : "border-[--nuss-border] text-[--nuss-muted]"}`}
            >
              {showAnnotations ? "隐藏批注" : "显示批注"}
            </button>
          )}
          <button
            onClick={() => setShowExport(true)}
            disabled={isEmpty || reviewStatus !== "completed"}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[--nuss-accent]/20 text-[--nuss-accent] border border-[--nuss-accent]/30 hover:bg-[--nuss-accent]/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            导出
          </button>
          {/* ── Edit / Done Toggle ── */}
          {editorMode === "viewing" ? (
            <button
              onClick={enterEditMode}
              disabled={isEmpty}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ✦ 编辑剧本
            </button>
          ) : (
            <button
              onClick={exitEditMode}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[--nuss-accent]/20 text-[--nuss-accent] border border-[--nuss-accent]/30 hover:bg-[--nuss-accent]/30 transition-all"
            >
              完成编辑
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="blank-safe-card p-10 text-center"><p className="text-[--nuss-muted] mt-3">暂无剧本数据</p></div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-240px)]">
          {/* ── 左侧：场景列表导航 ── */}
          <div className="w-40 shrink-0 space-y-0.5 overflow-y-auto no-print h-full">
            {scenes.map((s, i) => (
              <button
                key={s.scene_id}
                onClick={() => goTo(i)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] transition-all truncate ${
                  i === currentPage
                    ? "bg-[--nuss-accent]/20 text-[--nuss-accent] font-semibold border border-[--nuss-accent]/30"
                    : "text-[--nuss-muted] hover:text-[--nuss-text] hover:bg-[--nuss-accent]/5 border border-transparent"
                }`}
              >
                <span className="text-[10px] mr-1">{i + 1}.</span>
                {(s as Record<string, unknown>).director_note ? "💬 " : ""}
                {s.location}
              </button>
            ))}
          </div>

          {/* ── 中间：场景页面 ── */}
          <div className="flex-1 min-w-0 flex flex-col items-center h-full">
            {/* 翻页控件 */}
            <div className="flex items-center gap-3 mb-3 no-print shrink-0">
              <button onClick={goPrev} disabled={currentPage === 0}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">
                ◀ 上一场
              </button>
              <span className="text-xs text-[--nuss-muted] font-mono">
                {currentPage + 1} / {totalPages}
              </span>
              <button onClick={goNext} disabled={currentPage === totalPages - 1}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">
                下一场 ▶
              </button>
              <button
                onClick={() => setShowSingleExport(true)}
                className="text-[10px] px-2 py-1 rounded border border-[--nuss-border] text-[--nuss-muted] hover:text-[--nuss-accent] transition-colors"
                title="导出当前场景">
                导出本场
              </button>
            </div>

            {/* Scene Page — only this scrolls */}
            <div className="w-full max-w-[1000px] flex-1 min-h-0 overflow-y-auto overflow-x-hidden mb-3">
            <div
              ref={pageRef}
              className={`bg-white text-[#1a1a1a] shadow-lg rounded-sm w-full max-w-[1000px] p-10 font-serif leading-[1.9] text-[13px] min-h-[600px] relative transition-all duration-300 ${
                editorMode === "editing"
                  ? "ring-2 ring-purple-400/40 shadow-[0_0_24px_rgba(168,85,247,0.12)]"
                  : ""
              }`}
            >
              <ScenePageContent
                scene={scene}
                charNames={charNames}
                editorMode={editorMode}
                editPhase={editPhase}
                showEditDoneToast={showEditDoneToast}
                onAccept={handleAccept}
                onDiscard={handleDiscard}
              />
            </div>
            </div>

            {/* 翻页控件（底部） */}
            <div className="flex items-center gap-3 no-print shrink-0">
              <button onClick={goPrev} disabled={currentPage === 0}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">◀</button>
              <button onClick={goNext} disabled={currentPage === totalPages - 1}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">▶</button>
            </div>
          </div>

          {/* ── 右侧：导演批注 ── */}
          {showAnnotations && scene && (
            <div className="w-56 shrink-0 overflow-y-auto space-y-2 no-print h-full">
              <div className="text-[10px] text-[--nuss-muted] uppercase tracking-wider px-1">导演批注</div>
              <DirectorPanel scene={scene} />
            </div>
          )}
        </div>
      )}


      {_showPreview && (
      <div style={{ position: "fixed", top: _top, left: _left, width: 440, zIndex: 99999, pointerEvents: "auto", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(99,102,241,0.35)", boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(99,102,241,0.1)", background: "#fff", opacity: 0, transform: "translateY(8px)", animation: "previewFadeIn 0.18s ease forwards" }}>
        <style>{`@keyframes previewFadeIn { to { opacity: 1; transform: translateY(0); } }`}</style>
        <div style={{ padding: "10px 16px", background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.08))", borderBottom: "1px solid rgba(99,102,241,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
            AI 建议 · {editResult.operation === "rewrite" ? "重写" : editResult.operation === "expand" ? "扩写" : editResult.operation === "shorten" ? "缩写" : editResult.operation === "change_tone" ? "改语气" : "重新生成"}
          </span>
          <span style={{ fontSize: 11, color: "#888" }}>原文 {editResult.original_length} 字 → 修改后 {editResult.edited_length} 字</span>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          <div style={{ flex: 1, padding: "12px 14px", borderRight: "1px solid #e5e5e5" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>原文</div>
            <div style={{ lineHeight: 1.7, fontSize: 12, color: "#888", whiteSpace: "pre-wrap", fontStyle: "italic", maxHeight: 160, overflowY: "auto" }}>{originalTextRef.current || editResult.edited_text}</div>
          </div>
          <div style={{ flex: 1, padding: "12px 14px", background: "rgba(99,102,241,0.03)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", marginBottom: 6 }}>AI 版本</div>
            <div style={{ lineHeight: 1.7, fontSize: 12, color: "#1a1a1a", whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>{editResult.edited_text}</div>
          </div>
        </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(99,102,241,0.15)", background: "rgba(99,102,241,0.03)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={handleAccept} style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>确认</button>
              <button onClick={() => handleEditAction(editResult.operation, undefined, undefined)} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6366f1", background: "transparent" }}>重新生成</button>
              <button onClick={handleDiscard} style={{ padding: "6px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#888", border: "none", background: "transparent" }}>取消</button>
            </div>
      </div>
    )}


      {/* ── Floating AI Editing Toolbar (only in edit mode + selecting) ── */}
      <FloatingToolbar
        x={toolbarPos?.x || 0}
        y={toolbarPos?.y || 0}
        visible={editorMode === "editing" && editPhase !== "processing" && editPhase !== "preview" && !!toolbarPos && !!selectedText}
        loading={editLoading}
        onAction={handleEditAction}
      />

      {/* ── Edit Error Toast ── */}
      {editError && (
        <div
          className="animate-slide-up"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 10001,
            padding: "10px 16px", borderRadius: 10,
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5", fontSize: 12, maxWidth: 320,
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span>❌</span>
            <span>{editError}</span>
            <button onClick={() => setEditError(null)}
              style={{ marginLeft: "auto", color: "#fca5a5", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>
        </div>
      )}

      <ExportModal open={showExport} onClose={() => setShowExport(false)} scenes={scenes} />
      {scene && (
        <ExportModal open={showSingleExport} onClose={() => setShowSingleExport(false)} scenes={[scene]} singleScene />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Scene Page Content — single scene full page render
// ═══════════════════════════════════════════════════════════

function ScenePageContent({ scene, charNames, editorMode, editPhase, showEditDoneToast }: {
  scene: SceneUIModel;
  charNames: Record<string, string>;
  editorMode: EditorMode;
  editPhase: EditPhase;
  showEditDoneToast: boolean;
}) {
  const beats = (scene.beats || []) as RichBeat[];
  const time = (scene as Record<string, unknown>).time as string || scene.time_of_day || "日";
  const purpose = (scene as Record<string, unknown>).purpose as string | undefined;
  const mode = scene.timeline_mode;
  const rawBlock = (scene as Record<string, unknown>).raw_scene_text_block as string | undefined;
  const cast = ((scene as Record<string, unknown>).cast as string[]) || scene.character_ids || [];
  const castNames = cast.map(id => charNames[id] || id).filter(Boolean);

  return (
    <div>
      {/* ── Edit Mode Hint ── */}
      {editorMode === "editing" && editPhase === "idle" && (
        <div style={{
          margin: "0 0 16px 0", padding: "8px 14px", borderRadius: 8,
          background: "rgba(168,85,247,0.06)", border: "1px dashed rgba(168,85,247,0.25)",
          fontSize: 12, color: "#a78bfa", textAlign: "center",
        }}>
          ✦ 选中任意文本即可开始 AI 编辑
        </div>
      )}

      {/* ── Success toast: auto-dismisses after 2.5s ── */}
      {showEditDoneToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 10002,
          padding: "8px 20px", borderRadius: 20,
          background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
          color: "#22c55e", fontSize: 12, fontWeight: 600,
          backdropFilter: "blur(12px)",
          animation: "toastIn 0.3s ease, toastOut 0.3s ease 2.2s forwards",
        }}>
          <style>{"@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes toastOut{from{opacity:1}to{opacity:0}}"}</style>
          ✓ AI 编辑已应用
        </div>
      )}

      {/* ── Processing Indicator ── */}
      {editPhase === "processing" && (
        <div style={{ margin: "0 0 16px 0", padding: "10px 16px", borderRadius: 10, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#a78bfa" }}>
          <div style={{ width: 16, height: 16, border: "2px solid rgba(168,85,247,0.2)", borderTop: "2px solid #a78bfa", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          ✨ AI 编辑中...
        </div>
      )}



      {/* Scene Heading */}
      <div style={{ fontSize: 18, fontWeight: 700, color: "#b91c1c", marginBottom: 2, paddingBottom: 6, borderBottom: "1px solid #e5e5e5" }}>
        <span>第{scene.scene_number}场  {scene.location}  —  {time}</span>
        {mode && mode !== "sequential" && (
          <span style={{ fontSize: 13, color: "#999", marginLeft: 10, fontWeight: 400 }}>
            [{TIMELINE_LABELS[mode] || mode}]
          </span>
        )}
        {castNames.length > 0 && (
          <span style={{ fontSize: 12, color: "#888", marginLeft: 12, fontWeight: 400 }}>
            出场: {castNames.join("、")}
          </span>
        )}
      </div>

      {/* Purpose / Summary */}
      {purpose && (
        <div style={{ fontSize: 13, color: "#888", fontStyle: "italic", margin: "6px 0 16px 0", paddingLeft: 10, borderLeft: "3px solid #e5e5e5" }}>
          {purpose}
        </div>
      )}

      {/* Beats or raw text */}
      {beats.length === 0 ? (
        <div style={{ lineHeight: 2, color: "#888", fontStyle: "italic", whiteSpace: "pre-wrap", borderLeft: "2px solid #fcd34d", paddingLeft: 12 }}>
          {rawBlock || scene.summary || "暂无内容"}
        </div>
      ) : (
        beats.map((beat, bi) => (
          <div key={beat.beat_id || bi}>
            {(beat.captions || []).map((c, ci) => (
              <div key={`c-${ci}`} style={{ textAlign: "center", fontWeight: 700, fontSize: 14, margin: "10px 0" }}>{c.content}</div>
            ))}
            {(beat.flashbacks || []).length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: "#888", margin: "16px 0 8px" }}>FLASHBACK TO:</div>
            )}
            {(beat.actions || []).map((a, ai) => (
              <p key={`a-${ai}`} style={{ lineHeight: 2, textAlign: "justify", margin: "6px 0" }}>
                {a.character_id && <span style={{ color: "#b91c1c", fontWeight: 600 }}>[{a.character_id}] </span>}
                {a.description}
              </p>
            ))}
            {(beat.dialogues || []).map((d, di) => (
              <div key={`d-${di}`} style={{ margin: "12px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {d.speaker_id || "?"}
                  {d.emotion && <span style={{ fontSize: 12, color: "#888", fontStyle: "italic", marginLeft: 6 }}>({d.emotion})</span>}
                </div>
                <div style={{ margin: "0 60px", lineHeight: 1.9 }}>{d.line || "..."}</div>
                {d.subtext && <div style={{ fontSize: 11, color: "#ccc", marginTop: 2 }}>[{d.subtext}]</div>}
              </div>
            ))}
            {(beat.voice_overs || []).map((v, vi) => (
              <div key={`v-${vi}`} style={{ margin: "12px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{v.character_id || "?"} <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>(画外音)</span></div>
                <div style={{ margin: "0 60px", color: "#666", fontStyle: "italic" }}>{v.content}</div>
              </div>
            ))}
            {(beat.inner_monologues || []).map((m, mi) => (
              <div key={`m-${mi}`} style={{ margin: "12px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.character_id || "?"} <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>(内心独白)</span></div>
                <div style={{ margin: "0 60px", fontStyle: "italic" }}>{m.content}</div>
              </div>
            ))}
            {(beat.flashbacks || []).map((f, fi) => (
              <div key={`f-${fi}`} style={{ fontStyle: "italic", color: "#888", paddingLeft: 16, borderLeft: "2px solid #ddd", margin: "8px 0" }}>{f.content}</div>
            ))}
          </div>
        ))
      )}

      {/* End Marker */}
      <div style={{ textAlign: "center", color: "#ccc", marginTop: 32, fontSize: 16, letterSpacing: 8 }}>· · ·</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Director Panel (unchanged)
// ═══════════════════════════════════════════════════════════

function DirectorPanel({ scene }: { scene: SceneUIModel }) {
  const [expanded, setExpanded] = useState(true);
  const dn: DirectorNote | undefined = (scene as Record<string, unknown>).director_note as DirectorNote | undefined;
  const hasData = dn && dn.emotion;

  if (!hasData) {
    return (
      <div className="console-panel p-3 text-center text-[10px] text-[--nuss-muted]">
        🎥 此场景暂无导演建议
      </div>
    );
  }

  return (
    <div className="console-panel text-xs border-[--nuss-accent]/30">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[--nuss-accent]/5 transition-colors cursor-pointer select-none">
        <span className={`text-[10px] transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>▶</span>
        <span className="font-semibold text-[--nuss-accent] text-[11px]">Scene {scene.scene_number}</span>
        <span className="text-[10px] text-[--nuss-muted] truncate flex-1">{scene.location}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-slide-up border-t border-[--nuss-border]/30 pt-2">
          <div className="flex flex-wrap gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${EMOTION_COLORS[dn.emotion || "neutral"]}`}>{EMOTION_LABELS[dn.emotion || "neutral"]}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[--nuss-accent]/20 text-[--nuss-accent]">{STYLE_LABELS[dn.visual_style || ""] || dn.visual_style}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${PACING_COLORS[dn.pacing || "medium"]}`}>{PACING_LABELS[dn.pacing || "medium"]}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(dn.camera_plan || []).map((s, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[--nuss-accent]/10 text-[--nuss-accent] font-medium">{SHOT_LABELS[s] || s}</span>
            ))}
          </div>
          <div className="text-[10px] space-y-0.5">
            <p><span className="text-[--nuss-muted]">💡</span> <em className="text-[--nuss-text]">"{dn.lighting}"</em></p>
            <p><span className="text-[--nuss-muted]">🎵</span> <em className="text-[--nuss-text]">"{dn.music}"</em></p>
          </div>
          {dn.director_comment && (
            <p className="text-[10px] text-[--nuss-muted] italic border-l-2 border-[--nuss-accent]/30 pl-2">{dn.director_comment}</p>
          )}
        </div>
      )}
    </div>
  );
}
