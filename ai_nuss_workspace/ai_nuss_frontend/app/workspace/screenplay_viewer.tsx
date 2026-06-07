"use client";

import { useState, useCallback, useMemo } from "react";
import type { SceneUIModel, BeatUIModel, ReviewStatus } from "../api_client";
import ExportModal from "./export_modal";

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

// ═══════════════════════════════════════════════════════════
// Labels
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
// Main — 逐页翻看模式
// ═══════════════════════════════════════════════════════════

export default function ScreenplayViewer({ scenes, reviewStatus, characters }: {
  scenes: SceneUIModel[]; reviewStatus: ReviewStatus; screenplayRaw?: Record<string, unknown>;
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
  const isEmpty = scenes.length === 0;
  const totalPages = scenes.length;
  const scene = scenes[currentPage];
  const dn = scene ? (scene as Record<string, unknown>).director_note as DirectorNote | undefined : undefined;
  const hasAnnotations = scenes.some(s => !!((s as Record<string, unknown>).director_note as DirectorNote | undefined)?.emotion);

  const goPrev = useCallback(() => setCurrentPage(p => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => setCurrentPage(p => Math.min(totalPages - 1, p + 1)), []);
  const goTo = useCallback((idx: number) => setCurrentPage(idx), []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  }, [goPrev, goNext]);

  return (
    <div className="animate-fade-in" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4 no-print">
        <h3 className="text-lg font-semibold">剧本查看器</h3>
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
        </div>
      </div>

      {isEmpty ? (
        <div className="blank-safe-card p-10 text-center"><p className="text-[--nuss-muted] mt-3">暂无剧本数据</p></div>
      ) : (
        <div className="flex gap-4">
          {/* ── 左侧：场景列表导航 ── */}
          <div className="w-40 shrink-0 space-y-0.5 max-h-[calc(100vh-180px)] overflow-y-auto no-print">
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
          <div className="flex-1 min-w-0 flex flex-col items-center">
            {/* 翻页控件 */}
            <div className="flex items-center gap-3 mb-3 no-print">
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

            {/* Scene Page */}
            <div className="bg-white text-[#1a1a1a] shadow-lg rounded-sm w-full max-w-[720px] p-10 font-serif leading-[1.9] text-[14px] min-h-[600px]">
              <ScenePageContent scene={scene} charNames={charNames} />
            </div>

            {/* 翻页控件（底部） */}
            <div className="flex items-center gap-3 mt-4 no-print">
              <button onClick={goPrev} disabled={currentPage === 0}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">◀</button>
              <span className="text-[10px] text-[--nuss-muted]">← 键盘左右箭头翻页 →</span>
              <button onClick={goNext} disabled={currentPage === totalPages - 1}
                className="px-3 py-1 rounded border border-[--nuss-border] text-xs text-[--nuss-muted] hover:text-[--nuss-text] disabled:opacity-30 transition-colors">▶</button>
            </div>
          </div>

          {/* ── 右侧：导演批注 ── */}
          {showAnnotations && scene && (
            <div className="w-56 shrink-0 max-h-[calc(100vh-180px)] overflow-y-auto space-y-2 no-print">
              <div className="text-[10px] text-[--nuss-muted] uppercase tracking-wider px-1">导演批注</div>
              <DirectorPanel scene={scene} />
            </div>
          )}
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
// Scene Page Content — 单场完整页面渲染
// ═══════════════════════════════════════════════════════════

function ScenePageContent({ scene, charNames }: { scene: SceneUIModel; charNames: Record<string, string> }) {
  const beats = (scene.beats || []) as RichBeat[];
  const time = (scene as Record<string, unknown>).time as string || scene.time_of_day || "日";
  const purpose = (scene as Record<string, unknown>).purpose as string | undefined;
  const mode = scene.timeline_mode;
  const rawBlock = (scene as Record<string, unknown>).raw_scene_text_block as string | undefined;
  const cast = ((scene as Record<string, unknown>).cast as string[]) || scene.character_ids || [];
  const castNames = cast.map(id => charNames[id] || id).filter(Boolean);

  return (
    <div>
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
            {/* Captions */}
            {(beat.captions || []).map((c, ci) => (
              <div key={`c-${ci}`} style={{ textAlign: "center", fontWeight: 700, fontSize: 14, margin: "10px 0" }}>{c.content}</div>
            ))}
            {/* Flashback transition */}
            {(beat.flashbacks || []).length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: "#888", margin: "16px 0 8px" }}>FLASHBACK TO:</div>
            )}
            {/* Actions */}
            {(beat.actions || []).map((a, ai) => (
              <p key={`a-${ai}`} style={{ lineHeight: 2, textAlign: "justify", margin: "6px 0" }}>
                {a.character_id && <span style={{ color: "#b91c1c", fontWeight: 600 }}>[{a.character_id}] </span>}
                {a.description}
              </p>
            ))}
            {/* Dialogues */}
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
            {/* Voice Overs */}
            {(beat.voice_overs || []).map((v, vi) => (
              <div key={`v-${vi}`} style={{ margin: "12px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{v.character_id || "?"} <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>(画外音)</span></div>
                <div style={{ margin: "0 60px", color: "#666", fontStyle: "italic" }}>{v.content}</div>
              </div>
            ))}
            {/* Inner Monologues */}
            {(beat.inner_monologues || []).map((m, mi) => (
              <div key={`m-${mi}`} style={{ margin: "12px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.character_id || "?"} <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>(内心独白)</span></div>
                <div style={{ margin: "0 60px", fontStyle: "italic" }}>{m.content}</div>
              </div>
            ))}
            {/* Flashback content */}
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
// Director Panel — 当前场景的导演批注
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
