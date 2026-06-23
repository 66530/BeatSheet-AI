"use client";

import { useWorkspace } from "./WorkspaceProvider";

export default function Metrics() {
  const { isCompleted, jobState } = useWorkspace();

  if (!isCompleted || !jobState.screenplay) return null;

  const genStats = (jobState.screenplay as Record<string, unknown>).generation_stats as Record<string, unknown> | undefined;
  if (!genStats) return null;

  const health = (genStats.scene_health || {}) as Record<string, unknown>;

  const items: { label: string; value: string }[] = [
    { label: "场景",   value: `${genStats.total_scenes || 0}场` },
    { label: "节拍",   value: `${genStats.total_beats || 0}个` },
    { label: "覆盖率", value: `${Math.round((genStats.coverage as number || 0) * 100)}%` },
    { label: "平均字", value: `${health.avg_chars || 0}字` },
    { label: "节拍/场",value: `${health.avg_beats || 0}` },
    { label: "空场率", value: `${Math.round((health.empty_scene_rate as number || 0) * 100)}%` },
    { label: "质量",   value: health.avg_quality ? `${(Number(health.avg_quality) * 100).toFixed(0)}%` : "—" },
  ];

  return (
    <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
      {items.map(({ label, value }) => (
        <div key={label} className="metric-card">
          <div className="metric-value">{value}</div>
          <div className="metric-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
