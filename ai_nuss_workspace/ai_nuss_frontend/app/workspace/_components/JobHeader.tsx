"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { hasModelConfig } from "../ModelConfigPanel";
import StatusBadge from "./StatusBadge";

export default function JobHeader() {
  const { jobState, wsConnected, isProcessing, sceneProgress, setShowConfig } = useWorkspace();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="glass-panel flex items-center justify-between flex-wrap gap-3 text-xs">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[var(--nuss-muted)]">
          任务{" "}
          <code className="text-[var(--nuss-text)] font-mono text-[11px]">
            {jobState.jobId ? jobState.jobId.slice(0, 16) + "…" : "—"}
          </code>
        </span>
        {jobState.novelTitle && (
          <span className="text-[var(--nuss-muted)]">
            📖 <span className="text-[var(--nuss-text)]">{jobState.novelTitle}</span>
          </span>
        )}
        <StatusBadge status={jobState.reviewStatus} />
      </div>

      <div className="flex items-center gap-3">
        {isProcessing && (
          <div className="flex items-center gap-2">
            <div className="w-28 h-1.5 rounded-full bg-[var(--nuss-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  background: "linear-gradient(90deg, #A855F7, #00F0FF)",
                  width: `${Math.max(jobState.progressPct, 1)}%`,
                }}
              />
            </div>
            <span className="text-[11px] font-medium" style={{ color: "var(--nuss-accent)" }}>
              {Math.round(jobState.progressPct)}%
            </span>
          </div>
        )}

        <span className="flex items-center gap-1.5 text-[var(--nuss-muted)] text-[10px]">
          <span className={`w-2 h-2 rounded-full ${
            wsConnected
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
              : "bg-red-400 animate-pulse"
          }`} />
          {wsConnected ? "实时连接" : "未连接"}
        </span>

        <button
          onClick={() => setShowConfig(true)}
          className="text-[10px] px-2 py-1 rounded-full border transition-colors"
          style={mounted && hasModelConfig()
            ? {
                borderColor: "rgba(0,240,255,0.3)",
                color: "var(--nuss-accent)",
                background: "rgba(0,240,255,0.06)",
                textShadow: "0 0 8px rgba(0,240,255,0.3)",
              }
            : {
                borderColor: "rgba(250,204,21,0.3)",
                color: "#facc15",
                background: "rgba(250,204,21,0.06)",
              }
          }
        >
          {mounted ? (hasModelConfig() ? "模型已配置" : "配置模型") : "配置模型"}
        </button>
      </div>

      {jobState.currentStep && (
        <div className="w-full text-[10px] text-[var(--nuss-muted)] truncate flex items-center gap-2">
          <span>⏳ {jobState.currentStep}</span>
          {sceneProgress && sceneProgress.current > 0 && (
            <span style={{ color: "var(--nuss-accent)" }} className="font-medium">
              ▸ 场景 {sceneProgress.current}/{sceneProgress.total}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
