import type { Board } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// localStorage persistence for the multi-board canvas.
//
// Matches the naming + error-swallowing pattern in lib/frameworks/custom/registry.ts
// and lib/theme/storage.ts so all three share the same guarantees:
//   - Safe during SSR (no-op when localStorage is undefined).
//   - Read errors return a sentinel; app keeps running.
//   - Write errors (e.g. QuotaExceededError) are reported via the return value
//     so callers can surface a toast and stop trying to persist.
// ──────────────────────────────────────────────────────────────────────────────

const KEY = "frameworks-canvas-v1";

type StoredV1 = {
  version: 1;
  boards: Board[];
  activeBoardId: string | null;
};

export type LoadResult =
  | { ok: true; boards: Board[]; activeBoardId: string | null }
  | { ok: false };

export function loadCanvasState(): LoadResult {
  if (typeof localStorage === "undefined") return { ok: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ok: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ok: false };
    const p = parsed as Partial<StoredV1>;
    if (p.version !== 1 || !Array.isArray(p.boards)) return { ok: false };
    return {
      ok: true,
      boards: p.boards,
      activeBoardId: typeof p.activeBoardId === "string" ? p.activeBoardId : null,
    };
  } catch {
    return { ok: false };
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "unknown" };

export function saveCanvasState(boards: Board[], activeBoardId: string | null): SaveResult {
  if (typeof localStorage === "undefined") return { ok: true };
  try {
    const body: StoredV1 = { version: 1, boards, activeBoardId };
    localStorage.setItem(KEY, JSON.stringify(body));
    return { ok: true };
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      return { ok: false, reason: "quota" };
    }
    return { ok: false, reason: "unknown" };
  }
}

export function clearCanvasState(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
