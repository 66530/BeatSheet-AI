"use client";

import { useState, useCallback } from "react";
import type { SceneUIModel, BeatUIModel, ReviewStatus } from "../api_client";

type ViewMode = "format" | "raw";

interface RichBeat {
  beat_id: string; beat_type: string; beat_number?: number;
  summary?: string; emotion?: string; intensity?: number;
  cast?: string[];
  actions?: Array<{ character_id?: string; description: string }>;
  dialogues?: Array<{ speaker_id?: string; target_id?: string; line?: string; emotion?: string; subtext?: string }>;
  voice_overs?: Array<{ character_id?: string; content: string }>;
  inner_monologues?: Array<{ character_id?: string; content: string }>;
  captions?: Array<{ content: string }>;
  flashbacks?: Array<{ trigger?: string; content?: string }>;
}

export default function ScreenplayViewer({ scenes, reviewStatus, screenplayRaw }: {
  scenes: SceneUIModel[]; reviewStatus: ReviewStatus; screenplayRaw?: Record<string, unknown>;
}) {
  const [mode, setMode] = useState<ViewMode>("format");
  const [selectedId, setSelectedId] = useState<string | null>(scenes[0]?.scene_id ?? null);
  const [showAllScenes, setShowAllScenes] = useState(false);
  const isEmpty = scenes.length === 0;
  const scene = scenes.find(s => s.scene_id === selectedId);

  const handleExport = useCallback(() => {
    const text = scenes.map(s => renderSceneAsScript(s)).join("\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "screenplay.txt"; a.click();
    URL.revokeObjectURL(url);
  }, [scenes]);

  const displayScenes = showAllScenes ? scenes : (scene ? [scene] : []);

  return (
    <div className="animate-fade-in space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold">📜 剧本查看器</h3>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md overflow-hidden border border-[--nuss-border]">
            <button onClick={() => setMode("format")} className={`px-3 py-1.5 text-xs font-medium ${mode === "format" ? "bg-[--nuss-accent] text-white" : "text-[--nuss-muted] hover:text-[--nuss-text]"}`}>
              🎬 标准格式
            </button>
            <button onClick={() => setMode("raw")} className={`px-3 py-1.5 text-xs font-medium ${mode === "raw" ? "bg-[--nuss-accent] text-white" : "text-[--nuss-muted] hover:text-[--nuss-text]"}`}>
              {"{}"} 原始数据
            </button>
          </div>
          <select value={selectedId ?? ""} onChange={e => { setSelectedId(e.target.value); setShowAllScenes(false); }}
            className="text-xs bg-[--nuss-surface] border border-[--nuss-border] rounded px-2 py-1.5 text-[--nuss-text] max-w-[240px]" disabled={showAllScenes}>
            <option value="">选择场景...</option>
            {scenes.map(s => <option key={s.scene_id} value={s.scene_id}>第{s.scene_number}场 {s.location}</option>)}
          </select>
          <button onClick={() => setShowAllScenes(!showAllScenes)}
            className={`text-[10px] px-2 py-1 rounded border ${showAllScenes ? "border-[--nuss-accent] text-[--nuss-accent] bg-[--nuss-accent]/10" : "border-[--nuss-border] text-[--nuss-muted]"}`}>
            {showAllScenes ? "全部场景 ✓" : "全部场景"}
          </button>
        </div>
      </div>

      {/* 剧本内容 */}
      {isEmpty ? (
        <div className="blank-safe-card p-10 text-center"><span className="text-3xl">📜</span><p className="text-[--nuss-muted] mt-3">暂无剧本数据</p></div>
      ) : mode === "format" ? (
        <div className="space-y-0">
          {displayScenes.length === 0 && <div className="blank-safe-card p-8 text-center text-[--nuss-muted]">请选择一个场景或点击"全部场景"</div>}
          {displayScenes.map(s => <ScriptScene key={s.scene_id} scene={s} />)}
          {!isEmpty && reviewStatus === "completed" && (
            <div className="text-center pt-6 pb-4 border-t border-[--nuss-border]/30 mt-6">
              <div className="text-[--nuss-muted] text-xs font-bold tracking-[0.3em] mb-3">FADE OUT.</div>
              <button onClick={handleExport} className="console-btn-primary px-6 py-2 text-sm">📥 导出完整剧本</button>
            </div>
          )}
        </div>
      ) : (
        <RawDataView scenes={displayScenes.length > 0 ? displayScenes : scenes} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 标准剧本格式渲染
// ═══════════════════════════════════════════════════════════

function ScriptScene({ scene }: { scene: SceneUIModel }) {
  const beats = (scene.beats || []) as RichBeat[];
  const timelineLabel: Record<string, string> = {
    location_shift: "转场", time_shift: "时间推移", flashback: "闪回",
    montage: "蒙太奇", simultaneous: "平行时空", sequential: "",
  };

  return (
    <div className="script-page font-serif">
      {/* 场景标题 */}
      <div className="script-scene-heading">
        <span className="text-[--nuss-accent] font-bold">
          第{scene.scene_number}场
        </span>
        <span className="mx-2"></span>
        <span className="font-bold">
          {scene.location}
        </span>
        <span className="mx-1">—</span>
        <span>{scene.time_of_day || (scene as Record<string,unknown>).time as string || "日"}</span>
        {scene.timeline_mode && scene.timeline_mode !== "sequential" && (
          <span className="ml-2 text-[10px] text-[--nuss-accent] align-middle">
            [{timelineLabel[scene.timeline_mode] || scene.timeline_mode}]
          </span>
        )}
      </div>

      {/* 场景提要（仅在原始数据模式显示详细文字） */}
      <div className="script-scene-context">
        {(scene as Record<string,unknown>).purpose && <span className="text-[--nuss-accent]">{(scene as Record<string,unknown>).purpose as string}</span>}
      </div>

      {/* 逐节拍渲染；无节拍则回退显示原文 */}
      {beats.length === 0 ? (
        <div>
          <div className="script-action text-[--nuss-muted] italic leading-relaxed whitespace-pre-wrap border-l-2 border-yellow-500/30 pl-3 my-2">
            {(scene as Record<string,unknown>).raw_scene_text_block as string || scene.summary || "暂无内容"}
          </div>
          <div className="text-[10px] text-[--nuss-muted] mt-1">⚠️ 此场景未生成节拍 — 显示小说原文</div>
        </div>
      ) : (
        beats.map((beat, bi) => <ScriptBeat key={beat.beat_id || bi} beat={beat} />)
      )}

      {/* 场景间分隔 */}
      <div className="script-scene-separator">· · ·</div>
    </div>
  );
}

function ScriptBeat({ beat }: { beat: RichBeat }) {
  const actions = beat.actions || [];
  const dialogues = beat.dialogues || [];
  const voiceOvers = beat.voice_overs || [];
  const innerMonologues = beat.inner_monologues || [];
  const captions = beat.captions || [];
  const flashbacks = beat.flashbacks || [];

  return (
    <>
      {/* 字幕 */}
      {captions.map((c, i) => (
        <div key={`cap-${i}`} className="script-caption">{c.content || ""}</div>
      ))}

      {/* 闪回标记 */}
      {flashbacks.length > 0 && (
        <div className="script-transition">FLASHBACK TO:</div>
      )}

      {/* 动作 */}
      {actions.map((a, i) => (
        <div key={`act-${i}`} className="script-action">
          {a.character_id && <span className="script-char-ref">[{a.character_id}] </span>}
          {a.description}
        </div>
      ))}

      {/* 对白 */}
      {dialogues.map((d, i) => (
        <div key={`dlg-${i}`} className="script-dialogue-block">
          <div className="script-character-name">
            {d.speaker_id || "?"}
            {d.emotion && <span className="script-parenthetical">({d.emotion})</span>}
          </div>
          <div className="script-dialogue-line">{d.line || "..."}</div>
          {d.subtext && <div className="script-subtext">[{d.subtext}]</div>}
        </div>
      ))}

      {/* 画外音 */}
      {voiceOvers.map((v, i) => (
        <div key={`vo-${i}`} className="script-dialogue-block">
          <div className="script-character-name">{v.character_id || "?"} <span className="script-parenthetical">(画外音)</span></div>
          <div className="script-dialogue-line">{v.content}</div>
        </div>
      ))}

      {/* 内心独白 */}
      {innerMonologues.map((m, i) => (
        <div key={`im-${i}`} className="script-dialogue-block">
          <div className="script-character-name">{m.character_id || "?"} <span className="script-parenthetical">(内心独白)</span></div>
          <div className="script-dialogue-line italic">{m.content}</div>
        </div>
      ))}

      {/* 闪回内容 */}
      {flashbacks.map((f, i) => (
        <div key={`fb-${i}`} className="script-action italic text-[--nuss-muted]">
          {f.content}
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// 原始数据模式
// ═══════════════════════════════════════════════════════════

function RawDataView({ scenes }: { scenes: SceneUIModel[] }) {
  return (
    <div className="space-y-6">
      {scenes.map(scene => (
        <div key={scene.scene_id} className="console-panel text-xs">
          <div className="font-bold text-sm mb-2">第{scene.scene_number}场 {scene.location} — {scene.time_of_day || "日"}</div>
          <div className="grid grid-cols-4 gap-2 text-[10px] text-[--nuss-muted] mb-3">
            <div>模式: {scene.timeline_mode}</div>
            <div>情绪: {(scene as Record<string,unknown>).emotional_tone as string || "—"}</div>
            <div>冲突: {(scene as Record<string,unknown>).conflict_level as string || "—"}</div>
            <div>节拍: {(scene.beats || []).length}个</div>
          </div>
          {(scene.beats || []).map((beat, bi) => {
            const b = beat as RichBeat;
            return (
              <div key={bi} className="border-t border-[--nuss-border]/30 pt-2 mt-2">
                <div className="font-medium">[{b.beat_type}] {b.summary || "—"}</div>
                <div className="text-[10px] text-[--nuss-muted] mt-1 grid grid-cols-3 gap-1">
                  <span>情绪: {b.emotion || "—"}</span>
                  <span>强度: {b.intensity ?? "—"}</span>
                  <span>角色: {(b.cast || []).join(", ") || "—"}</span>
                </div>
                {(b.actions || []).map((a, ai) => <div key={ai} className="ml-2 text-blue-400">🎬 {a.character_id && `[${a.character_id}] `}{a.description}</div>)}
                {(b.dialogues || []).map((d, di) => <div key={di} className="ml-2 text-yellow-400">💬 {d.speaker_id && `[${d.speaker_id}] `}"{d.line}" {d.emotion && `(${d.emotion})`}</div>)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 辅助：导出用场景渲染
// ═══════════════════════════════════════════════════════════

function renderSceneAsScript(scene: SceneUIModel): string {
  const lines: string[] = [];
  const beats = (scene.beats || []) as RichBeat[];

  lines.push(`\n第${scene.scene_number}场  ${scene.location} - ${scene.time_of_day || "日"}\n`);

  for (const b of beats) {
    for (const c of (b.captions || [])) lines.push(`    【字幕】${c.content || ""}`);
    for (const a of (b.actions || [])) lines.push(`${a.character_id ? `[${a.character_id}] ` : ""}${a.description}`);
    for (const d of (b.dialogues || [])) {
      lines.push(`\n          ${d.speaker_id || "?"}${d.emotion ? ` (${d.emotion})` : ""}`);
      lines.push(`          ${d.line || "..."}\n`);
    }
    for (const v of (b.voice_overs || [])) {
      lines.push(`\n          ${v.character_id || "?"} (画外音)`);
      lines.push(`          ${v.content}\n`);
    }
  }
  return lines.join("\n");
}
