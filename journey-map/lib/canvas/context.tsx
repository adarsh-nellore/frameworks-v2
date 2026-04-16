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
import type { Board, BoardStatus, CanvasState } from "./types";
import { loadCanvasState, saveCanvasState } from "./storage";

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
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActive] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [persistError, setPersistError] = useState<null | "quota" | "unknown">(null);
  const [pending, setPending] = useState<PendingGenerate | null>(null);
  const pendingAbortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) registerDynamicFramework(cfg);

    const loaded = loadCanvasState();
    if (loaded.ok) {
      for (const b of loaded.boards) {
        if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
          registerDynamicFramework(b.customConfig);
        }
      }
      // Any pending boards carried over from a prior session are abandoned —
      // the fetch is long gone, so downgrade them to ready with whatever seed
      // they had. (User can start a new describe/generate if desired.)
      const recovered = loaded.boards.map((b) =>
        b.status === "pending-describe" || b.status === "pending-generate"
          ? { ...b, status: "ready" as BoardStatus }
          : b
      );
      setBoards(recovered);
      setActive(loaded.activeBoardId);
    }
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (persistError) return;
    const result = saveCanvasState(boards, activeBoardId);
    if (!result.ok) setPersistError(result.reason);
  }, [boards, activeBoardId, persistError]);

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
      createdAt: Date.now(),
    };
    setBoards((prev) => [...prev, copy]);
    setActive(copy.id);
    return copy;
  }, [boards]);

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
        const hasSources =
          (sources?.files && sources.files.length > 0) ||
          (sources?.urls && sources.urls.length > 0);

        let res: Response;
        if (hasSources) {
          const fd = new FormData();
          fd.append("description", description.trim());
          fd.append("existingIds", JSON.stringify(existingIds));
          (sources?.files ?? []).forEach((f, i) => fd.append(`file_${i}`, f));
          (sources?.urls ?? []).forEach((u, i) => fd.append(`url_${i}`, u));
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
        setPending(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
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
        const fd = new FormData();
        fd.append("frameworkId", input.frameworkId);
        if (input.text?.trim()) fd.append("text", input.text.trim());
        (input.files ?? []).forEach((f, i) => fd.append(`file_${i}`, f));
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
          throw new Error(`Generate failed (HTTP ${res.status})`);
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
          setPending(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Unknown error";
        setPending({ boardId, kind: "generate", lastEvent: null, error: msg });
      } finally {
        pendingAbortRef.current = null;
      }
    },
    []
  );

  const value = useMemo<CanvasContextValue>(
    () => ({
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
      startDescribe,
      startGenerate,
      cancelPending,
      pending,
      persistError,
    }),
    [
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
