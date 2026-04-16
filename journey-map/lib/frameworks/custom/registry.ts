import type { FrameworkConfig } from "../universal/config";
import { validateFrameworkConfig } from "./validate";

// ──────────────────────────────────────────────────────────────────────────────
// Client-side persistence for user-generated custom frameworks.
// Stored as a keyed dictionary so adding/removing a single framework doesn't
// require rewriting the whole list (and we get id uniqueness for free).
//
// All operations are safe to call during SSR — they no-op if `localStorage`
// isn't defined (matching the theme storage pattern in lib/theme/storage.ts).
// ──────────────────────────────────────────────────────────────────────────────

const KEY = "custom-frameworks-v1";

type Stored = Record<string, FrameworkConfig>;

function readStored(): Stored {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Stored;
  } catch {
    return {};
  }
}

function writeStored(s: Stored): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota or other storage error — swallow. Next reload will miss this one.
  }
}

export function loadCustomFrameworks(): FrameworkConfig[] {
  const stored = readStored();
  const out: FrameworkConfig[] = [];
  for (const [, raw] of Object.entries(stored)) {
    // Re-validate on load so stale/corrupt entries don't crash the app.
    const v = validateFrameworkConfig(raw);
    if (v.ok) out.push(v.config);
  }
  return out;
}

export function saveCustomFramework(cfg: FrameworkConfig): void {
  const stored = readStored();
  stored[cfg.id] = cfg;
  writeStored(stored);
}

export function deleteCustomFramework(id: string): void {
  const stored = readStored();
  if (!(id in stored)) return;
  delete stored[id];
  writeStored(stored);
}
