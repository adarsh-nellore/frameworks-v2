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
import type { AttachmentMeta, Board, BoardStatus, CanvasState, Project } from "./types";
import { loadCanvasState, saveCanvasState } from "./storage";
import {
  deleteAllForBoard,
  deleteAttachment,
  genAttachmentId,
  getAttachmentAsFile,
  putAttachment,
} from "./attachments-store";

// ──────────────────────────────────────────────────────────────────────────────
// CanvasContext — state + streaming generation for the multi-board workspace.
//
// Mounted once at app/layout.tsx so state survives navigation between "/" (the
// prompt landing) and "/canvas" (the workspace). The landing calls
// addBoard() + startDescribe()/startGenerate() and navigates immediately —
// the stream keeps running in this provider while the user watches the
// skeleton/overlay on /canvas.
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

  /** Multi-project API — each project is its own whiteboard. */
  createProject: (name?: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;

  /** Persist a file as an attachment on the given board. Returns the metadata
   *  entry written to board state (useful if the caller wants to await the
   *  id). The blob itself is stored in IndexedDB. */
  attachFileToBoard: (boardId: string, file: File) => Promise<AttachmentMeta>;
  /** Remove an attachment from both localStorage metadata and IDB bytes. */
  removeAttachment: (boardId: string, attachmentId: string) => Promise<void>;

  /** Kick off a describe call for an existing (pending-describe) board.
   *  Optional sources are ingested server-side (URLs via Jina, files via the
   *  shared extraction pipeline) and passed to the synthesis prompt. */
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

function makeEmptyProject(name: string = "Untitled project"): Project {
  return {
    id: genProjectId(),
    name,
    createdAt: Date.now(),
    boards: [],
    activeBoardId: null,
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

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  // The active project's boards are surfaced as the root `boards` state — every
  // existing consumer (BoardFrame, Copilot, TopBar, etc.) keeps the same API.
  // Switching projects swaps this state with the other project's boards.
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActive] = useState<string | null>(null);
  // Project registry. Each project stores its OWN boards + activeBoardId; the
  // entry for the currently-active project is treated as the source of truth
  // for that project when switching in/out. While a project is active, the
  // root `boards`/`activeBoardId` state takes precedence for that project.
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [persistError, setPersistError] = useState<null | "quota" | "unknown">(null);
  const [pending, setPending] = useState<PendingGenerate | null>(null);
  const pendingAbortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);
  // Mirror of `boards` readable inside long-lived callbacks (startDescribe /
  // startGenerate) without adding `boards` as a dep and recreating the
  // callback every board edit.
  const boardsRef = useRef<Board[]>(boards);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);
  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) registerDynamicFramework(cfg);

    const loaded = loadCanvasState();
    let projectsOut: Project[];
    let activeId: string;
    if (loaded.ok && loaded.projects.length > 0) {
      projectsOut = loaded.projects;
      activeId = loaded.activeProjectId ?? loaded.projects[0].id;
    } else {
      // Fresh install — seed a single empty project so the app always has one.
      const first = makeEmptyProject("My project");
      projectsOut = [first];
      activeId = first.id;
    }

    // Pick the active project's boards, rehydrate dynamic configs, and repair
    // any pending-* states left over from a prior session (the fetch is long
    // gone, so downgrade to "ready" with whatever seed the board already has).
    const active = projectsOut.find((p) => p.id === activeId) ?? projectsOut[0];
    for (const b of active.boards) {
      if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
        registerDynamicFramework(b.customConfig);
      }
    }
    const recovered: Board[] = active.boards.map((b) =>
      b.status === "pending-describe" || b.status === "pending-generate"
        ? { ...b, status: "ready" as BoardStatus }
        : b
    );

    setProjects(projectsOut);
    setActiveProjectId(active.id);
    setBoards(recovered);
    setActive(active.activeBoardId);
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  // Persist-on-change. We always write the ACTIVE project's boards into its
  // entry in `projects` before serializing — keeps the on-disk shape a pure
  // reflection of in-memory state regardless of which project is open.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (persistError) return;
    if (!activeProjectId) return;
    const snapshot = projects.map((p) =>
      p.id === activeProjectId ? { ...p, boards, activeBoardId } : p
    );
    const result = saveCanvasState(snapshot, activeProjectId);
    if (!result.ok) setPersistError(result.reason);
    // Also mirror the snapshot back into state so in-memory `projects` reflects
    // the latest boards — needed for the switcher UI's board counts.
    setProjects(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, activeBoardId, activeProjectId, persistError]);

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
    // Fire-and-forget: IDB cleanup shouldn't block UI removal.
    void deleteAllForBoard(id).catch(() => {
      /* non-fatal — orphan blobs are harmless, just slightly wasteful */
    });
  }, []);

  const duplicateBoard = useCallback((id: string): Board | null => {
    const src = boards.find((b) => b.id === id);
    if (!src) return null;
    // Drop attachments on duplicate. Copying IDB bytes for every duplicate
    // would balloon storage; the user can re-attach to the copy if needed.
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

  // ── Project management ─────────────────────────────────────────────────────
  //
  // Switching projects swaps the live boards/activeBoardId state. Before the
  // swap, we freeze the current project's state back into the projects array.
  // An in-flight describe/generate is cancelled on switch — keeping the stream
  // running against a hidden project would surface surprising state changes
  // once the user switched back.

  const switchProject = useCallback(
    (nextId: string) => {
      setProjects((prev) => {
        // Freeze current project's live boards back into its entry
        const currentId = activeProjectIdRef.current;
        const frozen = currentId
          ? prev.map((p) =>
              p.id === currentId
                ? { ...p, boards: boardsRef.current, activeBoardId }
                : p
            )
          : prev;
        return frozen;
      });
      // Cancel any in-flight agent stream belonging to the project we're
      // leaving. The abort controller will unwedge the pending board.
      if (pendingAbortRef.current) {
        pendingAbortRef.current.abort();
        pendingAbortRef.current = null;
      }
      setPending(null);
      // Load target project's boards into live state.
      setProjects((prev) => {
        const target = prev.find((p) => p.id === nextId);
        if (!target) return prev;
        // Register any dynamic configs carried by the target project so their
        // framework.Component resolves the moment we render the boards.
        for (const b of target.boards) {
          if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
            registerDynamicFramework(b.customConfig);
          }
        }
        const recovered: Board[] = target.boards.map((b) =>
          b.status === "pending-describe" || b.status === "pending-generate"
            ? { ...b, status: "ready" as BoardStatus }
            : b
        );
        setBoards(recovered);
        setActive(target.activeBoardId);
        setActiveProjectId(nextId);
        return prev;
      });
    },
    [activeBoardId]
  );

  const createProject = useCallback(
    (name?: string): Project => {
      const project = makeEmptyProject(name?.trim() || "Untitled project");
      // Freeze current first so the newly-persisted snapshot includes it with
      // correct boards, then append the new empty project + switch to it.
      setProjects((prev) => {
        const currentId = activeProjectIdRef.current;
        const frozen = currentId
          ? prev.map((p) =>
              p.id === currentId
                ? { ...p, boards: boardsRef.current, activeBoardId }
                : p
            )
          : prev;
        return [...frozen, project];
      });
      // Cancel any in-flight agent stream from the previous project.
      if (pendingAbortRef.current) {
        pendingAbortRef.current.abort();
        pendingAbortRef.current = null;
      }
      setPending(null);
      // Load the new (empty) project as the live one.
      setBoards([]);
      setActive(null);
      setActiveProjectId(project.id);
      return project;
    },
    [activeBoardId]
  );

  const renameProject = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
    );
  }, []);

  const deleteProject = useCallback(
    (id: string) => {
      // Clean up all IDB attachments for every board in the project.
      setProjects((prev) => {
        const project = prev.find((p) => p.id === id);
        if (project) {
          for (const b of project.boards) {
            void deleteAllForBoard(b.id).catch(() => {
              /* non-fatal */
            });
          }
        }
        const next = prev.filter((p) => p.id !== id);
        // If the active project was deleted, switch to the first remaining —
        // or create a new empty "Untitled project" so the user never lands in
        // a state with zero projects.
        if (activeProjectIdRef.current === id) {
          if (pendingAbortRef.current) {
            pendingAbortRef.current.abort();
            pendingAbortRef.current = null;
          }
          setPending(null);
          if (next.length === 0) {
            const fresh = makeEmptyProject("My project");
            setBoards([]);
            setActive(null);
            setActiveProjectId(fresh.id);
            return [fresh];
          }
          const fallback = next[0];
          for (const b of fallback.boards) {
            if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
              registerDynamicFramework(b.customConfig);
            }
          }
          setBoards(
            fallback.boards.map((b) =>
              b.status === "pending-describe" || b.status === "pending-generate"
                ? { ...b, status: "ready" as BoardStatus }
                : b
            )
          );
          setActive(fallback.activeBoardId);
          setActiveProjectId(fallback.id);
        }
        return next;
      });
    },
    []
  );

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
        // Rehydrate any attachments persisted on the board — so if the user
        // attaches first and later re-runs describe, the saved docs feed in.
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
        // Register the synthesized config + persist
        if (!isDynamicFramework(config.id)) registerDynamicFramework(config);
        saveCustomFramework(config);
        // Upgrade the pending board to ready
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
        // Surface populate-stage warnings as a visible error on the canvas.
        // When populate fails silently the framework shell lands but cards are
        // empty — without this the user has no idea why.
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
          // User aborted (e.g. cancelled from UI, or closed the tab).
          // Drop the placeholder board entirely — it has no usable structure
          // and leaving it around produces the "empty, unclickable board"
          // dead-end the user sees when recovery resurrects it post-reload.
          setBoards((prev) => prev.filter((b) => b.id !== boardId));
          setActive((curr) => (curr === boardId ? null : curr));
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        // Same treatment on describe failure — remove the placeholder so the
        // user isn't stranded on an empty journey-map shell.
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
        // Pull already-attached files out of IDB so the copilot's "regenerate"
        // mode reasons through the board's persistent context automatically.
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
          // Non-2xx (e.g. 400 "Provide at least one source") returns JSON, not
          // SSE. Surface the server's actual error message so the user knows
          // what to fix instead of a generic "HTTP 400".
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
            } else if (event.phase === "error") {
              errMsg = event.message;
            }
          }
          if (finalMap || errMsg) break;
        }

        if (errMsg) throw new Error(errMsg);
        if (!finalMap) throw new Error("Generation ended without a result");

        setBoards((prev) =>
          prev.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  map: finalMap!,
                  title: finalMap!.title || b.title,
                  status: "ready",
                }
              : b
          )
        );
        setPending(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Abort also unwedges the board — leave it usable with whatever seed
          // it currently holds instead of stuck at "pending-generate".
          setBoards((prev) =>
            prev.map((b) => (b.id === boardId ? { ...b, status: "ready" } : b))
          );
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        // Release the board from pending-generate so the overlay clears and
        // the user can edit the seed / retry from the copilot. The error toast
        // at the bottom of /canvas reads this pending.error.
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

/** Last-resort content-type guesser for files that arrive without `file.type`
 *  set (some browsers drop it for obscure extensions). Aligned with what the
 *  server-side ingestion extractors understand. */
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

/** Merge two File lists, dropping duplicates keyed by name + size. Guards
 *  against the momentary race where `attachFileToBoard` has committed to IDB
 *  but React hasn't yet propagated the `boards` state update into boardsRef,
 *  so the caller also re-passes the fresh files. */
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

/** Reconstruct File objects for every attachment a board has persisted. Used
 *  on each describe/generate call so the agent always reasons through the
 *  full board context — not just freshly-added files. Failures on a single
 *  attachment (e.g. blob purged from IDB) degrade gracefully: skip it. */
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
