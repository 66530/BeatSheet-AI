/**
 * AI-NUSS 3.0 — Full-Stack API Communication Client
 * Chapter 6 & 12: Axios HTTP + WebSocket with exponential-backoff reconnect.
 * PHASE P0: Client skeleton with typed interfaces and stub-safe defaults.
 */

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:8000";

// ═══════════════════════════════════════════════════════════════
// Typed Interfaces (Chapter 9: SceneUIModel, etc.)
// ═══════════════════════════════════════════════════════════════

export interface ScriptBreakdownModel {
  props: string[];             // 关键道具
  wardrobe: string[];          // 服装/化妆
  extras: string[];            // 群演/特约
  stunts: string[];            // 动作/特技
  vfx: string[];               // 视觉特效
  special_equipment: string[]; // 特殊设备
}

export interface SceneUIModel {
  scene_id: string;
  scene_number: number;
  location: string;
  location_type?: "indoor" | "outdoor" | "unknown";
  time_of_day: string;
  summary: string;
  timeline_mode: "sequential" | "flashback" | "parallel" | "montage";
  beats: BeatUIModel[];
  character_ids: string[];
  scene_score: number;
  estimated_pages?: number;
  breakdown?: ScriptBreakdownModel;
}

export interface BeatUIModel {
  beat_id: string;
  beat_type: string;
  dramatic_function: string;
  summary: string;
  elements: ScreenplayElementUIModel[];
  emotional_tone: string;
  intensity: number;
}

export interface ScreenplayElementUIModel {
  type: "action" | "dialogue" | "inner_monologue" | "caption";
  character_id?: string;
  target_character_id?: string;
  content: string;
  emotion?: string;
  intention?: string;
  is_voice_over: boolean;
  cinematic_layer?: {
    camera?: { shot?: string; movement?: string };
    lighting?: string;
    sound?: string;
  };
}

export interface CharacterUIModel {
  character_id: string;
  canonical_name: string;
  aliases: string[];
  constraints: {
    current_belief: string;
    current_goal: string;
    emotional_state: string;
    internal_conflict: string;
    taboos: string[];
  };
  description: string;
  role: string;
  confidence_score: number;
}

export interface JobStatusModel {
  job_id: string;
  novel_id: string;
  novel_title: string;
  review_status: string;
  current_chapter_index: number;
  progress_pct: number;
  current_step: string;
  event_log: Array<{
    timestamp: string;
    event: string;
    message: string;
  }>;
  last_error: string | null;
  updated_at: string;
  // Full data payloads
  scenes?: SceneUIModel[];
  beats?: BeatUIModel[];
  master_cast_list?: CharacterUIModel[];
  entity_map?: Record<string, string>;
  screenplay?: Record<string, unknown>;
  story_bible?: Record<string, unknown>;
}

export interface WebSocketFrameModel {
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type ReviewStatus =
  | "idle"
  | "uploading"
  | "analyzing"
  | "pending_character"
  | "pending_scene"
  | "generating"
  | "completed"
  | "completed_partial"
  | "error";

// ═══════════════════════════════════════════════════════════════
// HTTP Client (Axios-style fetch wrapper)
// ═══════════════════════════════════════════════════════════════

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    console.error(`[apiFetch] ${res.status} ${res.statusText}`, errorBody);
    throw new Error(
      `API Error ${res.status}: ${(errorBody as { message?: string }).message || (errorBody as { detail?: string }).detail || res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

// ═══════════════════════════════════════════════════════════════
// REST API Methods
// ═══════════════════════════════════════════════════════════════

export async function submitNovelJob(
  fileBytes: string | null,
  fileType: string,
  novelTitle?: string
): Promise<{ job_id: string; novel_id: string; status: string; review_status: string }> {
  return apiFetch("/api/v1/jobs/submit", {
    method: "POST",
    body: JSON.stringify({
      file_bytes: fileBytes,
      file_type: fileType,
      novel_title: novelTitle,
      config: { auto_split_chapters: true, remove_marketing_noise: true },
    }),
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusModel> {
  return apiFetch(`/api/v1/jobs/${jobId}/status`);
}

export async function reviewBibleCharacter(
  jobId: string,
  action: string,
  characterId: string,
  aliasRemap?: Record<string, string>
): Promise<Record<string, unknown>> {
  return apiFetch(`/api/v1/jobs/${jobId}/review/bible-character`, {
    method: "POST",
    body: JSON.stringify({
      action,
      character_id: characterId,
      alias_remap: aliasRemap,
    }),
  });
}

export async function retryJob(
  jobId: string
): Promise<{ job_id: string; novel_id: string; status: string; message: string; retry_count: number }> {
  return apiFetch(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
}

// ═══════════════════════════════════════════════════════════════
// AI Local Editing
// ═══════════════════════════════════════════════════════════════

export type LocalEditOperation = "rewrite" | "expand" | "shorten" | "change_tone" | "regenerate";
export type LocalEditTone = "funny" | "emotional" | "dark" | "romantic" | "suspense" | "inspirational" | "professional";

export interface LocalEditResult {
  edited_text: string;
  operation: LocalEditOperation;
  original_length: number;
  edited_length: number;
}

export async function localEdit(
  jobId: string,
  operation: LocalEditOperation,
  selectedText: string,
  tone?: LocalEditTone,
  customInstruction?: string,
  previousScene?: string,
  nextScene?: string,
): Promise<LocalEditResult> {
  const result: LocalEditResult = await apiFetch(`/api/v1/jobs/${jobId}/local-edit`, {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      operation,
      selected_text: selectedText,
      tone: tone || undefined,
      custom_instruction: customInstruction || undefined,
      previous_scene: previousScene || undefined,
      next_scene: nextScene || undefined,
    }),
  });
  return result;
}

export async function reviewScenes(
  jobId: string,
  action: string,
  sceneAdjustments?: Array<{
    scene_id: string;
    new_boundary_offset?: number;
    merge_with_next?: boolean;
  }>
): Promise<Record<string, unknown>> {
  return apiFetch(`/api/v1/jobs/${jobId}/review/scenes`, {
    method: "POST",
    body: JSON.stringify({ action, scene_adjustments: sceneAdjustments }),
  });
}

// ═══════════════════════════════════════════════════════════════
// WebSocket Client (with Exponential Backoff Reconnect)
// Chapter 12 §2: State Reconciliation & Reconnect Heuristic
// ═══════════════════════════════════════════════════════════════

export type WsEventHandler = (frame: WebSocketFrameModel) => void;

export interface WsConnection {
  send: (data: unknown) => void;
  close: () => void;
  isConnected: () => boolean;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export function connectJobStream(
  jobId: string,
  onEvent: WsEventHandler,
  onReconnect?: () => Promise<void>
): WsConnection {
  let ws: WebSocket | null = null;
  let retryCount = 0;
  let intentionalClose = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (intentionalClose) return;

    const url = `${WS_BASE_URL}/ws/jobs/${jobId}/stream`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryCount = 0; // Reset retry counter on successful connection
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const frame: WebSocketFrameModel = JSON.parse(event.data as string);
        onEvent(frame);
      } catch (err) {
        console.warn("[WS] Failed to parse frame:", err);
      }
    };

    ws.onerror = (err: Event) => {
      console.error("[WS] Error:", err);
    };

    ws.onclose = (_event: CloseEvent) => {
      ws = null;

      if (intentionalClose) return;

      // Exponential backoff reconnect (Chapter 12 §2)
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
        reconnectTimer = setTimeout(async () => {
          retryCount++;
          // State reconciliation: re-fetch latest state before reconnecting
          if (onReconnect) {
            try {
              await onReconnect();
            } catch (err) {
              console.warn("[WS] State reconciliation failed:", err);
            }
          }
          connect();
        }, delay);
      } else {
        console.error("[WS] Max retries exhausted. Giving up.");
      }
    };
  }

  connect();

  return {
    send: (data: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    close: () => {
      intentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close(1000, "Client disconnect");
    },
    isConnected: () => ws !== null && ws.readyState === WebSocket.OPEN,
  };
}
