"use client";

import { useState } from "react";
import type { SceneUIModel, BeatUIModel, ReviewStatus } from "../api_client";

// 扩展 Scene 接口以支持新字段
interface RichScene extends SceneUIModel {
  purpose?: string; conflict_level?: number; objective?: string;
  segmentation_reason?: { location_changed?: boolean; time_changed?: boolean; objective_changed?: boolean; conflict_changed?: boolean; narrative_mode_changed?: boolean; score?: number; reason_text?: string };
  cast?: string[];
}
interface RichBeat extends BeatUIModel {
  objective?: string; conflict?: string; emotion?: string;
  actions?: Array<{ description: string; character_id?: string; cinematic_hint?: Record<string, string> }>;
  dialogues?: Array<{ speaker_id?: string; target_id?: string; line?: string; subtext?: string; emotion?: string; intention?: string }>;
  voice_overs?: Array<{ content: string }>;
  inner_monologues?: Array<{ content: string }>;
  captions?: Array<{ content: string }>;
  flashbacks?: Array<{ trigger?: string; content?: string }>;
  source_paragraphs?: string[];
}

interface Props { scenes: SceneUIModel[]; reviewStatus: ReviewStatus; title?: string; }

export default function SceneEditor({ scenes, reviewStatus, title }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isEmpty = scenes.length === 0;
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          场景工作台
          {!isEmpty && <span className="ml-2 text-sm font-normal text-[--nuss-muted]">{scenes.length} 场</span>}
        </h3>
        <span className="text-[10px] text-[--nuss-muted]">点击展开查看节拍 · 完整叙事层级</span>
      </div>
      {isEmpty ? <Empty icon="🎬" title="暂无场景" desc="上传小说后自动切分" /> : (
        <div className="space-y-3">
          {scenes.map((s, i) => <SceneCard key={s.scene_id} data={s as RichScene} index={i} isExpanded={expandedId === s.scene_id} onToggle={() => setExpandedId(expandedId === s.scene_id ? null : s.scene_id)} />)}
        </div>
      )}
    </div>
  );
}

function SceneCard({ data, index, isExpanded, onToggle }: { data?: Partial<RichScene>; index: number; isExpanded: boolean; onToggle: () => void }) {
  const s = {
    scene_id: data?.scene_id ?? "SC_PENDING", scene_number: data?.scene_number ?? index + 1,
    location: data?.location ?? "未知场景", time: data?.time_of_day ?? "日",
    location_type: data?.location_type ?? "unknown",
    summary: data?.summary ?? "加载中...", timeline_mode: data?.timeline_mode ?? "sequential",
    beats: (data?.beats ?? []) as RichBeat[], character_ids: data?.character_ids ?? [], scene_score: data?.scene_score ?? 0,
    purpose: (data as RichScene)?.purpose ?? "", conflict_level: (data as RichScene)?.conflict_level ?? 0,
    emotional_tone: (data as RichScene)?.emotional_tone ?? "中性", objective: (data as RichScene)?.objective ?? "",
    segmentation_reason: (data as RichScene)?.segmentation_reason,
    cast: (data as RichScene)?.cast ?? data?.character_ids ?? [],
    quality: (data as Record<string,unknown>)?.quality as { quality_score: number; grade: string; char_count: number; character_count: number; dialogue_hints: number } | undefined,
    source_paragraphs: ((data as Record<string,unknown>)?.source_paragraphs as string[]) || [],
  };

  const modeLabel: Record<string, string> = {
    sequential: "顺序叙事", location_shift: "地点转场", time_shift: "时间转场",
    flashback: "闪回", dream: "梦境", parallel: "并行叙事", montage: "蒙太奇",
    simultaneous: "平行时空",
  };
  const modeColor: Record<string, string> = {
    sequential: "bg-blue-500/20 text-blue-400", location_shift: "bg-cyan-500/20 text-cyan-400",
    time_shift: "bg-teal-500/20 text-teal-400", flashback: "bg-purple-500/20 text-purple-400",
    dream: "bg-indigo-500/20 text-indigo-400", parallel: "bg-pink-500/20 text-pink-400",
    montage: "bg-amber-500/20 text-amber-400", simultaneous: "bg-rose-500/20 text-rose-400",
  };
  const conflictColor = s.conflict_level >= 0.7 ? "text-red-400" : s.conflict_level >= 0.4 ? "text-yellow-400" : "text-green-400";

  return (
    <div className={`blank-safe-card cursor-pointer transition-all ${isExpanded ? "border-[--nuss-accent]/50 bg-[--nuss-accent]/5" : ""}`} onClick={onToggle}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: s.location_type === "indoor"
              ? "rgba(59,130,246,0.2)" : s.location_type === "outdoor"
              ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)",
          }}
        >
          <span className="text-sm font-bold"
            style={{
              color: s.location_type === "indoor"
                ? "#60a5fa" : s.location_type === "outdoor"
                ? "#4ade80" : "#facc15",
            }}
          >
            {s.scene_number}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold">
              <span className="text-[--nuss-accent-glow]">第{s.scene_number}场</span>
              <span className="mx-1.5 text-[--nuss-muted]">·</span>
              <span>{s.location}</span>
              <span className="mx-1.5 text-[--nuss-muted]">—</span>
              <span className="text-[--nuss-muted]">{s.time}</span>
            </h4>
            {/* 室内/室外 badge */}
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
              s.location_type === "indoor"
                ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                : s.location_type === "outdoor"
                ? "bg-green-500/15 text-green-400 border-green-500/20"
                : "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
            }`}>
              {s.location_type === "indoor" ? "内" : s.location_type === "outdoor" ? "外" : "未知"}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${modeColor[s.timeline_mode] || ""}`}>{modeLabel[s.timeline_mode] || s.timeline_mode}</span>
            {s.emotional_tone && s.emotional_tone !== "中性" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{s.emotional_tone}</span>}
            <span className={`text-[10px] ${conflictColor}`}>冲突 {Math.round(s.conflict_level * 100)}%</span>
          </div>
          {/* 摘要 + 目的 */}
          <p className="text-xs text-[--nuss-muted] mt-1 line-clamp-2 leading-relaxed">{s.summary}</p>
          {s.purpose && <p className="text-[10px] text-[--nuss-accent] mt-0.5">目的: {s.purpose}</p>}

          {/* 质量评分 */}
          {s.quality && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded font-bold ${
                s.quality.quality_score >= 0.8 ? "bg-green-500/20 text-green-400" :
                s.quality.quality_score >= 0.6 ? "bg-yellow-500/20 text-yellow-400" :
                "bg-red-500/20 text-red-400"
              }`}>
                {s.quality.grade || "?"} · {Math.round(s.quality.quality_score * 100)}%
              </span>
              <span className="text-[--nuss-muted]">{s.quality.char_count}字 · {s.quality.character_count}角色 · {s.quality.dialogue_hints}对白</span>
            </div>
          )}

          {/* 元数据行 */}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[--nuss-muted] flex-wrap">
            <span>{s.beats.length} 节拍</span>
            <span>{s.cast.length} 角色</span>
            {s.objective && <span className="text-[--nuss-accent]">目标: {s.objective}</span>}
          </div>

          {/* 切场原因（可解释） */}
          {s.segmentation_reason && s.segmentation_reason.reason_text && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.segmentation_reason.location_changed && <span className="px-1 py-0.5 rounded text-[8px] bg-blue-500/10 text-blue-400">📍地点变化</span>}
              {s.segmentation_reason.time_changed && <span className="px-1 py-0.5 rounded text-[8px] bg-yellow-500/10 text-yellow-400">🕐时间变化</span>}
              {s.segmentation_reason.objective_changed && <span className="px-1 py-0.5 rounded text-[8px] bg-green-500/10 text-green-400">🎯目标转变</span>}
              {s.segmentation_reason.conflict_changed && <span className="px-1 py-0.5 rounded text-[8px] bg-red-500/10 text-red-400">⚡冲突升级</span>}
              {s.segmentation_reason.narrative_mode_changed && <span className="px-1 py-0.5 rounded text-[8px] bg-purple-500/10 text-purple-400">🔄叙事切换</span>}
              {s.segmentation_reason.score !== undefined && <span className="px-1 py-0.5 rounded text-[8px] bg-[--nuss-border]/50">得分 {s.segmentation_reason.score.toFixed(2)}</span>}
            </div>
          )}
        </div>
        <span className="text-[--nuss-muted] text-xs mt-1">{isExpanded ? "▼" : "▶"}</span>
      </div>

      {/* 展开：节拍时间轴 + 合并段落 */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[--nuss-border]/50 animate-slide-up">
          {/* 合并段落可视化 */}
          {s.source_paragraphs && s.source_paragraphs.length > 1 && (
            <details className="mb-3 text-[10px]">
              <summary className="text-[--nuss-muted] cursor-pointer hover:text-[--nuss-text]">
                📎 合并段落 ({s.source_paragraphs.length}段 → 1场)
              </summary>
              <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {s.source_paragraphs.map((p: string, i: number) => (
                  <div key={i} className="flex gap-1 text-[--nuss-muted]">
                    <span className="text-[--nuss-accent] shrink-0">▸</span>
                    <span className="truncate">{p.slice(0, 60)}{p.length > 60 ? "…" : ""}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="text-[10px] text-[--nuss-muted] mb-2 font-medium uppercase tracking-wider">节拍时间轴</p>
          {s.beats.length === 0 ? <p className="text-xs text-[--nuss-muted] italic py-2">暂无节拍</p> : (
            <div className="space-y-2">
              {s.beats.map((beat: RichBeat) => <BeatRow key={beat.beat_id} beat={beat} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BeatRow({ beat }: { beat: RichBeat }) {
  const [showDetail, setShowDetail] = useState(false);
  const colorMap: Record<string, string> = { setup: "bg-gray-400", reveal: "bg-blue-400", conflict: "bg-red-400", decision: "bg-yellow-400", twist: "bg-purple-400", climax: "bg-orange-400", resolution: "bg-green-400" };
  const labelMap: Record<string, string> = { setup: "铺垫", reveal: "揭示", conflict: "冲突", decision: "决定", twist: "转折", climax: "高潮", resolution: "解决" };
  const actions = beat.actions || [];
  const dialogues = beat.dialogues || [];
  const voiceOvers = beat.voice_overs || [];
  const innerMonologues = beat.inner_monologues || [];
  const captions = beat.captions || [];
  const flashbacks = beat.flashbacks || [];
  const totalElements = actions.length + dialogues.length + voiceOvers.length + innerMonologues.length + captions.length + flashbacks.length;

  return (
    <div className={`rounded text-xs border ${showDetail ? "border-[--nuss-accent]/30 bg-[--nuss-accent]/5" : "border-transparent hover:bg-[--nuss-surface]"}`}>
      <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setShowDetail(!showDetail)}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${colorMap[beat.beat_type] || "bg-gray-400"}`} />
        <span className="text-[10px] text-[--nuss-muted] font-mono shrink-0 w-14">{beat.beat_id}</span>
        <span className="flex-1 truncate font-medium">{beat.summary || "未命名节拍"}</span>
        {beat.emotion && <span className="text-[10px] text-yellow-400">{beat.emotion}</span>}
        <span className="text-[10px] text-[--nuss-muted]">{labelMap[beat.beat_type] || beat.beat_type}</span>
        <div className="w-12 h-1.5 rounded-full bg-[--nuss-border] shrink-0"><div className="h-full rounded-full bg-[--nuss-accent]" style={{ width: `${(beat.intensity ?? 0.5) * 100}%` }} /></div>
        <span className="text-[10px] text-[--nuss-muted]">{totalElements}元素</span>
        <span className="text-[10px] text-[--nuss-muted]">{showDetail ? "▲" : "▼"}</span>
      </div>

      {showDetail && (
        <div className="px-3 pb-3 space-y-2 animate-slide-up border-t border-[--nuss-border]/30 pt-2">
          {/* Beat 元数据 */}
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            {beat.objective && <div><span className="text-[--nuss-muted]">目的: </span><span className="text-[--nuss-text]">{beat.objective}</span></div>}
            {beat.conflict && <div><span className="text-[--nuss-muted]">冲突: </span><span className="text-red-400">{beat.conflict}</span></div>}
            {beat.emotion && <div><span className="text-[--nuss-muted]">情绪: </span><span className="text-yellow-400">{beat.emotion}</span></div>}
          </div>

          {/* Actions（可拍摄动作） */}
          {actions.length > 0 && (
            <div><span className="text-[10px] text-blue-400 font-semibold">🎬 动作</span>
              {actions.map((a, i) => <div key={i} className="mt-1 p-2 rounded bg-blue-500/5 border-l-2 border-blue-500/30 text-[11px] leading-relaxed">{a.description}</div>)}
            </div>
          )}

          {/* Dialogues（对白） */}
          {dialogues.length > 0 && (
            <div><span className="text-[10px] text-yellow-400 font-semibold">💬 对白</span>
              {dialogues.map((d, i) => (
                <div key={i} className="mt-1 p-2 rounded bg-yellow-500/5 border-l-2 border-yellow-500/30">
                  <div className="text-[11px] italic leading-relaxed">"{d.line}"</div>
                  <div className="flex gap-3 mt-1 text-[10px] text-[--nuss-muted]">
                    {d.emotion && <span>语调: {d.emotion}</span>}
                    {d.subtext && <span>潜台词: {d.subtext}</span>}
                    {d.intention && <span>目的: {d.intention}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Voice Overs / Inner Monologues / Flashbacks */}
          {voiceOvers.length > 0 && <div><span className="text-[10px] text-purple-400 font-semibold">🎙️ 画外音</span>{voiceOvers.map((v, i) => <p key={i} className="text-[11px] text-[--nuss-muted] mt-0.5">{v.content}</p>)}</div>}
          {innerMonologues.length > 0 && <div><span className="text-[10px] text-indigo-400 font-semibold">🧠 内心独白</span>{innerMonologues.map((m, i) => <p key={i} className="text-[11px] text-[--nuss-muted] italic mt-0.5">{m.content}</p>)}</div>}
          {flashbacks.length > 0 && <div><span className="text-[10px] text-purple-400 font-semibold">↩️ 闪回</span>{flashbacks.map((f, i) => <div key={i} className="mt-0.5"><span className="text-[10px] text-[--nuss-muted]">触发: {f.trigger}</span><p className="text-[11px] text-[--nuss-muted]">{f.content}</p></div>)}</div>}
          {captions.length > 0 && <div><span className="text-[10px] text-cyan-400 font-semibold">📝 字幕</span>{captions.map((c, i) => <p key={i} className="text-[11px] text-[--nuss-muted] mt-0.5">{c.content}</p>)}</div>}

          {/* 溯源 */}
          {beat.source_paragraphs && beat.source_paragraphs.length > 0 && (
            <details className="text-[10px]"><summary className="text-[--nuss-muted] cursor-pointer">📎 原文溯源</summary>
              <p className="text-[--nuss-muted] mt-1 italic leading-relaxed">{(beat.source_paragraphs[0] || "").slice(0, 200)}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return <div className="blank-safe-card p-10 text-center"><span className="text-3xl">{icon}</span><p className="text-[--nuss-muted] font-medium mt-3">{title}</p><p className="text-xs text-[--nuss-muted] mt-1">{desc}</p></div>;
}
