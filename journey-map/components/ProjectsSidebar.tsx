"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  LayoutGrid,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCanvas } from "@/lib/canvas/context";
import type { Project } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// ProjectsSidebar — left rail for the landing page. One-row-per-project view
// of the workspace with search + delete/rename affordances, grouped by
// recency. Clicking a project opens it: switches active project + loads its
// most recent canvas + most recent board, then routes into /canvas.
//
// This replaces the earlier RecentPanel (board-level recency) and the full
// project tree on landing. The full tree still lives on /projects for power
// management; this sidebar is the "at-a-glance, keep working" surface.
// ──────────────────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 300;

type Group = {
  label: string;
  projects: Project[];
};

/** Last-activity timestamp for a project: the newest createdAt across any
 *  board in any canvas. Falls back to the project's own createdAt when empty
 *  so blank projects still appear in the list with a sensible date. */
function projectLastActivity(p: Project): number {
  let latest = p.createdAt;
  for (const c of p.canvases) {
    for (const b of c.boards) {
      if (b.createdAt > latest) latest = b.createdAt;
    }
  }
  return latest;
}

function groupByRecency(projects: Project[]): Group[] {
  const now = Date.now();
  const d7 = 7 * 24 * 60 * 60 * 1000;
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const sorted = [...projects].sort(
    (a, b) => projectLastActivity(b) - projectLastActivity(a)
  );
  const buckets: Record<string, Project[]> = {
    "Last 7 days": [],
    "Last 30 days": [],
    Older: [],
  };
  for (const p of sorted) {
    const age = now - projectLastActivity(p);
    if (age <= d7) buckets["Last 7 days"].push(p);
    else if (age <= d30) buckets["Last 30 days"].push(p);
    else buckets.Older.push(p);
  }
  return (["Last 7 days", "Last 30 days", "Older"] as const)
    .map((label) => ({ label, projects: buckets[label] }))
    .filter((g) => g.projects.length > 0);
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.floor(diff / min))}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  // Older → show a compact date. Includes the year only when it's not the
  // current one, matching the Stitch-style "Apr 15, 2026" treatment.
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

export function ProjectsSidebar() {
  const router = useRouter();
  const {
    projects,
    activeProjectId,
    switchProject,
    switchCanvas,
    setActiveBoardId,
    renameProject,
    deleteProject,
  } = useCanvas();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.trim().toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const groups = useMemo(() => groupByRecency(filtered), [filtered]);

  function openProject(p: Project) {
    if (p.id !== activeProjectId) switchProject(p.id);
    const canvas =
      p.canvases.find((c) => c.id === p.activeCanvasId) ?? p.canvases[0];
    if (!canvas) {
      router.push("/canvas");
      return;
    }
    switchCanvas(canvas.id);
    const board =
      canvas.boards.find((b) => b.id === canvas.activeBoardId) ??
      canvas.boards[canvas.boards.length - 1];
    if (board) setActiveBoardId(board.id);
    router.push("/canvas");
  }

  function handleRename(p: Project) {
    setRenamingId(p.id);
    setRenameDraft(p.name);
  }

  function commitRename() {
    if (renamingId && renameDraft.trim()) {
      renameProject(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  }

  function handleDelete(p: Project) {
    if (projects.length <= 1) return;
    const ok = window.confirm(
      `Delete "${p.name}"? All canvases and boards inside it will be removed. This cannot be undone.`
    );
    if (!ok) return;
    deleteProject(p.id);
  }

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-30 glass border-r border-border-soft flex flex-col"
      style={{ width: SIDEBAR_WIDTH }}
      aria-label="Projects sidebar"
    >
      {/* Brand header — same position as the Stitch "Stitch BETA" mark so the
          sidebar owns the top-left corner of the page. */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="font-semibold text-[15px] text-ink-primary tracking-tight">
          Frameworks
        </span>
      </div>

      {/* Tab — only "My Projects"; no "Shared with me" */}
      <div className="px-3 pb-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-ink-primary/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-ink-primary">
          <LayoutGrid className="h-3.5 w-3.5" />
          My Projects
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            className="w-full rounded-lg bg-white/70 border border-border-soft focus:border-ink-primary focus:bg-white pl-8 pr-3 py-1.5 text-[12.5px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto chat-scroll px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-ink-muted italic">
            {query.trim() ? "No projects match." : "No projects yet."}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 pt-2 pb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.projects.map((p) => {
                  const isActive = p.id === activeProjectId;
                  const isRenaming = renamingId === p.id;
                  const totalBoards = p.canvases.reduce(
                    (acc, c) => acc + c.boards.length,
                    0
                  );
                  const lastAt = projectLastActivity(p);
                  return (
                    <li
                      key={p.id}
                      className={[
                        "group rounded-lg transition-colors",
                        isActive ? "bg-ink-primary/[0.05]" : "hover:bg-ink-primary/[0.04]",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <FolderOpen
                          className={[
                            "h-4 w-4 shrink-0",
                            isActive ? "text-ink-primary" : "text-ink-muted",
                          ].join(" ")}
                        />
                        {isRenaming ? (
                          <input
                            autoFocus
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
                            className="flex-1 min-w-0 bg-white rounded-md border border-ink-primary px-1.5 py-0.5 text-[12.5px] text-ink-primary outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openProject(p)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="text-[12.5px] font-medium text-ink-primary truncate">
                              {p.name}
                            </div>
                            <div className="text-[10.5px] text-ink-muted font-mono tabular-nums truncate">
                              {formatRelative(lastAt)} · {totalBoards}{" "}
                              {totalBoards === 1 ? "board" : "boards"}
                            </div>
                          </button>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRename(p);
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
                              handleDelete(p);
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
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export const PROJECTS_SIDEBAR_WIDTH = SIDEBAR_WIDTH;
