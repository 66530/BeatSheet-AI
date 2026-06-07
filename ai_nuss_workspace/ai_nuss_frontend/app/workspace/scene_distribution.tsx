"use client";

import { useState } from "react";
import type { SceneUIModel, CharacterUIModel } from "../api_client";

// ── 扩展场景字段（API 实际返回的字段，SceneUIModel 未包含的）──
interface RichSceneExtras {
  time?: string;                    // API 用 "time"，SceneUIModel 用 "time_of_day"
  cast?: string[];                  // API 用 "cast"，SceneUIModel 用 "character_ids"
  segmentation_reason?: {
    mode?: string;                  // "location_shift" | "time_shift" | "flashback" | "montage" | "simultaneous"
    reason_text?: string;
    markers?: string[];
    // 以下为可选扩展字段（未来可能返回）
    location_changed?: boolean;
    time_changed?: boolean;
    objective_changed?: boolean;
    conflict_changed?: boolean;
    narrative_mode_changed?: boolean;
    score?: number;
  };
}

interface Props {
  scenes: SceneUIModel[];
  characters: CharacterUIModel[];
}

// ═══════════════════════════════════════════════════
// 工具函数：室内/室外判定
// ═══════════════════════════════════════════════════

const INDOOR_KEYWORDS = [
  "室内", "内景", "INT.",
  "厅", "室", "房", "屋里", "屋内",
  "厨房", "卧室", "客厅", "书房", "办公室", "会议室",
  "走廊", "电梯", "楼", "地下室", "阁楼",
];

const OUTDOOR_KEYWORDS = [
  "室外", "外景", "EXT.",
  "花园", "院子", "院落", "街", "广场", "公园",
  "门口", "大门", "野外", "山", "海边", "湖",
];

function classifyLocation(location: string): "indoor" | "outdoor" | "unknown" {
  if (!location) return "unknown";
  if (INDOOR_KEYWORDS.some(k => location.includes(k))) return "indoor";
  if (OUTDOOR_KEYWORDS.some(k => location.includes(k))) return "outdoor";
  return "unknown";
}

// ═══════════════════════════════════════════════════
// 工具函数：白天/夜晚判定
// ═══════════════════════════════════════════════════

const DAY_KEYWORDS = ["日", "晨", "白天", "早上", "上午", "午", "下午"];
const NIGHT_KEYWORDS = ["夜", "暮", "晚上", "深夜", "傍晚", "黄昏", "凌晨"];

function classifyTimeOfDay(tod: string): "day" | "night" | "unknown" {
  if (!tod) return "unknown";
  if (DAY_KEYWORDS.some(k => tod.includes(k))) return "day";
  if (NIGHT_KEYWORDS.some(k => tod.includes(k))) return "night";
  return "unknown";
}

// ═══════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════

export default function SceneDistribution({ scenes, characters }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (scenes.length === 0) return null;

  // ── 1. 室内/室外 统计 ──
  let indoorCount = 0;
  let outdoorCount = 0;
  let unknownLocCount = 0;

  // ── 2. 白天/夜晚 统计 ──
  let dayCount = 0;
  let nightCount = 0;
  let unknownTimeCount = 0;

  // ── 3. 转场统计（相邻场次对比）──
  let locTransitionCount = 0;
  let timeTransitionCount = 0;
  let modeTransitionCount = 0;

  // 从 segmentation_reason 聚合（如果 API 返回了）
  let segLocChanged = 0;
  let segTimeChanged = 0;
  let segObjChanged = 0;
  let segConflictChanged = 0;
  let segNarrativeChanged = 0;
  let hasSegReason = false;

  // ── 4. 出场人物统计 ──
  const charAppearance: Record<string, number> = {};

  // ── 遍历场景计算 ──
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const extras = scene as SceneUIModel & RichSceneExtras;

    // 室内/室外
    const locClass = classifyLocation(scene.location);
    if (locClass === "indoor") indoorCount++;
    else if (locClass === "outdoor") outdoorCount++;
    else unknownLocCount++;

    // 白天/夜晚
    const tod = extras.time || scene.time_of_day || "";
    const timeClass = classifyTimeOfDay(tod);
    if (timeClass === "day") dayCount++;
    else if (timeClass === "night") nightCount++;
    else unknownTimeCount++;

    // 转场（与前一场景对比）
    if (i > 0) {
      const prev = scenes[i - 1];
      const prevExtras = prev as SceneUIModel & RichSceneExtras;
      const prevLoc = prev.location;
      const prevTod = prevExtras.time || prev.time_of_day || "";
      const prevMode = prev.timeline_mode;

      if (scene.location !== prevLoc) locTransitionCount++;
      if (tod !== prevTod) timeTransitionCount++;
      if (scene.timeline_mode !== prevMode) modeTransitionCount++;
    }

    // segmentation_reason 聚合
    const sr = extras.segmentation_reason;
    if (sr) {
      // 优先使用详细布尔标志，否则从 mode 字段推导
      const hasBooleanFlags = sr.location_changed !== undefined
        || sr.time_changed !== undefined
        || sr.objective_changed !== undefined;

      if (hasBooleanFlags) {
        // LLM 返回的详细标志
        hasSegReason = true;
        if (sr.location_changed) segLocChanged++;
        if (sr.time_changed) segTimeChanged++;
        if (sr.objective_changed) segObjChanged++;
        if (sr.conflict_changed) segConflictChanged++;
        if (sr.narrative_mode_changed) segNarrativeChanged++;
      } else if (sr.mode) {
        // 从切分模式推导转场类型
        hasSegReason = true;
        switch (sr.mode) {
          case "location_shift": segLocChanged++; break;
          case "time_shift": segTimeChanged++; break;
          case "flashback":
          case "montage":
          case "simultaneous": segNarrativeChanged++; break;
        }
      }
    }

    // 人物出场（API 返回 cast 字段，兼容 character_ids）
    const charIds: string[] = extras.cast || scene.character_ids || [];
    for (const cid of charIds) {
      charAppearance[cid] = (charAppearance[cid] || 0) + 1;
    }
  }

  // ── 人物 ID → 名称映射 ──
  const idToName: Record<string, string> = {};
  for (const ch of characters) {
    idToName[ch.character_id] = ch.canonical_name;
  }

  // 按出场次数排序
  const charRanking = Object.entries(charAppearance)
    .map(([id, count]) => ({ id, name: idToName[id] || id, count }))
    .sort((a, b) => b.count - a.count);

  const maxAppearance = charRanking.length > 0 ? charRanking[0].count : 1;

  // ── 百分比计算 ──
  const locTotal = indoorCount + outdoorCount + unknownLocCount;
  const indoorPct = locTotal > 0 ? Math.round((indoorCount / locTotal) * 100) : 0;
  const outdoorPct = locTotal > 0 ? Math.round((outdoorCount / locTotal) * 100) : 0;

  const timeTotal = dayCount + nightCount + unknownTimeCount;
  const dayPct = timeTotal > 0 ? Math.round((dayCount / timeTotal) * 100) : 0;
  const nightPct = timeTotal > 0 ? Math.round((nightCount / timeTotal) * 100) : 0;

  // ═══════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════

  return (
    <div className="mb-4 console-panel animate-slide-up">
      {/* 标题栏 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between text-xs font-semibold cursor-pointer select-none"
      >
        <span>场景分布总览</span>
        <span className="text-[--nuss-muted] text-[10px] transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
          ▼
        </span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3 animate-slide-up">
          {/* ── 第一行：室内/室外 + 白天/夜晚 ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* 室内 */}
            <StatCard
              icon="" label="室内" count={indoorCount} unit="场"
              pct={indoorPct} colorClass="bg-blue-500"
            />
            {/* 室外 */}
            <StatCard
              icon="" label="室外" count={outdoorCount} unit="场"
              pct={outdoorPct} colorClass="bg-green-500"
            />
            {/* 白天 */}
            <StatCard
              icon="" label="白天" count={dayCount} unit="场"
              pct={dayPct} colorClass="bg-yellow-500"
            />
            {/* 夜晚 */}
            <StatCard
              icon="" label="夜晚" count={nightCount} unit="场"
              pct={nightPct} colorClass="bg-indigo-500"
            />
          </div>

          {/* ── 第二行：转场统计 ── */}
          <div className="border-t border-[--nuss-border]/30 pt-2.5">
            <h5 className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-1.5">
              转场统计
            </h5>
            <div className="flex flex-wrap gap-1.5">
              <TransitionBadge label="地点转场" count={hasSegReason ? segLocChanged : locTransitionCount} colorClass="bg-blue-100 text-blue-600 border-blue-200" />
              <TransitionBadge label="时间转场" count={hasSegReason ? segTimeChanged : timeTransitionCount} colorClass="bg-amber-100 text-amber-600 border-amber-200" />
              {hasSegReason && (
                <>
                  <TransitionBadge label="目标转变" count={segObjChanged} colorClass="bg-green-100 text-green-600 border-green-200" />
                  <TransitionBadge label="冲突升级" count={segConflictChanged} colorClass="bg-red-100 text-red-600 border-red-200" />
                  <TransitionBadge label="叙事切换" count={segNarrativeChanged} colorClass="bg-purple-100 text-purple-600 border-purple-200" />
                </>
              )}
              {!hasSegReason && (
                <TransitionBadge label="叙事模式切换" count={modeTransitionCount} colorClass="bg-purple-100 text-purple-600 border-purple-200" />
              )}
            </div>
            {!hasSegReason && (
              <p className="text-[9px] text-[--nuss-muted] mt-1 opacity-60">
                * 基于相邻场景对比自动计算
              </p>
            )}
          </div>

          {/* ── 第三行：出场人物 ── */}
          {charRanking.length > 0 && (
            <div className="border-t border-[--nuss-border]/30 pt-2.5">
              <h5 className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-1.5">
                出场人物
              </h5>
              <div className="space-y-1">
                {charRanking.slice(0, 8).map(({ id, name, count }) => (
                  <div key={id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 text-right truncate text-[--nuss-text] font-medium">
                      {name}
                    </span>
                    <span className="text-[10px] text-[--nuss-muted] w-8 shrink-0">
                      {count}场
                    </span>
                    {/* 进度条 */}
                    <div className="flex-1 h-1.5 rounded-full bg-[--nuss-border]/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[--nuss-accent] transition-all duration-500"
                        style={{ width: `${Math.round((count / maxAppearance) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {charRanking.length > 8 && (
                  <p className="text-[10px] text-[--nuss-muted] pl-20">
                    ...还有 {charRanking.length - 8} 个角色
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 子组件
// ═══════════════════════════════════════════════════

function StatCard({
  icon: _icon, label, count, unit, pct, colorClass,
}: {
  icon: string; label: string; count: number; unit: string;
  pct: number; colorClass: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-[--nuss-elevated] border border-[--nuss-border] text-center transition-all hover:border-[--nuss-dim]">
      <div className="text-[10px] text-[--nuss-muted] mb-1 uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline justify-center gap-0.5">
        <span className="text-lg font-bold text-[--nuss-text]">{count}</span>
        <span className="text-[10px] text-[--nuss-muted]">{unit}</span>
      </div>
      <div className="w-full h-1 rounded-full bg-[--nuss-border]/60 mt-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <div className="text-[10px] text-[--nuss-muted] mt-0.5">{pct}%</div>
    </div>
  );
}

function TransitionBadge({
  label, count, colorClass,
}: {
  icon?: string; label: string; count: number; colorClass: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${colorClass}`}>
      {label}
      <span className="font-bold ml-0.5">{count}</span>
    </span>
  );
}
