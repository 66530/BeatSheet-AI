"use client";

/**
 * AI-NUSS 3.0 — Upload Panel Component
 * Chapter 9 §1: Async file reading & state preparation.
 * Blank-safe: renders fully with empty/default data.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "../api_client";

interface UploadPanelProps {
  jobId: string;
  novelId: string;
  reviewStatus: ReviewStatus;
}

export default function UploadPanel({
  jobId,
  novelId,
  reviewStatus,
}: UploadPanelProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isMock = jobId.startsWith("mock");

  const handleSubmit = useCallback(async () => {
    if (!file || isMock) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
      const res = await fetch("/api/v1/jobs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_bytes: null, // TODO: base64 encode file in production
          file_type: ext,
          novel_title: file.name.replace(/\.[^.]+$/, ""),
          config: {
            auto_split_chapters: true,
            remove_marketing_noise: true,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      // Navigate to the same workspace with the real job_id
      router.push(
        `/workspace?job_id=${data.job_id}&novel_id=${data.novel_id}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setErrorMsg(msg);
      setIsUploading(false);
    }
  }, [file, isMock, router]);

  return (
    <div className="grid grid-cols-2 gap-6 animate-fade-in">
      {/* Left: Upload Zone */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">📤 Upload Novel Source</h3>
        <div className="blank-safe-card p-6 text-center">
          {isMock ? (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto rounded-lg bg-[--nuss-accent]/20 flex items-center justify-center">
                <span className="text-2xl">📖</span>
              </div>
              <p className="font-medium">Demo Mode — No Backend Job</p>
              <p className="text-xs text-[--nuss-muted]">
                You are viewing demo data. Go to the{" "}
                <button
                  onClick={() => router.push("/")}
                  className="underline text-[--nuss-accent] hover:text-[--nuss-accent-glow]"
                >
                  home page
                </button>{" "}
                to upload a real novel and start a new adaptation job.
              </p>
              <div className="text-[10px] text-[--nuss-muted] font-mono mt-2">
                Job ID: {jobId}<br />
                Novel ID: {novelId}
              </div>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setErrorMsg(null);
                }}
                className="text-sm text-[--nuss-muted] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-[--nuss-border] file:bg-[--nuss-surface] file:text-[--nuss-text] hover:file:border-[--nuss-accent]"
              />
              {file && (
                <div className="mt-3 text-sm animate-slide-up">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-[--nuss-muted]">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm animate-slide-up">
            ❌ {errorMsg}
          </div>
        )}

        <div className="flex gap-2">
          <button
            disabled={isUploading || isMock || !file}
            onClick={handleSubmit}
            className="console-btn-primary flex-1"
          >
            {isMock
              ? "Go to Home Page to Start ↗"
              : isUploading
                ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </span>
                )
                : file
                  ? "Submit for Adaptation →"
                  : "Select a File to Submit"}
          </button>
        </div>
      </div>

      {/* Right: Status Panel */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">📊 Pipeline Status</h3>
        <div className="blank-safe-card space-y-3">
          {PIPELINE_STAGES.map((stage, i) => {
            const isActive = stage.statuses.includes(reviewStatus);
            const isPast = PIPELINE_STAGES.slice(0, i).some((s) =>
              s.statuses.includes(reviewStatus)
            );
            let bgClass = "bg-[--nuss-border]/30";
            if (isActive) bgClass = "bg-[--nuss-accent]/30 border-[--nuss-accent]/50";
            else if (isPast || reviewStatus === "completed") bgClass = "bg-green-500/10 border-green-500/30";

            return (
              <div
                key={stage.label}
                className={`flex items-center gap-3 p-2.5 rounded border ${bgClass} transition-all duration-300`}
              >
                <span className="text-lg">{stage.icon}</span>
                <div>
                  <p className="text-sm font-medium">{stage.label}</p>
                  <p className="text-[10px] text-[--nuss-muted]">
                    {stage.description}
                  </p>
                </div>
                {isActive && reviewStatus !== "completed" && (
                  <span className="ml-auto w-4 h-4 border-2 border-[--nuss-accent] border-t-transparent rounded-full animate-spin" />
                )}
                {(isPast || reviewStatus === "completed") && (
                  <span className="ml-auto text-green-400">✓</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PIPELINE_STAGES = [
  {
    icon: "📄",
    label: "Document Parsing",
    description: "Extract chapters and clean text",
    statuses: ["uploading"],
  },
  {
    icon: "📖",
    label: "Story Bible",
    description: "Build world rules and setting",
    statuses: ["analyzing"],
  },
  {
    icon: "🎭",
    label: "Character Resolution",
    description: "Disambiguate all entity mentions",
    statuses: ["analyzing", "pending_character"],
  },
  {
    icon: "🎬",
    label: "Scene Segmentation",
    description: "Adaptive boundary detection",
    statuses: ["analyzing", "pending_scene"],
  },
  {
    icon: "⚡",
    label: "Beat Extraction",
    description: "Causality chain linking",
    statuses: ["generating"],
  },
  {
    icon: "📜",
    label: "Screenplay Generation",
    description: "Visual element orchestration + YAML export",
    statuses: ["generating", "completed"],
  },
];
