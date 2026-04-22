"use client";

import { useMemo } from "react";
import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { useCanvas } from "@/lib/canvas/context";
import type { AttachmentMeta, Board, Canvas, Project } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// CopilotEmptyState — what Copilot renders when no board is active. Instead
// of generic prompt-engineering "suggestions", this surface shows *actual*
// workspace data: the user's recent boards and the attachments they've
// uploaded. Clicking a row activates that board so the Copilot immediately
// becomes useful with real context.
//
// Design notes:
//   - Reads from `useCanvas()` directly so it can key off the authoritative
//     projects tree without the parent having to wire 5 new props.
//   - Max 4 rows per section to keep the panel scannable.
//   - Attachments show their parent board + project/canvas so the user can
//     remember what a PDF belongs to at a glance.
// ──────────────────────────────────────────────────────────────────────────────

const RECENT_BOARDS_MAX = 4;
const RECENT_ATTACHMENTS_MAX = 4;

type BoardRow = {
  board: Board;
  canvas: Canvas;
  project: Project;
};

type AttachmentRow = {
  attachment: AttachmentMeta;
  board: Board;
  canvas: Canvas;
  project: Project;
};

function collectBoards(projects: Project[]): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const project of projects) {
    for (const canvas of project.canvases) {
      for (const board of canvas.boards) {
        rows.push({ board, canvas, project });
      }
    }
  }
  return rows;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type CopilotEmptyStateProps = {
  /** Optional "Describe a custom framework" entry — wired up to the canvas
   *  page's CustomFrameworkDialog. If omitted, the footer affordance is hidden. */
  onOpenCustomDialog?: () => void;
};

export function CopilotEmptyState({ onOpenCustomDialog }: CopilotEmptyStateProps) {
  const { projects, switchProject, switchCanvas, setActiveBoardId, activeProjectId } =
    useCanvas();

  const allBoards = useMemo(() => collectBoards(projects), [projects]);

  const recentBoards = useMemo(() => {
    return [...allBoards]
      .sort((a, b) => b.board.createdAt - a.board.createdAt)
      .slice(0, RECENT_BOARDS_MAX);
  }, [allBoards]);

  const recentAttachments = useMemo<AttachmentRow[]>(() => {
    const rows: AttachmentRow[] = [];
    for (const row of allBoards) {
      for (const att of row.board.attachments ?? []) {
        rows.push({
          attachment: att,
          board: row.board,
          canvas: row.canvas,
          project: row.project,
        });
      }
    }
    rows.sort((a, b) => b.attachment.addedAt - a.attachment.addedAt);
    return rows.slice(0, RECENT_ATTACHMENTS_MAX);
  }, [allBoards]);

  function openBoard(row: BoardRow | AttachmentRow) {
    if (row.project.id !== activeProjectId) switchProject(row.project.id);
    switchCanvas(row.canvas.id);
    setActiveBoardId(row.board.id);
  }

  const hasAnything = recentBoards.length > 0 || recentAttachments.length > 0;

  return (
    <div className="flex-1 overflow-y-auto chat-scroll px-4 pt-3 pb-4">
      {!hasAnything ? (
        <div className="flex flex-col items-center justify-center pt-8 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-primary/[0.06] text-ink-primary mb-3">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-[14px] font-medium text-ink-primary leading-snug">
            Your Copilot lives here
          </div>
          <div className="text-[12px] text-ink-muted mt-1 leading-snug max-w-[280px]">
            Drop a template from the left rail onto the canvas and the Copilot
            will know what you're editing.
          </div>
          {onOpenCustomDialog && (
            <button
              type="button"
              onClick={onOpenCustomDialog}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-border-soft hover:border-border-medium hover:bg-white px-3 py-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Describe a custom framework
            </button>
          )}
        </div>
      ) : (
        <>
          {recentBoards.length > 0 && (
            <section className="mb-4">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted px-1 pb-1.5">
                Recent boards
              </div>
              <ul className="space-y-0.5">
                {recentBoards.map((row) => (
                  <li key={row.board.id}>
                    <button
                      type="button"
                      onClick={() => openBoard(row)}
                      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-ink-primary/[0.05] transition-colors"
                    >
                      <div className="text-[12.5px] font-medium text-ink-primary truncate">
                        {row.board.title || "Untitled board"}
                      </div>
                      <div className="text-[10.5px] text-ink-muted truncate font-mono">
                        {row.project.name} · {row.canvas.name}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recentAttachments.length > 0 && (
            <section className="mb-4">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted px-1 pb-1.5 inline-flex items-center gap-1.5">
                <Paperclip className="h-3 w-3" />
                Your files
              </div>
              <ul className="space-y-0.5">
                {recentAttachments.map((row) => {
                  const Icon = row.attachment.kind === "image" ? ImageIcon : FileText;
                  return (
                    <li key={`${row.board.id}:${row.attachment.id}`}>
                      <button
                        type="button"
                        onClick={() => openBoard(row)}
                        className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-ink-primary/[0.05] transition-colors flex items-start gap-2"
                      >
                        <Icon className="h-3.5 w-3.5 text-ink-muted shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-ink-primary truncate">
                            {row.attachment.name}
                          </div>
                          <div className="text-[10.5px] text-ink-muted truncate font-mono">
                            {formatBytes(row.attachment.sizeBytes)} ·{" "}
                            {row.board.title || "Untitled board"}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {onOpenCustomDialog && (
            <div className="pt-2 border-t border-border-soft/60">
              <button
                type="button"
                onClick={onOpenCustomDialog}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.04] transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Describe a custom framework
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
