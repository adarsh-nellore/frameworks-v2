import type { Board, Canvas, Project } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// localStorage persistence for the multi-project / multi-canvas / multi-board
// workspace.
//
// Storage evolution:
//   v1 — single workspace,     { boards: Board[], activeBoardId }
//   v2 — multi-project,        { projects: Project{boards}[], activeProjectId }
//   v3 — multi-canvas nesting, { projects: Project{canvases{boards}}[], activeProjectId }
//
// Loader reads whichever version it finds; writes are always v3. Earlier
// versions are migrated by wrapping their flat boards into a default canvas.
// ──────────────────────────────────────────────────────────────────────────────

const KEY = "frameworks-canvas-v1";

type StoredV1 = {
  version: 1;
  boards: Board[];
  activeBoardId: string | null;
};

// Pre-v3 project shape — boards were held flat on the project with no
// canvas layer in between.
type LegacyV2Project = {
  id: string;
  name: string;
  createdAt: number;
  boards: Board[];
  activeBoardId: string | null;
};

type StoredV2 = {
  version: 2;
  projects: LegacyV2Project[];
  activeProjectId: string | null;
};

type StoredV3 = {
  version: 3;
  projects: Project[];
  activeProjectId: string | null;
};

export type LoadResult =
  | { ok: true; projects: Project[]; activeProjectId: string | null }
  | { ok: false };

function genProjectId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function genCanvasId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function wrapBoardsInDefaultCanvas(
  boards: Board[],
  activeBoardId: string | null
): Canvas {
  return {
    id: genCanvasId(),
    name: "Canvas 1",
    createdAt: Date.now(),
    boards,
    activeBoardId,
  };
}

export function loadCanvasState(): LoadResult {
  if (typeof localStorage === "undefined") return { ok: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ok: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ok: false };

    // v3 — current shape
    const asV3 = parsed as Partial<StoredV3>;
    if (asV3.version === 3 && Array.isArray(asV3.projects)) {
      const projects = asV3.projects.filter(
        (p): p is Project =>
          !!p &&
          typeof p === "object" &&
          typeof (p as Project).id === "string" &&
          Array.isArray((p as Project).canvases)
      );
      if (projects.length === 0) return { ok: false };
      const activeId =
        typeof asV3.activeProjectId === "string" &&
        projects.some((p) => p.id === asV3.activeProjectId)
          ? asV3.activeProjectId
          : projects[0].id;
      return { ok: true, projects, activeProjectId: activeId };
    }

    // v2 — flat boards per project. Wrap each project's boards into a single
    // default canvas so the new Project → Canvas → Board tree is preserved
    // without data loss.
    const asV2 = parsed as Partial<StoredV2>;
    if (asV2.version === 2 && Array.isArray(asV2.projects)) {
      const projects: Project[] = asV2.projects
        .filter(
          (p): p is LegacyV2Project =>
            !!p &&
            typeof p === "object" &&
            typeof (p as LegacyV2Project).id === "string" &&
            Array.isArray((p as LegacyV2Project).boards)
        )
        .map((p) => {
          const canvas = wrapBoardsInDefaultCanvas(p.boards, p.activeBoardId);
          return {
            id: p.id,
            name: p.name || "Untitled project",
            createdAt: p.createdAt || Date.now(),
            canvases: [canvas],
            activeCanvasId: canvas.id,
          };
        });
      if (projects.length === 0) return { ok: false };
      const activeId =
        typeof asV2.activeProjectId === "string" &&
        projects.some((p) => p.id === asV2.activeProjectId)
          ? asV2.activeProjectId
          : projects[0].id;
      return { ok: true, projects, activeProjectId: activeId };
    }

    // v1 — single flat workspace. Wrap into one project + one canvas.
    const asV1 = parsed as Partial<StoredV1>;
    if (asV1.version === 1 && Array.isArray(asV1.boards)) {
      const canvas = wrapBoardsInDefaultCanvas(
        asV1.boards,
        typeof asV1.activeBoardId === "string" ? asV1.activeBoardId : null
      );
      const project: Project = {
        id: genProjectId(),
        name: "Untitled project",
        createdAt: Date.now(),
        canvases: [canvas],
        activeCanvasId: canvas.id,
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
    const body: StoredV3 = { version: 3, projects, activeProjectId };
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
