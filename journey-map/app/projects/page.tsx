"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, FolderOpen, Layers, Plus, Sparkles } from "lucide-react";
import { useCanvas } from "@/lib/canvas/context";
import { WorkspaceMenu } from "@/components/WorkspaceMenu";
import type { Board } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// Projects — dedicated workspace-management page. The Project → Canvas →
// Board tree is the primary content here (not a corner widget). Users come
// here to create/rename/delete projects and canvases, or to jump into any
// board across their entire workspace.
// ──────────────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, activeProjectId, switchProject, switchCanvas, setActiveBoardId } =
    useCanvas();

  // Board count across the full workspace — fed into the header summary so
  // the user can see the scale of what they've built at a glance.
  const totals = useMemo(() => {
    let canvases = 0;
    let boards = 0;
    for (const p of projects) {
      canvases += p.canvases.length;
      for (const c of p.canvases) boards += c.boards.length;
    }
    return { projects: projects.length, canvases, boards };
  }, [projects]);

  function openBoard(projectId: string, canvasId: string, board: Board) {
    if (projectId !== activeProjectId) switchProject(projectId);
    switchCanvas(canvasId);
    setActiveBoardId(board.id);
    router.push("/canvas");
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <div className="h-full overflow-y-auto chat-scroll">
        <div className="min-h-full flex flex-col items-center px-6 pt-16 pb-16">
          <div className="w-full max-w-[960px]">
            {/* Header — back to landing + title + create actions */}
            <div className="flex items-center justify-between gap-3 mb-6">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Link>
              <div className="flex items-center gap-2">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-primary text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="font-semibold text-[14px] text-ink-primary tracking-tight">
                  Projects
                </span>
              </div>
              <div className="w-[62px]" aria-hidden />
            </div>

            <div className="mb-5">
              <h1 className="text-[26px] font-semibold text-ink-primary leading-tight">
                Your workspace
              </h1>
              <p className="text-[13px] text-ink-muted mt-1 leading-snug">
                {totals.projects} {totals.projects === 1 ? "project" : "projects"} ·{" "}
                {totals.canvases} {totals.canvases === 1 ? "canvas" : "canvases"} ·{" "}
                {totals.boards} {totals.boards === 1 ? "board" : "boards"}
              </p>
            </div>

            {/* Two-column layout: tree on the left, grid of project cards on
                the right. The tree (WorkspaceMenu) keeps its own positioning
                CSS so we render it as a fixed top-left panel and let the grid
                consume the rest of the page. */}
            <WorkspaceMenu
              pendingBoardId={null}
              onAfterBoardSelect={() => router.push("/canvas")}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const projectBoards = p.canvases.reduce(
                  (acc, c) => acc + c.boards.length,
                  0
                );
                return (
                  <div
                    key={p.id}
                    className="glass rounded-2xl p-4 flex flex-col gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (p.id !== activeProjectId) switchProject(p.id);
                      }}
                      className="flex items-start gap-2.5 text-left"
                    >
                      <div className="shrink-0 inline-flex items-center justify-center rounded-lg h-8 w-8 bg-ink-primary/[0.06] text-ink-primary">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink-primary text-[14px] truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-ink-muted font-mono tabular-nums mt-0.5">
                          {p.canvases.length}{" "}
                          {p.canvases.length === 1 ? "canvas" : "canvases"} ·{" "}
                          {projectBoards} {projectBoards === 1 ? "board" : "boards"}
                        </div>
                      </div>
                    </button>
                    <div className="space-y-1 pl-1">
                      {p.canvases.length === 0 && (
                        <div className="text-[11px] text-ink-muted italic">
                          No canvases yet
                        </div>
                      )}
                      {p.canvases.slice(0, 4).map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-1.5 text-[12px] text-ink-secondary"
                        >
                          <Layers className="h-3 w-3 text-ink-muted shrink-0" />
                          <button
                            type="button"
                            onClick={() => {
                              if (p.id !== activeProjectId) switchProject(p.id);
                              switchCanvas(c.id);
                              router.push("/canvas");
                            }}
                            className="flex-1 min-w-0 text-left truncate hover:text-ink-primary"
                            title={c.name}
                          >
                            {c.name}
                          </button>
                          <span className="font-mono tabular-nums text-[10px] text-ink-muted shrink-0">
                            {c.boards.length}
                          </span>
                        </div>
                      ))}
                      {p.canvases.length > 4 && (
                        <div className="text-[10px] text-ink-muted font-mono pt-0.5">
                          +{p.canvases.length - 4} more
                        </div>
                      )}
                    </div>
                    {p.canvases.length > 0 && p.canvases[0].boards.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstCanvas = p.canvases[0];
                          openBoard(p.id, firstCanvas.id, firstCanvas.boards[0]);
                        }}
                        className="mt-auto text-[11px] text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 self-start"
                      >
                        Open most recent board →
                      </button>
                    )}
                  </div>
                );
              })}

              {/* New project tile — calls into the provider's createProject.
                  We don't have an inline name editor here; the WorkspaceMenu
                  already offers that flow, so the card is a shortcut that
                  focuses the tree where the user types the new name. */}
              <Link
                href="/"
                className="glass rounded-2xl p-4 flex flex-col items-center justify-center gap-2 border border-dashed border-border-medium text-ink-muted hover:text-ink-primary hover:border-ink-primary/40 transition-colors min-h-[140px]"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[12px] font-medium">Start from prompt</span>
                <span className="text-[10px] text-ink-muted text-center">
                  Describe something to create a new canvas
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
