"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCanvas } from "@/lib/canvas/context";
import type { Board, Canvas, Project } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// WorkspaceMenu — single top-left floating panel that replaces the old
// ProjectsSwitcher (projects pill) and BoardsPanel (boards list) which used to
// overlap at different z-indices. One component, one z-layer.
//
// Hierarchy: Project → Canvas → Board. Projects collapse to show/hide their
// canvases; canvases collapse to show/hide their boards. Each row has its own
// hover actions (rename / delete / +).
// ──────────────────────────────────────────────────────────────────────────────

type RenameTarget = { kind: "project" | "canvas"; id: string } | null;

export type WorkspaceMenuProps = {
  pendingBoardId: string | null;
  /** Fires after a board row is activated. Used by the landing page to
   *  navigate into /canvas once the user picks a specific board to open. */
  onAfterBoardSelect?: (boardId: string) => void;
};

export function WorkspaceMenu({
  pendingBoardId,
  onAfterBoardSelect,
}: WorkspaceMenuProps) {
  const {
    projects,
    activeProjectId,
    activeCanvasId,
    activeBoardId,
    boards,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
    createCanvas,
    renameCanvas,
    removeCanvas,
    switchCanvas,
    setActiveBoardId,
    removeBoard,
  } = useCanvas();

  const [collapsed, setCollapsed] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : [])
  );
  const [expandedCanvases, setExpandedCanvases] = useState<Set<string>>(
    () => new Set(activeCanvasId ? [activeCanvasId] : [])
  );
  const [rename, setRename] = useState<RenameTarget>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Keep the active project/canvas visible when they change (e.g. after a
  // landing-page generation creates a new canvas and switches to it).
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects((prev) => {
        if (prev.has(activeProjectId)) return prev;
        const next = new Set(prev);
        next.add(activeProjectId);
        return next;
      });
    }
    if (activeCanvasId) {
      setExpandedCanvases((prev) => {
        if (prev.has(activeCanvasId)) return prev;
        const next = new Set(prev);
        next.add(activeCanvasId);
        return next;
      });
    }
  }, [activeProjectId, activeCanvasId]);

  useEffect(() => {
    if (rename) renameInputRef.current?.focus();
  }, [rename]);

  function toggleProject(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCanvas(id: string) {
    setExpandedCanvases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRenameProject(p: Project) {
    setRename({ kind: "project", id: p.id });
    setRenameDraft(p.name);
  }

  function startRenameCanvas(c: Canvas) {
    setRename({ kind: "canvas", id: c.id });
    setRenameDraft(c.name);
  }

  function commitRename() {
    if (!rename) return;
    const value = renameDraft.trim();
    if (value) {
      if (rename.kind === "project") renameProject(rename.id, value);
      else renameCanvas(rename.id, value);
    }
    setRename(null);
  }

  function handleNewProject() {
    const name = window.prompt("Project name", "Untitled project");
    if (name === null) return;
    createProject(name || "Untitled project");
  }

  function handleNewCanvas(projectId: string) {
    const name = window.prompt("Canvas name", "Untitled canvas");
    if (name === null) return;
    createCanvas(name || "Untitled canvas", projectId);
  }

  function handleDeleteProject(p: Project) {
    if (projects.length <= 1) return;
    const ok = window.confirm(
      `Delete "${p.name}"? All canvases and boards inside it will be removed. This cannot be undone.`
    );
    if (!ok) return;
    deleteProject(p.id);
  }

  function handleDeleteCanvas(c: Canvas, ownerProject: Project) {
    const lastCanvas = ownerProject.canvases.length <= 1;
    const msg = lastCanvas
      ? `Clear "${c.name}"? Its boards will be removed and a fresh empty canvas will replace it. This cannot be undone.`
      : `Delete "${c.name}"? Its boards will be removed. This cannot be undone.`;
    const ok = window.confirm(msg);
    if (!ok) return;
    removeCanvas(c.id);
  }

  function handleDeleteBoard(b: Board) {
    const ok = window.confirm(`Delete board "${b.title || "Untitled"}"? This cannot be undone.`);
    if (!ok) return;
    removeBoard(b.id);
  }

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  if (collapsed) {
    return (
      <div data-floating className="fixed top-3 left-4 z-40">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="glass-strong rounded-full h-8 px-3 inline-flex items-center gap-1.5 text-ink-muted hover:text-ink-primary transition-colors"
          aria-label="Open workspace menu"
          title="Open workspace menu"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            {activeProject?.name ?? "Workspace"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-floating
      className="fixed top-3 left-4 z-40 w-[300px] glass-strong rounded-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
          Workspace
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleNewProject}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] transition-colors"
            aria-label="New project"
            title="New project"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] transition-colors"
            aria-label="Collapse"
            title="Collapse"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto chat-scroll px-1 pb-1.5 space-y-0.5">
        {projects.map((p) => {
          const isActiveProject = p.id === activeProjectId;
          const expanded = expandedProjects.has(p.id);
          const isRenamingProject =
            rename?.kind === "project" && rename.id === p.id;
          return (
            <div key={p.id} className="rounded-lg">
              <div
                className={[
                  "group flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
                  isActiveProject
                    ? "bg-ink-primary/[0.05]"
                    : "hover:bg-ink-primary/[0.04]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className="h-5 w-5 grid place-items-center shrink-0 text-ink-muted hover:text-ink-primary"
                  aria-label={expanded ? "Collapse project" : "Expand project"}
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                <FolderOpen
                  className={[
                    "h-3.5 w-3.5 shrink-0",
                    isActiveProject ? "text-ink-primary" : "text-ink-muted",
                  ].join(" ")}
                />
                {isRenamingProject ? (
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === "Escape") {
                        setRename(null);
                      }
                    }}
                    className="flex-1 min-w-0 bg-white rounded-md border border-ink-primary px-1.5 py-0.5 text-[12.5px] text-ink-primary outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActiveProject) switchProject(p.id);
                      if (!expanded) toggleProject(p.id);
                    }}
                    onDoubleClick={() => startRenameProject(p)}
                    className="flex-1 min-w-0 text-left text-[12.5px] font-medium text-ink-primary truncate"
                    title={p.name}
                  >
                    {p.name}
                  </button>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNewCanvas(p.id);
                    }}
                    className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
                    title="New canvas in this project"
                    aria-label="New canvas"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenameProject(p);
                    }}
                    className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
                    title="Rename project"
                    aria-label="Rename project"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(p);
                    }}
                    disabled={projects.length <= 1}
                    className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      projects.length <= 1
                        ? "At least one project is required"
                        : "Delete project"
                    }
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="pl-3">
                  {p.canvases.map((c) => {
                    // When the project is active, source boards from live
                    // state so pending-spinners and renames render instantly.
                    const canvasBoards =
                      isActiveProject && c.id === activeCanvasId ? boards : c.boards;
                    const isActiveCanvas =
                      isActiveProject && c.id === activeCanvasId;
                    const canvasExpanded = expandedCanvases.has(c.id);
                    const isRenamingCanvas =
                      rename?.kind === "canvas" && rename.id === c.id;
                    return (
                      <div key={c.id} className="rounded-lg">
                        <div
                          className={[
                            "group flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
                            isActiveCanvas
                              ? "bg-[rgb(var(--accent))]/[0.10] ring-1 ring-[rgb(var(--accent))]/25"
                              : "hover:bg-ink-primary/[0.04]",
                          ].join(" ")}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCanvas(c.id)}
                            className="h-5 w-5 grid place-items-center shrink-0 text-ink-muted hover:text-ink-primary"
                            aria-label={
                              canvasExpanded ? "Collapse canvas" : "Expand canvas"
                            }
                          >
                            {canvasExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </button>
                          <Layers
                            className={[
                              "h-3.5 w-3.5 shrink-0",
                              isActiveCanvas
                                ? "text-[rgb(var(--accent))]"
                                : "text-ink-muted",
                            ].join(" ")}
                          />
                          {isRenamingCanvas ? (
                            <input
                              ref={renameInputRef}
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitRename();
                                } else if (e.key === "Escape") {
                                  setRename(null);
                                }
                              }}
                              className="flex-1 min-w-0 bg-white rounded-md border border-ink-primary px-1.5 py-0.5 text-[12px] text-ink-primary outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isActiveProject) {
                                  switchProject(p.id);
                                  switchCanvas(c.id);
                                } else if (!isActiveCanvas) {
                                  switchCanvas(c.id);
                                }
                                if (!canvasExpanded) toggleCanvas(c.id);
                              }}
                              onDoubleClick={() => startRenameCanvas(c)}
                              className="flex-1 min-w-0 text-left text-[12px] text-ink-primary truncate"
                              title={c.name}
                            >
                              {c.name}
                              <span className="ml-1.5 text-[10px] text-ink-muted font-mono tabular-nums">
                                {canvasBoards.length}
                              </span>
                            </button>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startRenameCanvas(c);
                              }}
                              className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
                              title="Rename canvas"
                              aria-label="Rename canvas"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCanvas(c, p);
                              }}
                              className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-rose-600 hover:bg-rose-50"
                              title="Delete canvas"
                              aria-label="Delete canvas"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {canvasExpanded && (
                          <div className="pl-4 space-y-0.5">
                            {canvasBoards.length === 0 && (
                              <div className="px-2 py-1 text-[11px] text-ink-muted italic">
                                No boards yet
                              </div>
                            )}
                            {canvasBoards.map((b) => {
                              const isActive =
                                isActiveCanvas && b.id === activeBoardId;
                              const isPending =
                                pendingBoardId === b.id || b.status !== "ready";
                              return (
                                <div
                                  key={b.id}
                                  className={[
                                    "group flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors",
                                    isActive
                                      ? "bg-[rgb(var(--accent))]/[0.10] text-ink-primary ring-1 ring-[rgb(var(--accent))]/30"
                                      : "text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/[0.04]",
                                  ].join(" ")}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!isActiveProject) switchProject(p.id);
                                      if (!isActiveCanvas) switchCanvas(c.id);
                                      setActiveBoardId(b.id);
                                      onAfterBoardSelect?.(b.id);
                                    }}
                                    className="flex-1 min-w-0 text-left inline-flex items-center gap-2"
                                  >
                                    <span
                                      className={[
                                        "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                                        isActive
                                          ? "bg-[rgb(var(--accent))]"
                                          : "bg-ink-muted/40",
                                      ].join(" ")}
                                    />
                                    <span
                                      className="truncate text-[12px] font-medium flex-1 min-w-0"
                                      title={b.title}
                                    >
                                      {b.title || "Untitled board"}
                                    </span>
                                    {isPending && (
                                      <Loader2 className="h-3 w-3 text-ink-muted shrink-0 animate-spin" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteBoard(b);
                                    }}
                                    className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    title="Delete board"
                                    aria-label="Delete board"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
