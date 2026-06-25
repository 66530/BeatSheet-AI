"use client";

import { useState, useMemo } from "react";
import type { SceneUIModel, CharacterUIModel } from "../api_client";
import { calculateSceneStatistics } from "./scene_statistics";

interface Props {
  scenes: SceneUIModel[];
  characters: CharacterUIModel[];
}

/**
 * 场景分布总览 — 纯展示组件
 *
 * 数据流：
 *   scenes[] → calculateSceneStatistics() → useMemo → 渲染
 *
 * 不维护任何独立 state / 缓存 / mock 数据。
 */
export default function SceneDistribution({ scenes, characters }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // ── 唯一数据源 → 纯函数 → 派生统计 ──
  const stats = useMemo(
    () => calculateSceneStatistics(scenes, characters),
    [scenes, characters],
  );

  if (scenes.length === 0) return null;

  const { location: loc, time: tm, transitions: tr, characters: charList } = stats;
  const maxAppearance = charList.length > 0 ? charList[0].count : 1;
  const hasRichTransitions = tr.objective > 0 || tr.conflict > 0 || tr.narrative > 0;

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
          {/* ── 第一行：室内/室外/未知 + 白天/夜晚 ── */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            <StatCard
              icon="" label="室内" count={loc.indoor} unit="场"
              pct={loc.indoorRate} colorClass="bg-blue-500"
            />
            <StatCard
              icon="" label="室外" count={loc.outdoor} unit="场"
              pct={loc.outdoorRate} colorClass="bg-green-500"
            />
            <StatCard
              icon="" label="未知" count={loc.unknown} unit="场"
              pct={Math.round((loc.unknown / (scenes.length || 1)) * 100)} colorClass="bg-gray-400"
            />
            <StatCard
              icon="" label="白天" count={tm.day} unit="场"
              pct={tm.dayRate} colorClass="bg-yellow-500"
            />
            <StatCard
              icon="" label="夜晚" count={tm.night} unit="场"
              pct={tm.nightRate} colorClass="bg-indigo-500"
            />
          </div>

          {/* ── 第二行：转场统计 ── */}
          <div className="border-t border-[--nuss-border]/30 pt-2.5">
            <h5 className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-1.5">
              转场统计
            </h5>
            <div className="flex flex-wrap gap-1.5">
              <TransitionBadge label="地点转场" count={tr.location} colorClass="bg-blue-100 text-blue-600 border-blue-200" />
              <TransitionBadge label="时间转场" count={tr.time} colorClass="bg-amber-100 text-amber-600 border-amber-200" />
              {hasRichTransitions ? (
                <>
                  {tr.objective > 0 && <TransitionBadge label="目标转变" count={tr.objective} colorClass="bg-green-100 text-green-600 border-green-200" />}
                  {tr.conflict > 0 && <TransitionBadge label="冲突升级" count={tr.conflict} colorClass="bg-red-100 text-red-600 border-red-200" />}
                  {tr.narrative > 0 && <TransitionBadge label="叙事切换" count={tr.narrative} colorClass="bg-purple-100 text-purple-600 border-purple-200" />}
                </>
              ) : (
                <TransitionBadge label="叙事模式切换" count={tr.mode} colorClass="bg-purple-100 text-purple-600 border-purple-200" />
              )}
            </div>
          </div>

          {/* ── 第三行：出场人物 ── */}
          {charList.length > 0 && (
            <div className="border-t border-[--nuss-border]/30 pt-2.5">
              <h5 className="text-[10px] text-[--nuss-muted] uppercase tracking-wider mb-1.5">
                出场人物
              </h5>
              <div className="space-y-1">
                {charList.slice(0, 8).map(({ id, name, count }) => (
                  <div key={id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 text-right truncate text-[--nuss-text] font-medium">
                      {name}
                    </span>
                    <span className="text-[10px] text-[--nuss-muted] w-8 shrink-0">
                      {count}场
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-[--nuss-border]/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[--nuss-accent] transition-all duration-500"
                        style={{ width: `${Math.round((count / maxAppearance) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {charList.length > 8 && (
                  <p className="text-[10px] text-[--nuss-muted] pl-20">
                    ...还有 {charList.length - 8} 个角色
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
// 纯展示子组件（UI 未改动）
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
