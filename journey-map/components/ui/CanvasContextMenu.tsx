"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

/**
 * Unified right-click context menu for every canvas surface (cards, rows,
 * cols, connectors, board headers, empty cells, canvas background).
 *
 * Two paths:
 *   1. Surfaces call `useCanvasContextMenu().open(e, items)` from their own
 *      onContextMenu handler. This is the fast path with a custom menu.
 *   2. Safety net: the provider installs a capture-phase window listener on
 *      `contextmenu`. If the click lands inside `[data-canvas-root]`, we call
 *      preventDefault unconditionally so the OS menu never appears over the
 *      canvas — even if a specific surface forgot to wire a handler.
 */

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      onClick: () => void;
      icon?: LucideIcon;
      destructive?: boolean;
      disabled?: boolean;
      shortcut?: string;
    }
  | { kind: "divider" }
  | { kind: "header"; label: string };

type OpenFn = (
  e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void },
  items: MenuItem[]
) => void;

type Ctx = {
  open: OpenFn;
  close: () => void;
};

const CanvasContextMenuContext = createContext<Ctx | null>(null);

// Set by a browser console toggle: localStorage.setItem("frameworks:ctxmenu-debug","1")
function isDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("frameworks:ctxmenu-debug") === "1";
  } catch {
    return false;
  }
}

export function useCanvasContextMenu(): Ctx {
  const ctx = useContext(CanvasContextMenuContext);
  if (!ctx) {
    // Loud fallback: log once so it's visible in the browser console if a
    // surface tries to open a menu outside the provider tree. Still returns
    // a no-op so the caller doesn't crash.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[CanvasContextMenu] useCanvasContextMenu() called outside provider — right-click will show the native menu on this surface."
      );
    }
    return { open: () => void 0, close: () => void 0 };
  }
  return ctx;
}

export function CanvasContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setState(null), []);

  const open = useCallback<OpenFn>((e, items) => {
    // ALWAYS preventDefault first, even if there are no items — surfaces that
    // call us expect the native menu to be blocked.
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {
      /* ignore — non-cancelable events */
    }
    if (isDebug()) {
      // eslint-disable-next-line no-console
      console.log("[ContextMenu] open", {
        x: e.clientX,
        y: e.clientY,
        items: items?.length ?? 0,
      });
    }
    if (!items || items.length === 0) return;
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);

  // Safety net: block the native context menu anywhere inside the canvas.
  // This fires in capture phase so it runs before any per-component
  // onContextMenu. Per-component handlers still run and can open our menu —
  // this just guarantees the OS menu never leaks through even if wiring is
  // missing on a specific surface.
  useEffect(() => {
    function onGlobalContextMenu(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest?.("[data-canvas-root]")) return;
      // Allow native menu on genuine text inputs so users can still use
      // Copy/Paste on the title input and card textareas.
      if (
        target.closest?.("input,textarea,[contenteditable='true']")
      )
        return;
      ev.preventDefault();
      if (isDebug()) {
        // eslint-disable-next-line no-console
        console.log("[ContextMenu] safety-net blocked native menu for", target);
      }
    }
    window.addEventListener("contextmenu", onGlobalContextMenu, true);
    return () =>
      window.removeEventListener("contextmenu", onGlobalContextMenu, true);
  }, []);

  // Dismiss on outside click / Escape / scroll / resize / blur.
  useEffect(() => {
    if (!state) return;
    function onPointerDown(ev: PointerEvent) {
      const p = panelRef.current;
      if (p && ev.target instanceof Node && p.contains(ev.target)) return;
      close();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    }
    function onWheel() {
      close();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [state, close]);

  const clamped = useClampedPosition(state?.x ?? 0, state?.y ?? 0, panelRef);

  const ctxValue = { open, close };

  return (
    <CanvasContextMenuContext.Provider value={ctxValue}>
      {children}
      {state &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{
              position: "fixed",
              left: clamped.x,
              top: clamped.y,
              zIndex: 10000,
            }}
            className="min-w-[200px] max-w-[280px] rounded-xl bg-white/95 backdrop-blur-md shadow-panel ring-1 ring-border-soft p-1 text-[13px]"
          >
            {state.items.map((item, i) => {
              if ("kind" in item && item.kind === "divider") {
                return (
                  <div key={`d-${i}`} className="my-1 h-px bg-border-soft/70" />
                );
              }
              if ("kind" in item && item.kind === "header") {
                return (
                  <div
                    key={`h-${i}`}
                    className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted px-2 pt-2 pb-1"
                  >
                    {item.label}
                  </div>
                );
              }
              const Icon = item.icon;
              const dest = item.destructive;
              return (
                <button
                  key={`i-${i}-${item.label}`}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    requestAnimationFrame(() => item.onClick());
                  }}
                  className={[
                    "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    dest
                      ? "text-rose-700 hover:bg-rose-50"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/[0.05]",
                  ].join(" ")}
                >
                  {Icon ? (
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut ? (
                    <span className="font-mono text-[10px] tracking-wider text-ink-muted shrink-0">
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </CanvasContextMenuContext.Provider>
  );
}

function useClampedPosition(
  x: number,
  y: number,
  ref: React.RefObject<HTMLDivElement | null>
) {
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setPos({ x, y });
      return;
    }
    const r = el.getBoundingClientRect();
    const margin = 8;
    const maxX = window.innerWidth - r.width - margin;
    const maxY = window.innerHeight - r.height - margin;
    setPos({
      x: Math.max(margin, Math.min(x, maxX)),
      y: Math.max(margin, Math.min(y, maxY)),
    });
  }, [x, y, ref]);
  return pos;
}
