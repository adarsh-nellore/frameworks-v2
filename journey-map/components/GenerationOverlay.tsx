"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Loader2, X } from "lucide-react";
import type { GenerateEvent } from "@/lib/pipeline/events";

type Props = {
  active: boolean;
  progress: GenerateEvent | null;
  onCancel?: () => void;
  /** Human-readable framework label, e.g. "JTBD Canvas". */
  frameworkLabel?: string;
};

type Step = {
  phase: "ingesting" | "subject_id" | "extracting" | "synthesizing" | "critiquing" | "revising";
  label: string;
};

function buildSchedule_label(frameworkLabel: string): Step[] {
  return [
    { phase: "ingesting", label: "Reading sources" },
    { phase: "subject_id", label: "Identifying subject and topic" },
    { phase: "extracting", label: "Extracting atoms from each source" },
    { phase: "synthesizing", label: `Structuring the ${frameworkLabel.toLowerCase()}` },
    { phase: "critiquing", label: "Reviewing for fidelity" },
    { phase: "revising", label: "Revising for higher fidelity" },
  ];
}

const PHASE_ORDER: Record<Step["phase"], number> = {
  ingesting: 0,
  subject_id: 1,
  extracting: 2,
  synthesizing: 3,
  critiquing: 4,
  revising: 5,
};

function buildSchedule(progress: GenerateEvent | null, frameworkLabel: string): Step[] {
  const full = buildSchedule_label(frameworkLabel);
  // Always show ingesting + subject_id + synthesizing.
  // Show extracting only if we have evidence the pipeline went two-pass.
  // Show critiquing + revising only if we have evidence those phases ran.
  const seen = new Set<Step["phase"]>(["ingesting", "subject_id", "synthesizing"]);
  if (progress) {
    if (progress.phase === "extracting") {
      seen.add("extracting");
    }
    if (progress.phase === "critiquing" || progress.phase === "revising") {
      seen.add("critiquing");
    }
    if (progress.phase === "revising") {
      seen.add("revising");
    }
  }
  return full.filter((s) => seen.has(s.phase));
}

function stepStatus(
  step: Step,
  progress: GenerateEvent | null
): "done" | "active" | "pending" {
  if (!progress) return step.phase === "ingesting" ? "active" : "pending";
  if (progress.phase === "result") return "done";
  if (progress.phase === "error") {
    return PHASE_ORDER[step.phase] < PHASE_ORDER[progress.phase as never]
      ? "done"
      : "pending";
  }
  const currentRank = PHASE_ORDER[progress.phase as Step["phase"]];
  const stepRank = PHASE_ORDER[step.phase];
  if (stepRank < currentRank) return "done";
  if (stepRank === currentRank) return "active";
  return "pending";
}

function stepDetail(step: Step, progress: GenerateEvent | null): string | null {
  if (!progress) return null;
  if (step.phase !== progress.phase) return null;
  if (progress.phase === "subject_id") {
    return `Source ${progress.current} of ${progress.total} — ${truncate(progress.sourceLabel, 60)}`;
  }
  if (progress.phase === "extracting") {
    return `Source ${progress.current} of ${progress.total} — ${truncate(progress.sourceLabel, 60)}`;
  }
  if (progress.phase === "ingesting") {
    return `${progress.sourcesCount} ${progress.sourcesCount === 1 ? "source" : "sources"}`;
  }
  if (progress.phase === "critiquing" && progress.fidelity_score !== undefined) {
    return `Fidelity score: ${progress.fidelity_score}/10`;
  }
  if (progress.phase === "revising") {
    return truncate(progress.reason, 100);
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function GenerationOverlay({ active, progress, onCancel, frameworkLabel = "map" }: Props) {
  const reduce = useReducedMotion();
  const schedule = buildSchedule(progress, frameworkLabel);
  const isError = progress?.phase === "error";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          className="fixed inset-0 z-40 bg-white/65 backdrop-blur-md flex items-center justify-center"
          // Block all pointer events on the underlying canvas/UI.
          // (The card inside is also pointer-events-auto by default.)
          style={{ pointerEvents: "auto" }}
        >
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
            className="glass-strong rounded-2xl shadow-panel min-w-[380px] max-w-[480px] w-[420px] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted">
                  {isError ? "Generation failed" : `Generating ${frameworkLabel}`}
                </div>
                <div className="text-[15px] font-medium text-ink-primary mt-0.5">
                  {isError
                    ? "Something went wrong"
                    : currentStepLabel(progress, frameworkLabel)}
                </div>
              </div>
              {onCancel && !isError && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-muted hover:text-ink-primary hover:bg-white/60 transition-colors"
                  aria-label="Cancel"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isError ? (
              <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2.5 text-[12px] text-rose-900 mb-3">
                {progress.phase === "error"
                  ? progress.message
                  : "Unknown error"}
              </div>
            ) : (
              <ul className="space-y-2.5 mb-2">
                {schedule.map((step) => {
                  const status = stepStatus(step, progress);
                  const detail = stepDetail(step, progress);
                  return (
                    <li key={step.phase} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">
                        {status === "done" && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-primary text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {status === "active" && (
                          <Loader2 className="h-4 w-4 text-ink-primary animate-spin" />
                        )}
                        {status === "pending" && (
                          <Circle className="h-4 w-4 text-ink-muted/50" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={[
                            "text-[12.5px] leading-snug",
                            status === "done"
                              ? "text-ink-muted line-through decoration-1 decoration-ink-muted/40"
                              : status === "active"
                                ? "text-ink-primary font-medium"
                                : "text-ink-muted",
                          ].join(" ")}
                        >
                          {step.label}
                        </div>
                        {detail && status === "active" && (
                          <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                            {detail}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!isError && (
              <div className="mt-4 text-[10px] font-mono uppercase tracking-widest text-ink-muted text-center">
                Hold tight — high-fidelity generation can take 60–180s
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function currentStepLabel(progress: GenerateEvent | null, frameworkLabel: string): string {
  const fw = frameworkLabel.toLowerCase();
  if (!progress) return "Getting started…";
  switch (progress.phase) {
    case "ingesting":
      return "Reading sources…";
    case "subject_id":
      return "Identifying subject…";
    case "extracting":
      return "Extracting research…";
    case "synthesizing":
      return `Structuring the ${fw}…`;
    case "critiquing":
      return progress.fidelity_score !== undefined
        ? "Critique complete"
        : "Reviewing fidelity…";
    case "revising":
      return `Refining the ${fw}…`;
    case "result":
      return "Done";
    case "error":
      return "Failed";
  }
}
