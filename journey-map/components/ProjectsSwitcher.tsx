"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCanvas } from "@/lib/canvas/context";

/**
 * Top-left floating pill that shows the active project name and, on click,
 * reveals a dropdown with:
 *   - every existing project (jump by clicking)
 *   - "New project" to create an empty whiteboard
 *   - inline rename / delete on each row
 *
 * The user can always have many projects; each one carries its own set of
 * boards, selection, and pan-state. Kept deliberately small — this is chrome,
 * not a page.
 */
export function ProjectsSwitcher() {
  const {
    projects,
    activeProjectId,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
  } = useCanvas();
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const active = projects.find((p) => p.id === activeProjectId) ?? null;

  function startRename(id: string, current: string) {
    setRenamingId(id);
    setRenameDraft(current);
  }
  function commitRename() {
    if (renamingId) renameProject(renamingId, renameDraft.trim() || "Untitled project");
    setRenamingId(null);
  }
  function handleDelete(id: string, name: string) {
    const confirmed = window.confirm(
      `Delete "${name}"? Its boards will be removed. This cannot be undone.`
    );
    if (!confirmed) return;
    deleteProject(id);
    setOpen(false);
    setRenamingId(null);
  }
  function handleNew() {
    const name = window.prompt("Project name", "Untitled project");
    if (name === null) return;
    createProject(name);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      data-floating
      className="fixed top-3 left-4 z-40"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "glass-strong rounded-full inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5",
          "text-[12px] font-medium text-ink-primary hover:bg-white/90 transition-colors",
          "max-w-[280px]",
        ].join(" ")}
      >
        <FolderOpen className="h-3.5 w-3.5 text-ink-muted shrink-0" />
        <span className="truncate">
          {active?.name ?? "No project"}
        </span>
        <ChevronDown
          className={[
            "h-3 w-3 text-ink-muted shrink-0 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div
          className="absolute top-10 left-0 w-[300px] rounded-2xl bg-white/95 backdrop-blur-md shadow-panel ring-1 ring-border-soft p-1.5 animate-in"
        >
          <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted px-2 pt-1.5 pb-1">
            Projects
          </div>
          <div className="max-h-[320px] overflow-y-auto chat-scroll flex flex-col gap-0.5 pr-0.5">
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              const isRenaming = renamingId === p.id;
              return (
                <div
                  key={p.id}
                  className={[
                    "group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors",
                    isActive
                      ? "bg-ink-primary/[0.05]"
                      : "hover:bg-ink-primary/[0.04]",
                  ].join(" ")}
                >
                  <Check
                    className={[
                      "h-3.5 w-3.5 shrink-0",
                      isActive ? "text-ink-primary" : "text-transparent",
                    ].join(" ")}
                  />
                  {isRenaming ? (
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
                          setRenamingId(null);
                        }
                      }}
                      className="flex-1 min-w-0 bg-white rounded-md border border-ink-primary px-2 py-0.5 text-[12.5px] text-ink-primary outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isActive) switchProject(p.id);
                        setOpen(false);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-[13px] text-ink-primary truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-ink-muted font-mono tabular-nums">
                        {p.boards.length} board
                        {p.boards.length === 1 ? "" : "s"}
                      </div>
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(p.id, p.name);
                      }}
                      className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
                      title="Rename"
                      aria-label="Rename project"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id, p.name);
                      }}
                      disabled={projects.length <= 1}
                      className="h-6 w-6 grid place-items-center rounded-md text-ink-muted hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        projects.length <= 1
                          ? "At least one project is required"
                          : "Delete"
                      }
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border-soft/70 my-1" />

          <button
            type="button"
            onClick={handleNew}
            className="w-full inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-primary hover:bg-ink-primary/[0.05] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        </div>
      )}
    </div>
  );
}
