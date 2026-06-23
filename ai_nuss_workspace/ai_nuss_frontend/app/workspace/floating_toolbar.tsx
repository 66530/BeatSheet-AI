"use client";

/**
 * AI-NUSS 3.0 — Two-stage AI Editing Card
 * Stage 1: Select operation (rewrite/expand/shorten/tone)
 * Stage 2: Optional instruction + trigger generation
 * Glassmorphism. Anchored to selection range.
 */
import { useState } from "react";
import type { LocalEditOperation, LocalEditTone } from "../api_client";

interface ToneOption { value: LocalEditTone; label: string; icon: string; color: string; }

const TONES: ToneOption[] = [
  { value: "funny", label: "幽默", icon: "😂", color: "#f59e0b" },
  { value: "emotional", label: "情感", icon: "💧", color: "#ec4899" },
  { value: "dark", label: "黑暗", icon: "🌑", color: "#6b7280" },
  { value: "romantic", label: "浪漫", icon: "💕", color: "#f43f5e" },
  { value: "suspense", label: "悬疑", icon: "🔍", color: "#8b5cf6" },
  { value: "inspirational", label: "激励", icon: "🌟", color: "#fbbf24" },
  { value: "professional", label: "专业", icon: "💼", color: "#3b82f6" },
];

export interface FloatingToolbarProps {
  x: number;
  y: number;
  visible: boolean;
  loading: boolean;
  onAction: (operation: LocalEditOperation, tone?: LocalEditTone, customInstruction?: string) => void;
}

const ACTIONS: { op: LocalEditOperation; label: string; icon: string; color: string; glow: string }[] = [
  { op: "rewrite", label: "重写", icon: "✨", color: "#3b82f6", glow: "rgba(59,130,246,0.4)" },
  { op: "expand", label: "扩写", icon: "➕", color: "#22c55e", glow: "rgba(34,197,94,0.4)" },
  { op: "shorten", label: "缩写", icon: "✂️", color: "#f97316", glow: "rgba(249,115,22,0.4)" },
  { op: "change_tone", label: "改语气", icon: "🎭", color: "#a855f7", glow: "rgba(168,85,247,0.4)" },
];

export default function FloatingToolbar({ x, y, visible, loading, onAction }: FloatingToolbarProps) {
  const [selectedOp, setSelectedOp] = useState<LocalEditOperation | null>(null);
  const [selectedTone, setSelectedTone] = useState<LocalEditTone | undefined>(undefined);
  const [instruction, setInstruction] = useState("");
  const [showTones, setShowTones] = useState(false);

  if (!visible) return null;

  const handleOpClick = (op: LocalEditOperation) => {
    if (op === "change_tone") { setShowTones(!showTones); return; }
    setShowTones(false);
    setSelectedOp(selectedOp === op ? null : op);
    setSelectedTone(undefined);
  };

  const handleTonePick = (tone: LocalEditTone) => {
    setShowTones(false);
    setSelectedOp("change_tone");
    setSelectedTone(tone);
  };

  const handleTrigger = () => {
    if (!selectedOp) return;
    onAction(selectedOp, selectedTone, instruction.trim() || undefined);
  };

  return (
    <>
      <div data-floating-toolbar style={{ position: "fixed", left: x, top: y, zIndex: 9999, transform: "translate(-50%, -120%)" }} className="animate-slide-up">
        <div style={{ padding: "10px", borderRadius: 14, background: "rgba(15,15,25,0.88)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset", minWidth: 300, pointerEvents: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" }}>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(168,85,247,0.2)", borderTop: "2px solid #a855f7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: "#a0a0b8", fontSize: 13, fontWeight: 500 }}>✨ AI 编辑中...</span>
            </div>
          ) : (
            <>
              {/* Stage 1: Operation Selector */}
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {ACTIONS.map((a) => (
                  <button key={a.op} onClick={() => handleOpClick(a.op)} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 11, fontWeight: 600, color: a.color, whiteSpace: "nowrap",
                    background: selectedOp === a.op ? `${a.color}30` : `${a.color}12`,
                    boxShadow: selectedOp === a.op ? `0 0 10px ${a.glow}` : "none",
                    transition: "all 0.15s ease",
                  }}>
                    <span style={{ fontSize: 13 }}>{a.icon}</span>
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>

              {/* Tone submenu */}
              {showTones && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8, padding: 6, borderRadius: 10, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                  {TONES.map((t) => (
                    <button key={t.value} onClick={() => handleTonePick(t.value)} style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                      fontSize: 10, fontWeight: selectedTone === t.value ? 700 : 500, color: t.color,
                      background: selectedTone === t.value ? `${t.color}20` : "transparent", transition: "all 0.1s ease",
                    }}>
                      <span>{t.icon}</span><span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Stage 2: Instruction input */}
              <input type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && selectedOp) handleTrigger(); }}
                placeholder="可以补充你的灵感或修改方向（可选）"
                style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#d0d0e0", fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
              />

              {/* Trigger button */}
              <button onClick={handleTrigger} disabled={!selectedOp} style={{
                width: "100%", padding: "7px", borderRadius: 8, border: "none", cursor: selectedOp ? "pointer" : "not-allowed",
                fontSize: 12, fontWeight: 700, color: "#fff", opacity: selectedOp ? 1 : 0.4,
                background: selectedOp ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.08)",
                transition: "all 0.15s ease",
              }}>
                开始 AI 编辑
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
