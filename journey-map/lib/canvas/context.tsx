"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";
import {
  isDynamicFramework,
  registerDynamicFramework,
} from "@/lib/frameworks";
import {
  loadCustomFrameworks,
  saveCustomFramework,
} from "@/lib/frameworks/custom/registry";
import { parseSseFrames, type GenerateEvent } from "@/lib/pipeline/events";
import type {
  AttachmentMeta,
  Board,
  BoardStatus,
  Canvas,
  CanvasState,
  Project,
} from "./types";
import { loadCanvasState, saveCanvasState } from "./storage";
import {
  deleteAllForBoard,
  deleteAttachment,
  genAttachmentId,
  getAttachmentAsFile,
  putAttachment,
} from "./attachments-store";

// ──────────────────────────────────────────────────────────────────────────────
// CanvasContext — state + streaming generation for the multi-project workspace.
//
// Hierarchy: Project → Canvas → Board. A project owns one or more canvases;
// each canvas owns its own boards. The root `boards` / `activeBoardId` state
// surfaces the *active canvas within the active project* — every existing
// consumer (BoardFrame, Copilot, TopBar, etc.) keeps the same API.
// ──────────────────────────────────────────────────────────────────────────────

type AddBoardInput = {
  frameworkId: string;
  customConfig?: FrameworkConfig;
  title: string;
  map: UniversalMap;
  x?: number;
  y?: number;
  makeActive?: boolean;
  status?: BoardStatus;
  pendingPrompt?: string;
};

export type PendingGenerate = {
  boardId: string;
  kind: "describe" | "generate";
  lastEvent: GenerateEvent<UniversalMap> | null;
  error: string | null;
};

export type GenerateStreamInput = {
  frameworkId: string;
  text?: string;
  files?: File[];
  urls?: string[];
  title?: string;
  persona?: string;
  fidelityMode?: boolean;
};

type CanvasContextValue = CanvasState & {
  addBoard: (input: AddBoardInput) => Board;
  removeBoard: (id: string) => void;
  duplicateBoard: (id: string) => Board | null;
  updateBoardMap: (id: string, map: UniversalMap) => void;
  updateBoardTitle: (id: string, title: string) => void;
  moveBoard: (id: string, x: number, y: number) => void;
  setBoardSelection: (id: string, selection: UniversalSelection | null) => void;
  setActiveBoardId: (id: string | null) => void;

  /** Multi-project API. */
  createProject: (name?: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;

  /** Multi-canvas API — canvases live inside projects. createCanvas defaults
   *  to the active project; switchCanvas targets any canvas in the active
   *  project. */
  createCanvas: (name?: string, projectId?: string) => Canvas;
  renameCanvas: (canvasId: string, name: string) => void;
  removeCanvas: (canvasId: string) => void;
  switchCanvas: (canvasId: string) => void;

  /** Persist a file as an attachment on the given board. Returns the metadata
   *  entry written to board state (useful if the caller wants to await the
   *  id). The blob itself is stored in IndexedDB. */
  attachFileToBoard: (boardId: string, file: File) => Promise<AttachmentMeta>;
  /** Remove an attachment from both localStorage metadata and IDB bytes. */
  removeAttachment: (boardId: string, attachmentId: string) => Promise<void>;

  /** Kick off a describe call for an existing (pending-describe) board. */
  startDescribe: (
    boardId: string,
    description: string,
    existingIds: string[],
    sources?: { files?: File[]; urls?: string[] }
  ) => Promise<void>;
  /** Kick off a generate stream for an existing (pending-generate) board. */
  startGenerate: (boardId: string, input: GenerateStreamInput) => Promise<void>;
  /** Abort the in-flight generation if any. */
  cancelPending: () => void;

  pending: PendingGenerate | null;
  persistError: null | "quota" | "unknown";
};

const CanvasContext = createContext<CanvasContextValue | null>(null);

function genId(): string {
  return `b-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function genProjectId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function genCanvasId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function makeEmptyCanvas(name: string = "Canvas 1"): Canvas {
  return {
    id: genCanvasId(),
    name,
    createdAt: Date.now(),
    boards: [],
    activeBoardId: null,
  };
}

function makeEmptyProject(name: string = "Untitled project"): Project {
  const canvas = makeEmptyCanvas("Canvas 1");
  return {
    id: genProjectId(),
    name,
    createdAt: Date.now(),
    canvases: [canvas],
    activeCanvasId: canvas.id,
  };
}

function nextOpenX(boards: Board[]): number {
  if (boards.length === 0) return 0;
  let maxRight = 0;
  for (const b of boards) {
    const approxRight = b.x + 900;
    if (approxRight > maxRight) maxRight = approxRight;
  }
  return maxRight + 120;
}

/** Produce a fresh snapshot of the projects array with the given
 *  (project, canvas)'s boards and activeBoardId replaced by the live values.
 *  Used at persist-time and before any switch operation to freeze in-memory
 *  edits back into the tree before we swap to a different canvas or project. */
function freezeBoardsInto(
  projects: Project[],
  projectId: string | null,
  canvasId: string | null,
  boards: Board[],
  activeBoardId: string | null
): Project[] {
  if (!projectId || !canvasId) return projects;
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          canvases: p.canvases.map((c) =>
            c.id === canvasId ? { ...c, boards, activeBoardId } : c
          ),
        }
      : p
  );
}

/** "Recovered" copy of a board list: drops any pending-* states left over
 *  from a prior session back to "ready" (the fetch is long gone by the time
 *  we hydrate) and registers any dynamic framework configs carried on them.
 *
 *  Migrates legacy archetype-shaped boards (created before Universe 3 was
 *  deleted). Those boards stored `map` as a bespoke archetype doc (CartesianDoc,
 *  TableDoc, etc.) which has no `cards` array — rendering through FrameworkGrid
 *  now would crash. Reset such boards' maps to a minimal UniversalMap; the
 *  user can regenerate content. Also strips the dead `archetypeId` field. */
function recoverBoards(boards: Board[]): Board[] {
  for (const b of boards) {
    if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
      registerDynamicFramework(b.customConfig);
    }
  }
  return boards.map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = b as any;
    const hasLegacyArchetype = typeof raw.archetypeId === "string";
    const mapOk =
      b.map &&
      typeof b.map === "object" &&
      Array.isArray(b.map.cards) &&
      Array.isArray(b.map.cols) &&
      Array.isArray(b.map.rows);
    const patched = hasLegacyArchetype || !mapOk;
    if (!patched) {
      return b.status === "pending-describe" || b.status === "pending-generate"
        ? { ...b, status: "ready" as BoardStatus }
        : b;
    }
    const fallbackMap: UniversalMap = mapOk
      ? b.map
      : b.customConfig?.seed ?? {
          id: `${b.id}-empty`,
          title: b.title || "Untitled",
          meta: {},
          cols: [],
          rows: [],
          cards: [],
        };
    // Drop archetypeId and any legacy fields via destructure + exclusion.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { archetypeId: _ax, ...clean } = raw;
    return {
      ...clean,
      map: fallbackMap,
      status:
        b.status === "pending-describe" || b.status === "pending-generate"
          ? ("ready" as BoardStatus)
          : b.status,
    } as Board;
  });
}

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  // Live state of the active canvas within the active project.
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActive] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [persistError, setPersistError] = useState<null | "quota" | "unknown">(null);
  const [pending, setPending] = useState<PendingGenerate | null>(null);
  const pendingAbortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);
  // Mirrors of live state readable inside long-lived callbacks without
  // re-creating them on every edit.
  const boardsRef = useRef<Board[]>(boards);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);
  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);
  const activeCanvasIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeCanvasIdRef.current = activeCanvasId;
  }, [activeCanvasId]);
  const activeBoardIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBoardIdRef.current = activeBoardId;
  }, [activeBoardId]);

  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) registerDynamicFramework(cfg);

    const loaded = loadCanvasState();
    let projectsOut: Project[];
    let activeProj: Project;
    if (loaded.ok && loaded.projects.length > 0) {
      projectsOut = loaded.projects;
      activeProj =
        projectsOut.find((p) => p.id === loaded.activeProjectId) ??
        projectsOut[0];
    } else {
      const first = makeEmptyProject("My project");
      projectsOut = [first];
      activeProj = first;
    }
    // Guarantee every project has at least one canvas — defensive against
    // hand-edited localStorage or partial migrations.
    projectsOut = projectsOut.map((p) =>
      p.canvases.length === 0
        ? {
            ...p,
            canvases: [makeEmptyCanvas("Canvas 1")],
            activeCanvasId: null,
          }
        : p
    );
    // Re-find activeProj in the normalized array so we don't reference the
    // pre-normalized object.
    activeProj =
      projectsOut.find((p) => p.id === activeProj.id) ?? projectsOut[0];
    const activeCanvas =
      activeProj.canvases.find((c) => c.id === activeProj.activeCanvasId) ??
      activeProj.canvases[0];

    const recovered = recoverBoards(activeCanvas.boards);

    setProjects(projectsOut);
    setActiveProjectId(activeProj.id);
    setActiveCanvasId(activeCanvas.id);
    setBoards(recovered);
    setActive(activeCanvas.activeBoardId);
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  // Persist-on-change. Always write live boards back into the active
  // (project, canvas) entry before serializing so on-disk shape mirrors
  // in-memory state.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (persistError) return;
    if (!activeProjectId || !activeCanvasId) return;
    const snapshot = freezeBoardsInto(
      projects,
      activeProjectId,
      activeCanvasId,
      boards,
      activeBoardId
    );
    const result = saveCanvasState(snapshot, activeProjectId);
    if (!result.ok) setPersistError(result.reason);
    setProjects(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, activeBoardId, activeProjectId, activeCanvasId, persistError]);

  const addBoard = useCallback((input: AddBoardInput): Board => {
    const id = genId();
    const board: Board = {
      id,
      frameworkId: input.frameworkId,
      customConfig: input.customConfig,
      title: input.title,
      x: input.x ?? 0,
      y: input.y ?? 0,
      map: input.map,
      selection: null,
      status: input.status ?? "ready",
      pendingPrompt: input.pendingPrompt,
      createdAt: Date.now(),
    };
    if (input.customConfig) {
      if (!isDynamicFramework(input.customConfig.id)) {
        registerDynamicFramework(input.customConfig);
      }
      saveCustomFramework(input.customConfig);
    }
    setBoards((prev) => {
      const placed: Board =
        input.x === undefined && input.y === undefined
          ? { ...board, x: nextOpenX(prev), y: 0 }
          : board;
      return [...prev, placed];
    });
    if (input.makeActive !== false) setActive(id);
    return board;
  }, []);

  const removeBoard = useCallback((id: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== id));
    setActive((curr) => (curr === id ? null : curr));
    void deleteAllForBoard(id).catch(() => {
      /* non-fatal — orphan blobs are harmless, just slightly wasteful */
    });
  }, []);

  const duplicateBoard = useCallback((id: string): Board | null => {
    const src = boards.find((b) => b.id === id);
    if (!src) return null;
    const copy: Board = {
      ...src,
      id: genId(),
      title: `${src.title} copy`,
      x: src.x + 80,
      y: src.y + 80,
      selection: null,
      attachments: undefined,
      createdAt: Date.now(),
    };
    setBoards((prev) => [...prev, copy]);
    setActive(copy.id);
    return copy;
  }, [boards]);

  const attachFileToBoard = useCallback(
    async (boardId: string, file: File): Promise<AttachmentMeta> => {
      const id = genAttachmentId();
      const kind: AttachmentMeta["kind"] = file.type.startsWith("image/")
        ? "image"
        : file.type === "application/pdf" || /\.pdf$/i.test(file.name)
          ? "pdf"
          : "text";
      const meta: AttachmentMeta = {
        id,
        name: file.name,
        kind,
        mediaType: file.type || fallbackMediaType(file.name),
        sizeBytes: file.size,
        addedAt: Date.now(),
      };
      await putAttachment(boardId, id, file);
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, attachments: [...(b.attachments ?? []), meta] }
            : b
        )
      );
      return meta;
    },
    []
  );

  const removeAttachment = useCallback(
    async (boardId: string, attachmentId: string): Promise<void> => {
      await deleteAttachment(boardId, attachmentId).catch(() => {
        /* non-fatal */
      });
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? {
                ...b,
                attachments: (b.attachments ?? []).filter(
                  (a) => a.id !== attachmentId
                ),
              }
            : b
        )
      );
    },
    []
  );

  const updateBoardMap = useCallback((id: string, map: UniversalMap) => {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, map } : b)));
  }, []);

  const updateBoardTitle = useCallback((id: string, title: string) => {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
  }, []);

  const moveBoard = useCallback((id: string, x: number, y: number) => {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, x, y } : b)));
  }, []);

  const setBoardSelection = useCallback(
    (id: string, selection: UniversalSelection | null) => {
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, selection } : b)));
    },
    []
  );

  const setActiveBoardId = useCallback((id: string | null) => {
    setActive(id);
  }, []);

  const cancelPending = useCallback(() => {
    pendingAbortRef.current?.abort();
    pendingAbortRef.current = null;
    setPending(null);
  }, []);

  // Cancel any in-flight stream before leaving a canvas or project — keeping
  // it running against a hidden surface leads to surprising state changes
  // when the user switches back.
  const abortIfPending = useCallback(() => {
    if (pendingAbortRef.current) {
      pendingAbortRef.current.abort();
      pendingAbortRef.current = null;
    }
    setPending(null);
  }, []);

  // ── Canvas management ─────────────────────────────────────────────────────

  const switchCanvas = useCallback((nextCanvasId: string) => {
    const projectId = activeProjectIdRef.current;
    const currentCanvasId = activeCanvasIdRef.current;
    if (!projectId) return;
    if (currentCanvasId === nextCanvasId) return;
    abortIfPending();
    setProjects((prev) => {
      // Freeze live boards into the current canvas before we swap.
      const frozen = freezeBoardsInto(
        prev,
        projectId,
        currentCanvasId,
        boardsRef.current,
        activeBoardIdRef.current
      );
      const project = frozen.find((p) => p.id === projectId);
      const target = project?.canvases.find((c) => c.id === nextCanvasId);
      if (!project || !target) return frozen;
      const recovered = recoverBoards(target.boards);
      setBoards(recovered);
      setActive(target.activeBoardId);
      setActiveCanvasId(nextCanvasId);
      // Also remember the new active canvas on the project itself.
      return frozen.map((p) =>
        p.id === projectId ? { ...p, activeCanvasId: nextCanvasId } : p
      );
    });
  }, [abortIfPending]);

  const createCanvas = useCallback(
    (name?: string, projectId?: string): Canvas => {
      const targetProjectId = projectId ?? activeProjectIdRef.current;
      if (!targetProjectId) {
        throw new Error("createCanvas: no active project");
      }
      const canvas = makeEmptyCanvas(name?.trim() || "Untitled canvas");
      const isActiveProject = targetProjectId === activeProjectIdRef.current;
      abortIfPending();
      setProjects((prev) => {
        // Freeze current canvas first (if we're adding into the active project).
        const frozen = isActiveProject
          ? freezeBoardsInto(
              prev,
              targetProjectId,
              activeCanvasIdRef.current,
              boardsRef.current,
              activeBoardIdRef.current
            )
          : prev;
        return frozen.map((p) =>
          p.id === targetProjectId
            ? {
                ...p,
                canvases: [...p.canvases, canvas],
                activeCanvasId: isActiveProject ? canvas.id : p.activeCanvasId,
              }
            : p
        );
      });
      if (isActiveProject) {
        setBoards([]);
        setActive(null);
        setActiveCanvasId(canvas.id);
      }
      return canvas;
    },
    [abortIfPending]
  );

  const renameCanvas = useCallback((canvasId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        canvases: p.canvases.map((c) =>
          c.id === canvasId ? { ...c, name: trimmed } : c
        ),
      }))
    );
  }, []);

  const removeCanvas = useCallback(
    (canvasId: string) => {
      setProjects((prev) => {
        // Find the owning project so we can delete IDB blobs for its boards.
        const owner = prev.find((p) =>
          p.canvases.some((c) => c.id === canvasId)
        );
        if (!owner) return prev;
        const canvas = owner.canvases.find((c) => c.id === canvasId);
        if (canvas) {
          for (const b of canvas.boards) {
            void deleteAllForBoard(b.id).catch(() => {
              /* non-fatal */
            });
          }
        }
        // Never leave a project with zero canvases — seed an empty one.
        const replacement: Canvas[] =
          owner.canvases.length === 1
            ? [makeEmptyCanvas("Canvas 1")]
            : owner.canvases.filter((c) => c.id !== canvasId);
        const next = prev.map((p) =>
          p.id === owner.id
            ? {
                ...p,
                canvases: replacement,
                activeCanvasId:
                  p.activeCanvasId === canvasId
                    ? replacement[0]?.id ?? null
                    : p.activeCanvasId,
              }
            : p
        );
        // If the removed canvas was live, swap into its replacement.
        if (
          owner.id === activeProjectIdRef.current &&
          canvasId === activeCanvasIdRef.current
        ) {
          abortIfPending();
          const freshActive = replacement[0];
          setBoards(recoverBoards(freshActive.boards));
          setActive(freshActive.activeBoardId);
          setActiveCanvasId(freshActive.id);
        }
        return next;
      });
    },
    [abortIfPending]
  );

  // ── Project management ─────────────────────────────────────────────────────

  const switchProject = useCallback(
    (nextId: string) => {
      const currentId = activeProjectIdRef.current;
      if (currentId === nextId) return;
      abortIfPending();
      setProjects((prev) => {
        const frozen = freezeBoardsInto(
          prev,
          currentId,
          activeCanvasIdRef.current,
          boardsRef.current,
          activeBoardIdRef.current
        );
        const target = frozen.find((p) => p.id === nextId);
        if (!target) return frozen;
        const targetCanvas =
          target.canvases.find((c) => c.id === target.activeCanvasId) ??
          target.canvases[0];
        if (!targetCanvas) return frozen;
        const recovered = recoverBoards(targetCanvas.boards);
        setBoards(recovered);
        setActive(targetCanvas.activeBoardId);
        setActiveProjectId(nextId);
        setActiveCanvasId(targetCanvas.id);
        return frozen;
      });
    },
    [abortIfPending]
  );

  const createProject = useCallback(
    (name?: string): Project => {
      const project = makeEmptyProject(name?.trim() || "Untitled project");
      const firstCanvas = project.canvases[0];
      abortIfPending();
      setProjects((prev) => {
        const frozen = freezeBoardsInto(
          prev,
          activeProjectIdRef.current,
          activeCanvasIdRef.current,
          boardsRef.current,
          activeBoardIdRef.current
        );
        return [...frozen, project];
      });
      setBoards([]);
      setActive(null);
      setActiveProjectId(project.id);
      setActiveCanvasId(firstCanvas.id);
      return project;
    },
    [abortIfPending]
  );

  const renameProject = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
    );
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const project = prev.find((p) => p.id === id);
      if (project) {
        for (const canvas of project.canvases) {
          for (const b of canvas.boards) {
            void deleteAllForBoard(b.id).catch(() => {
              /* non-fatal */
            });
          }
        }
      }
      const remaining = prev.filter((p) => p.id !== id);
      if (activeProjectIdRef.current === id) {
        abortIfPending();
        if (remaining.length === 0) {
          const fresh = makeEmptyProject("My project");
          const firstCanvas = fresh.canvases[0];
          setBoards([]);
          setActive(null);
          setActiveProjectId(fresh.id);
          setActiveCanvasId(firstCanvas.id);
          return [fresh];
        }
        const fallback = remaining[0];
        const fallbackCanvas =
          fallback.canvases.find((c) => c.id === fallback.activeCanvasId) ??
          fallback.canvases[0];
        setBoards(recoverBoards(fallbackCanvas.boards));
        setActive(fallbackCanvas.activeBoardId);
        setActiveProjectId(fallback.id);
        setActiveCanvasId(fallbackCanvas.id);
      }
      return remaining;
    });
  }, [abortIfPending]);

  // ── Streaming actions ───────────────────────────────────────────────────────
  const startDescribe = useCallback(
    async (
      boardId: string,
      description: string,
      existingIds: string[],
      sources?: { files?: File[]; urls?: string[] }
    ) => {
      if (!description.trim()) return;
      setPending({ boardId, kind: "describe", lastEvent: null, error: null });
      const ac = new AbortController();
      pendingAbortRef.current = ac;
      try {
        const persistedFiles = await loadBoardAttachmentsAsFiles(
          boardId,
          boardsRef.current
        );
        const filesAll = dedupeFiles(persistedFiles, sources?.files ?? []);
        const urlsAll = sources?.urls ?? [];
        const hasSources = filesAll.length > 0 || urlsAll.length > 0;

        let res: Response;
        if (hasSources) {
          const fd = new FormData();
          fd.append("description", description.trim());
          fd.append("existingIds", JSON.stringify(existingIds));
          filesAll.forEach((f, i) => fd.append(`file_${i}`, f));
          urlsAll.forEach((u, i) => fd.append(`url_${i}`, u));
          res = await fetch("/api/framework-describe", {
            method: "POST",
            body: fd,
            signal: ac.signal,
          });
        } else {
          res = await fetch("/api/framework-describe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ description: description.trim(), existingIds }),
            signal: ac.signal,
          });
        }
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error ?? `Describe failed (HTTP ${res.status})`);
        }

        const config = data.config as FrameworkConfig;
        const populatedMap = data.populatedMap as UniversalMap;
        if (!isDynamicFramework(config.id)) registerDynamicFramework(config);
        saveCustomFramework(config);
        setBoards((prev) =>
          prev.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  frameworkId: config.id,
                  customConfig: config,
                  title: populatedMap.title || config.label,
                  map: populatedMap,
                  status: "ready",
                  pendingPrompt: undefined,
                }
              : b
          )
        );
        const warnings = Array.isArray(data.warnings)
          ? (data.warnings as unknown[]).filter(
              (w): w is string => typeof w === "string"
            )
          : [];
        if (warnings.length > 0) {
          setPending({
            boardId,
            kind: "describe",
            lastEvent: null,
            error: warnings.join(" · "),
          });
        } else {
          setPending(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setBoards((prev) => prev.filter((b) => b.id !== boardId));
          setActive((curr) => (curr === boardId ? null : curr));
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        setBoards((prev) => prev.filter((b) => b.id !== boardId));
        setActive((curr) => (curr === boardId ? null : curr));
        setPending({ boardId, kind: "describe", lastEvent: null, error: msg });
      } finally {
        pendingAbortRef.current = null;
      }
    },
    []
  );

  const startGenerate = useCallback(
    async (boardId: string, input: GenerateStreamInput) => {
      setPending({ boardId, kind: "generate", lastEvent: null, error: null });
      const ac = new AbortController();
      pendingAbortRef.current = ac;
      try {
        const persistedFiles = await loadBoardAttachmentsAsFiles(
          boardId,
          boardsRef.current
        );
        const allFiles = dedupeFiles(persistedFiles, input.files ?? []);

        const fd = new FormData();
        fd.append("frameworkId", input.frameworkId);
        if (input.text?.trim()) fd.append("text", input.text.trim());
        allFiles.forEach((f, i) => fd.append(`file_${i}`, f));
        (input.urls ?? []).forEach((u, i) => fd.append(`url_${i}`, u));
        if (input.title?.trim()) fd.append("title", input.title.trim());
        if (input.persona?.trim()) fd.append("persona", input.persona.trim());
        fd.append("fidelityMode", input.fidelityMode ? "true" : "false");

        const res = await fetch("/api/generate", {
          method: "POST",
          body: fd,
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          let serverMsg: string | null = null;
          try {
            const data = await res.json();
            if (data && typeof data.error === "string") serverMsg = data.error;
          } catch { /* body wasn't JSON */ }
          throw new Error(serverMsg ?? `Generate failed (HTTP ${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalMap: UniversalMap | null = null;
        let finalConfig: FrameworkConfig | null = null;
        let errMsg: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseFrames<UniversalMap>(buffer);
          buffer = remainder;
          for (const event of events) {
            setPending((prev) =>
              prev && prev.boardId === boardId
                ? { ...prev, lastEvent: event }
                : prev
            );
            if (event.phase === "result") {
              finalMap = event.map;
              // Auto-mode synthesis emits a brand-new FrameworkConfig. Register
              // it as a dynamic framework so the board is editable with the
              // universal op/arrange pipeline.
              if (event.config) finalConfig = event.config;
            } else if (event.phase === "error") {
              errMsg = event.message;
            }
          }
          if (finalMap || errMsg) break;
        }

        if (errMsg) throw new Error(errMsg);
        if (!finalMap) throw new Error("Generation ended without a result");

        if (finalConfig) {
          if (!isDynamicFramework(finalConfig.id)) registerDynamicFramework(finalConfig);
          saveCustomFramework(finalConfig);
        }

        setBoards((prev) =>
          prev.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  map: finalMap!,
                  ...(finalConfig
                    ? {
                        frameworkId: finalConfig.id,
                        customConfig: finalConfig,
                        title:
                          finalMap!.title || finalConfig.label || b.title,
                      }
                    : {
                        title: finalMap!.title || b.title,
                      }),
                  status: "ready",
                }
              : b
          )
        );
        setPending(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setBoards((prev) =>
            prev.map((b) => (b.id === boardId ? { ...b, status: "ready" } : b))
          );
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        setBoards((prev) =>
          prev.map((b) => (b.id === boardId ? { ...b, status: "ready" } : b))
        );
        setPending({ boardId, kind: "generate", lastEvent: null, error: msg });
      } finally {
        pendingAbortRef.current = null;
      }
    },
    []
  );

  const value = useMemo<CanvasContextValue>(
    () => ({
      projects,
      activeProjectId,
      activeCanvasId,
      boards,
      activeBoardId,
      hydrated,
      addBoard,
      removeBoard,
      duplicateBoard,
      updateBoardMap,
      updateBoardTitle,
      moveBoard,
      setBoardSelection,
      setActiveBoardId,
      createProject,
      renameProject,
      deleteProject,
      switchProject,
      createCanvas,
      renameCanvas,
      removeCanvas,
      switchCanvas,
      attachFileToBoard,
      removeAttachment,
      startDescribe,
      startGenerate,
      cancelPending,
      pending,
      persistError,
    }),
    [
      projects,
      activeProjectId,
      activeCanvasId,
      boards,
      activeBoardId,
      hydrated,
      addBoard,
      removeBoard,
      duplicateBoard,
      updateBoardMap,
      updateBoardTitle,
      moveBoard,
      setBoardSelection,
      setActiveBoardId,
      createProject,
      renameProject,
      deleteProject,
      switchProject,
      createCanvas,
      renameCanvas,
      removeCanvas,
      switchCanvas,
      attachFileToBoard,
      removeAttachment,
      startDescribe,
      startGenerate,
      cancelPending,
      pending,
      persistError,
    ]
  );

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error("useCanvas must be used inside <CanvasProvider>");
  return ctx;
}

/** Selector hook for copilot + topbar — returns only the active board. */
export function useActiveBoard(): Board | null {
  const { boards, activeBoardId } = useCanvas();
  return useMemo(
    () => (activeBoardId ? boards.find((b) => b.id === activeBoardId) ?? null : null),
    [boards, activeBoardId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fallbackMediaType(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
  };
  return map[ext] ?? "application/octet-stream";
}

function dedupeFiles(primary: File[], secondary: File[]): File[] {
  const seen = new Set(primary.map((f) => `${f.name}:${f.size}`));
  const out = [...primary];
  for (const f of secondary) {
    const key = `${f.name}:${f.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

async function loadBoardAttachmentsAsFiles(
  boardId: string,
  boards: Board[]
): Promise<File[]> {
  const board = boards.find((b) => b.id === boardId);
  const metas = board?.attachments ?? [];
  if (metas.length === 0) return [];
  const out: File[] = [];
  for (const meta of metas) {
    try {
      const file = await getAttachmentAsFile(boardId, meta.id, meta.name, meta.mediaType);
      if (file) out.push(file);
    } catch {
      /* IDB unavailable or blob missing — skip */
    }
  }
  return out;
}
