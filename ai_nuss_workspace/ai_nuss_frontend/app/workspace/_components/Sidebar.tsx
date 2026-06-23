"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace, type TabId } from "./WorkspaceProvider";

// ═══════════════════════════════════════
// Menu definition
// ═══════════════════════════════════════

interface SubItem {
  id: TabId;
  label: string;
  icon: string;
  badge?: string;
}

interface MenuItem {
  id: TabId | "config";
  label: string;
  icon: string;
  badge?: string;
  children?: SubItem[];
}

export default function Sidebar() {
  const { activeTab, setActiveTab, jobState, isCompleted, setShowConfig } = useWorkspace();

  // ── 解锁状态：一旦 isCompleted 变为 true，永久保持 ──
  const [unlocked, setUnlocked] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState(false);
  const prevCompleted = useRef(false);

  useEffect(() => {
    if (isCompleted && !prevCompleted.current) {
      setUnlocked(true);
      setNewlyUnlocked(true);
      const t = setTimeout(() => setNewlyUnlocked(false), 3000);
      prevCompleted.current = true;
      return () => clearTimeout(t);
    }
    prevCompleted.current = isCompleted;
  }, [isCompleted]);

  // ── 动态构建菜单 ──
  const buildMenu = (): MenuItem[] => {
    const items: MenuItem[] = [
      { id: "home",   label: "首页",     icon: "🏠" },
      { id: "upload", label: "开始工作", icon: "⚡", badge: unlocked ? undefined : "1" },
    ];

    // 子菜单：AI 完成后解锁
    if (unlocked) {
      (items[1] as MenuItem).children = [
        { id: "scenes",     label: "场景工作台", icon: "🎬", badge: jobState.scenes.length > 0 ? String(jobState.scenes.length) : undefined },
        { id: "characters", label: "角色图谱",   icon: "👥", badge: jobState.characters.length > 0 ? String(jobState.characters.length) : undefined },
        { id: "screenplay", label: "剧本查看器", icon: "📜", badge: isCompleted ? "✓" : undefined },
      ];
    }

    items.push({ id: "config", label: "模型配置", icon: "⚙️" });
    return items;
  };

  const menu = buildMenu();
  // 计算是否处于子菜单激活态（用于父级高亮）
  const workSubIds: TabId[] = ["scenes", "characters", "screenplay"];
  const isWorkActive = workSubIds.includes(activeTab) || activeTab === "upload";

  // ── 判断某菜单项是否 active ──
  const isActive = (item: MenuItem): boolean => {
    if (item.id === "config") return false;
    if (item.children) return isWorkActive;
    return activeTab === item.id;
  };

  return (
    <aside
      className="w-44 shrink-0 flex flex-col py-4 border-r select-none"
      style={{ background: "var(--nuss-sidebar)", borderColor: "var(--nuss-border)" }}
    >
      {/* ── Logo ── */}
      <div className="px-4 mb-5">
        <div
          className="text-base font-bold tracking-wider"
          style={{
            background: "linear-gradient(135deg, #EC4899, #A855F7, #00F0FF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          NovaDirector
        </div>
        <div className="text-[9px] text-[var(--nuss-dim-text)] mt-0.5 tracking-wide">
          AI 剧本智能工作台
        </div>
      </div>

      {/* ── 菜单项 ── */}
      <nav className="flex-1 px-2 space-y-0.5">
        {menu.map(item => {
          if (item.id === "config") return null; // 配置项放底部

          const active = isActive(item);
          const hasChildren = !!item.children?.length;

          return (
            <div key={item.id}>
              {/* ── 一级菜单 ── */}
              <button
                onClick={() => {
                  if (item.id !== "config") setActiveTab(item.id as TabId);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all duration-200 group"
                style={active ? {
                  background: "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(168,85,247,0.18))",
                  borderLeft: "2px solid #EC4899",
                  color: "var(--nuss-text)",
                  boxShadow: "inset 0 0 16px rgba(236,72,153,0.06)",
                } : {
                  borderLeft: "2px solid transparent",
                  color: "var(--nuss-muted)",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--nuss-text)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.background = "";
                  }
                }}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold"
                    style={{ background: "rgba(0,240,255,0.15)", color: "var(--nuss-accent)" }}>
                    {item.badge}
                  </span>
                )}
                {hasChildren && (
                  <span className={`text-[0.55rem] transition-transform duration-300 ${unlocked ? "rotate-90" : ""}`}
                    style={{ color: newlyUnlocked ? "#A855F7" : "var(--nuss-muted)" }}>
                    ▶
                  </span>
                )}
              </button>

              {/* ── 二级子菜单（滑动展开）── */}
              {hasChildren && (
                <div
                  className="overflow-hidden transition-all duration-400 ease-out"
                  style={{
                    maxHeight: unlocked ? "200px" : "0px",
                    opacity: unlocked ? 1 : 0,
                    transitionProperty: "max-height, opacity",
                    transitionDuration: unlocked ? "400ms" : "250ms",
                    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <div className="ml-6 mt-0.5 mb-0.5 space-y-0.5 border-l border-[var(--nuss-border)]/60 pl-3 py-0.5">
                    {item.children!.map(sub => {
                      const subActive = activeTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setActiveTab(sub.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] transition-all duration-200 ${
                            newlyUnlocked ? "animate-slide-up" : ""
                          }`}
                          style={subActive ? {
                            background: "linear-gradient(135deg, rgba(236,72,153,0.15), rgba(168,85,247,0.15))",
                            color: "var(--nuss-accent)",
                            textShadow: "0 0 8px rgba(0,240,255,0.15)",
                          } : {
                            color: newlyUnlocked ? "#A855F7" : "var(--nuss-muted)",
                          }}
                          onMouseEnter={e => {
                            if (!subActive) { e.currentTarget.style.color = "var(--nuss-text)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }
                          }}
                          onMouseLeave={e => {
                            if (!subActive) { e.currentTarget.style.color = newlyUnlocked ? "#A855F7" : ""; e.currentTarget.style.background = ""; }
                          }}
                        >
                          <span className={`text-sm ${newlyUnlocked ? "animate-pulse" : ""}`}
                            style={newlyUnlocked ? { filter: "drop-shadow(0 0 6px rgba(168,85,247,0.5))" } : {}}>
                            {sub.icon}
                          </span>
                          <span className="flex-1 text-left">{sub.label}</span>
                          {sub.badge && (
                            <span className="px-1 py-0.5 rounded-full text-[0.5rem] font-bold"
                              style={{ background: "rgba(0,240,255,0.12)", color: "var(--nuss-accent)" }}>
                              {sub.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {/* 完成提示 */}
                    {newlyUnlocked && (
                      <div className="text-[9px] px-2 py-1 rounded-md mt-1 animate-slide-up"
                        style={{ color: "#A855F7", background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                        ✨ 高阶板块已解锁
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── 底部：模型配置 ── */}
      <div className="px-2 mt-auto">
        <button
          onClick={() => setShowConfig(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all duration-200"
          style={{ color: "var(--nuss-muted)", borderLeft: "2px solid transparent" }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "var(--nuss-text)";
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "";
            e.currentTarget.style.background = "";
          }}
        >
          <span className="text-base">⚙️</span>
          <span>模型配置</span>
        </button>
      </div>
    </aside>
  );
}
