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
import type { Board, CanvasState } from "./types";
import { loadCanvasState, saveCanvasState } from "./storage";

// ──────────────────────────────────────────────────────────────────────────────
// CanvasContext — the single source of truth for the multi-board workspace.
//
// Mounted once at the root (app/layout.tsx) so state survives route changes
// between "/" (landing) and "/canvas" (workspace). A prompt submitted on the
// landing page kicks off a board via addBoard(), then router.push("/canvas")
// arrives with that board already in the context — no sessionStorage handoff.
//
// Hydration order matters: custom FrameworkConfigs must be re-registered into
// the dynamic registry BEFORE boards that reference those ids mount, otherwise
// BoardFrame → getFramework(board.frameworkId) throws. We do both in the same
// initial effect, custom frameworks first.
// ──────────────────────────────────────────────────────────────────────────────

type AddBoardInput = {
  frameworkId: string;
  customConfig?: FrameworkConfig;
  title: string;
  map: UniversalMap;
  x?: number;
  y?: number;
  makeActive?: boolean;
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
  /** Quota-exceeded flag — set to true the first time we can't persist. UI can
   *  show a toast and stop nagging the user. */
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
    // We don't track width on a Board yet (boards auto-size to content). This
    // is a rough placement hint only; the user can drag boards later (Phase 4).
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
  // Guard against persisting before hydration — would clobber stored state.
  const hydratedRef = useRef(false);

  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) registerDynamicFramework(cfg);

    const loaded = loadCanvasState();
    if (loaded.ok) {
      // Register any custom configs carried on the stored boards too — belt-and-
      // braces in case saveCustomFramework wasn't called when a board was made.
      for (const b of loaded.boards) {
        if (b.customConfig && !isDynamicFramework(b.customConfig.id)) {
          registerDynamicFramework(b.customConfig);
        }
      }
      setBoards(loaded.boards);
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
      createdAt: Date.now(),
    };
    // Ensure the dynamic registry has this custom framework so the renderer
    // can resolve it immediately after we set state.
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

/** Selector hook for copilot + topbar — returns only the active board.
 *  Still triggers a re-render when any board in the list updates; a full
 *  useSyncExternalStore migration is follow-up work if that becomes a problem. */
export function useActiveBoard(): Board | null {
  const { boards, activeBoardId } = useCanvas();
  return useMemo(
    () => (activeBoardId ? boards.find((b) => b.id === activeBoardId) ?? null : null),
    [boards, activeBoardId]
  );
}
