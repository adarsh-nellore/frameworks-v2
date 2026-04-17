import type { Board, Project } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// localStorage persistence for the multi-project / multi-board canvas.
//
// Storage evolution:
//   v1 — single workspace, { boards: Board[], activeBoardId }
//   v2 — multi-project,   { projects: Project[], activeProjectId }
//
// Loader reads whichever version it finds; writes are always v2. A v1 blob is
// migrated into a single "Default" project on first load. Quota + SSR
// handling mirrors lib/frameworks/custom/registry.ts and lib/theme/storage.ts.
// ──────────────────────────────────────────────────────────────────────────────

const KEY = "frameworks-canvas-v1";

type StoredV1 = {
  version: 1;
  boards: Board[];
  activeBoardId: string | null;
};

type StoredV2 = {
  version: 2;
  projects: Project[];
  activeProjectId: string | null;
};

export type LoadResult =
  | { ok: true; projects: Project[]; activeProjectId: string | null }
  | { ok: false };

function genProjectId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function loadCanvasState(): LoadResult {
  if (typeof localStorage === "undefined") return { ok: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ok: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ok: false };

    // v2 — current shape
    const asV2 = parsed as Partial<StoredV2>;
    if (asV2.version === 2 && Array.isArray(asV2.projects)) {
      const projects = asV2.projects.filter(
        (p): p is Project =>
          !!p &&
          typeof p === "object" &&
          typeof (p as Project).id === "string" &&
          Array.isArray((p as Project).boards)
      );
      if (projects.length === 0) return { ok: false };
      const activeId =
        typeof asV2.activeProjectId === "string" &&
        projects.some((p) => p.id === asV2.activeProjectId)
          ? asV2.activeProjectId
          : projects[0].id;
      return { ok: true, projects, activeProjectId: activeId };
    }

    // v1 — single workspace. Wrap into a default project so older users keep
    // all their boards on first upgrade.
    const asV1 = parsed as Partial<StoredV1>;
    if (asV1.version === 1 && Array.isArray(asV1.boards)) {
      const project: Project = {
        id: genProjectId(),
        name: "Untitled project",
        createdAt: Date.now(),
        boards: asV1.boards,
        activeBoardId:
          typeof asV1.activeBoardId === "string" ? asV1.activeBoardId : null,
      };
      return { ok: true, projects: [project], activeProjectId: project.id };
    }

    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "unknown" };

export function saveCanvasState(
  projects: Project[],
  activeProjectId: string | null
): SaveResult {
  if (typeof localStorage === "undefined") return { ok: true };
  try {
    const body: StoredV2 = { version: 2, projects, activeProjectId };
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
