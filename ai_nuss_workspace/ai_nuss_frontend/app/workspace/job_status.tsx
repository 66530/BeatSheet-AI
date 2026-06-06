"use client";

/**
 * AI-NUSS 3.0 — Job Status Timeline Component
 * Chapter 9: Real-time streaming feedback via WebSocket.
 * Chapter 12 §2: State reconciliation + reconnect heuristic.
 * Blank-safe: renders fully with empty event log.
 */
import { useEffect, useState } from "react";
import { type WebSocketFrameModel, type WsConnection, connectJobStream } from "../api_client";

interface JobStatusProps {
  jobId: string;
}

interface TimelineEntry {
  timestamp: string;
  event: string;
  summary: string;
  sceneId?: string;
  beatId?: string;
}

export default function JobStatus({ jobId }: JobStatusProps) {
  const [connected, setConnected] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [ws, setWs] = useState<WsConnection | null>(null);

  useEffect(() => {
    if (!jobId || jobId.startsWith("mock")) {
      setConnected(true);
      setEntries([
        {
          timestamp: new Date().toISOString(),
          event: "state_changed",
          summary: "PHASE P0: Mock mode active. No WebSocket connection needed.",
        },
        {
          timestamp: new Date().toISOString(),
          event: "beat_generated",
          summary: "B_001 (setup): 林雨欣在正厅焦虑地等待林母回家",
          sceneId: "SC_001_01",
          beatId: "B_001",
        },
        {
          timestamp: new Date().toISOString(),
          event: "beat_generated",
          summary: "B_002 (reveal): 林母甩出亲子鉴定报告，真相大白",
          sceneId: "SC_001_01",
          beatId: "B_002",
        },
      ]);
      return;
    }

    const connection = connectJobStream(jobId, (frame: WebSocketFrameModel) => {
      setConnected(true);

      const entry: TimelineEntry = {
        timestamp: frame.timestamp,
        event: frame.event,
        summary:
          frame.event === "beat_generated"
            ? `${frame.payload.beat_id} (${frame.payload.beat_type}): ${frame.payload.summary}`
            : frame.event === "state_changed"
              ? `State → ${frame.payload.review_status}`
              : frame.event === "error"
                ? `Error: ${(frame.payload as { message?: string }).message || "Unknown"}`
                : frame.event,
        sceneId: frame.payload.scene_id as string | undefined,
        beatId: frame.payload.beat_id as string | undefined,
      };

      setEntries((prev) => [entry, ...prev].slice(0, 50)); // Keep last 50
    });

    setWs(connection);
    setConnected(true);

    return () => {
      connection.close();
    };
  }, [jobId]);

  const getEventIcon = (event: string) => {
    if (event === "beat_generated") return "⚡";
    if (event === "scene_segmented") return "🎬";
    if (event === "character_resolved") return "🎭";
    if (event === "state_changed") return "🔔";
    if (event === "error") return "❌";
    return "📌";
  };

  const getEventColor = (event: string) => {
    if (event === "beat_generated") return "text-yellow-400";
    if (event === "state_changed") return "text-[--nuss-accent]";
    if (event === "error") return "text-red-400";
    return "text-[--nuss-muted]";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">⏱️ Real-Time Job Timeline</h3>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500 animate-pulse"
            }`}
          />
          {connected ? "Live" : "Connecting..."}
        </span>
      </div>

      <div className="blank-safe-card max-h-[500px] overflow-y-auto p-0">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-[--nuss-muted] text-sm animate-pulse">
            Waiting for events...
          </div>
        ) : (
          <div className="divide-y divide-[--nuss-border]/50">
            {entries.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 hover:bg-[--nuss-accent]/5 transition-colors duration-150"
              >
                <span className={`text-sm mt-0.5 ${getEventColor(entry.event)}`}>
                  {getEventIcon(entry.event)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[--nuss-text] truncate">
                    {entry.summary}
                  </p>
                  <div className="flex gap-3 mt-0.5 text-[10px] text-[--nuss-muted]">
                    <span>{entry.timestamp?.slice(11, 19)}</span>
                    <span className="text-[--nuss-accent]">
                      [{entry.event}]
                    </span>
                    {entry.sceneId && (
                      <span className="text-[--nuss-muted]">{entry.sceneId}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
