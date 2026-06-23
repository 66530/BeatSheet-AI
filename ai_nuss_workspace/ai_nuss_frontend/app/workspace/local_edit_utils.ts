/**
 * AI-NUSS 3.0 — Local Edit Version History
 * Tracks every AI edit for undo/review.
 */

import type { LocalEditOperation } from "../api_client";

export interface EditRecord {
  id: string;
  timestamp: string;
  operation: LocalEditOperation;
  tone?: string;
  sceneId: string;
  originalText: string;
  editedText: string;
  accepted: boolean;
}

const STORAGE_KEY = "ai_nuss_edit_history";

function genId(): string {
  return `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadEditHistory(): EditRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EditRecord[];
  } catch { /* ignore */ }
  return [];
}

function saveEditHistory(records: EditRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep last 200 records max
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-200)));
  } catch { /* ignore */ }
}

export function recordEdit(
  operation: LocalEditOperation,
  sceneId: string,
  originalText: string,
  editedText: string,
  tone?: string,
): EditRecord {
  const record: EditRecord = {
    id: genId(),
    timestamp: new Date().toISOString(),
    operation,
    tone,
    sceneId,
    originalText,
    editedText,
    accepted: false,
  };
  const history = loadEditHistory();
  history.push(record);
  saveEditHistory(history);
  return record;
}

export function acceptEdit(editId: string): void {
  const history = loadEditHistory();
  const record = history.find((r) => r.id === editId);
  if (record) record.accepted = true;
  saveEditHistory(history);
}

export function getLastEdit(): EditRecord | undefined {
  const history = loadEditHistory();
  return history[history.length - 1];
}

export function getSceneEditHistory(sceneId: string): EditRecord[] {
  return loadEditHistory().filter((r) => r.sceneId === sceneId);
}
