"use client";

import type { ReviewStatus } from "../../api_client";

const STATUS_MAP: Record<string, { label: string; style: Record<string, string> }> = {
  uploading:           { label: "上传中",   style: { color: "#60A5FA", borderColor: "rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.08)" } },
  analyzing:           { label: "分析中",   style: { color: "#FBBF24", borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)" } },
  pending_character:   { label: "需审核",   style: { color: "#FB923C", borderColor: "rgba(251,146,60,0.3)", background: "rgba(251,146,60,0.08)" } },
  pending_scene:       { label: "需审核",   style: { color: "#FB923C", borderColor: "rgba(251,146,60,0.3)", background: "rgba(251,146,60,0.08)" } },
  generating:          { label: "生成中",   style: { color: "#A855F7", borderColor: "rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.08)" } },
  completed:           { label: "已完成 ✓", style: { color: "#34D399", borderColor: "rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.08)", textShadow: "0 0 6px rgba(52,211,153,0.3)" } },
  completed_partial:   { label: "部分完成", style: { color: "#FBBF24", borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)" } },
  error:               { label: "失败",     style: { color: "#F87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" } },
};

export default function StatusBadge({ status }: { status: ReviewStatus }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.error;
  return (
    <span className="status-badge" style={cfg.style}>{cfg.label}</span>
  );
}
