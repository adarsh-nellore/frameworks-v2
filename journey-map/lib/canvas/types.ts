import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";

export type BoardStatus =
  /** The board is fully generated and ready for editing. */
  | "ready"
  /** Waiting for /api/framework-describe to synthesize a framework from a prompt.
   *  The board has no usable frameworkId/map yet — canvas shows a skeleton. */
  | "pending-describe"
  /** Waiting for /api/generate to populate the board's seed from sources. The
   *  frameworkId/map are the framework's seed; canvas overlays progress. */
  | "pending-generate";

/**
 * Metadata for one attachment persisted on a board. The blob itself lives in
 * IndexedDB (see lib/canvas/attachments-store) keyed by `${boardId}:${id}` —
 * only this metadata roundtrips through localStorage, so the state blob stays
 * small even when a board has a 10 MB PDF attached.
 */
export type AttachmentMeta = {
  id: string;
  name: string;
  /** "pdf" / "image" go to Anthropic as document/image content blocks; "text"
   *  covers everything else the ingestion layer normalizes to plain text
   *  (txt, md, docx, csv, tsv, json, html, css, url). */
  kind: "pdf" | "image" | "text";
  /** MIME type of the stored blob. Used to pick the right Anthropic content
   *  block (e.g. image/png vs image/jpeg) and to reconstruct a File on upload. */
  mediaType: string;
  sizeBytes: number;
  addedAt: number;
};

export type Board = {
  id: string;
  frameworkId: string;
  /** Set only when frameworkId is dynamic (user-generated). Kept on the Board so
   *  the dynamic registry can be rehydrated on reload before boards mount. */
  customConfig?: FrameworkConfig;
  title: string;
  /** Canvas-space top-left in CSS pixels (pre-zoom). */
  x: number;
  y: number;
  /** UniversalMap for every board — rendered through `FrameworkGrid`. */
  map: UniversalMap;
  selection: UniversalSelection | null;
  status: BoardStatus;
  /** For pending-describe: the user's original prompt, shown in the skeleton. */
  pendingPrompt?: string;
  /** Per-board attachments the agent reasons through on describe / generate. */
  attachments?: AttachmentMeta[];
  createdAt: number;
};

/**
 * A Canvas is a single whiteboard surface that owns a set of boards and its
 * own active board. Many canvases can live inside one Project — like Miro,
 * where a "team" (project) holds many boards (canvases). Switching canvases
 * within a project swaps the live boards without leaving the project.
 */
export type Canvas = {
  id: string;
  name: string;
  createdAt: number;
  boards: Board[];
  activeBoardId: string | null;
};

/**
 * A Project is a folder of canvases. Users can have many projects and each
 * project holds one or more canvases. Creating a new project yields a single
 * empty canvas so the user always has a surface to work on.
 */
export type Project = {
  id: string;
  name: string;
  createdAt: number;
  canvases: Canvas[];
  activeCanvasId: string | null;
};

export type CanvasState = {
  /** All projects the user has in localStorage. Always ≥ 1 after hydration —
   *  if storage is empty, a "My project" is seeded on boot. */
  projects: Project[];
  /** The currently-visible project. Always points at an existing project. */
  activeProjectId: string | null;
  /** The currently-visible canvas within the active project. */
  activeCanvasId: string | null;
  /** Boards of the active canvas (within the active project), surfaced at the
   *  top level so every existing consumer (BoardFrame, TopBar, Copilot, etc.)
   *  keeps the same API. */
  boards: Board[];
  /** activeBoardId of the active canvas. */
  activeBoardId: string | null;
  hydrated: boolean;
};
