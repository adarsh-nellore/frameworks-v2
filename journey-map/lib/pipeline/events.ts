// Framework-agnostic SSE event protocol for the generate pipeline.
// Every pipeline path (explicit-framework universal, auto-mode synthesis)
// emits the same events. The `result` event's `map` payload is always a
// UniversalMap — rendered by FrameworkGrid via the bound FrameworkConfig.

import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

export type GeneratePhase =
  | "ingesting"
  | "subject_id"
  | "extracting"
  | "synthesizing"
  | "critiquing"
  | "revising"
  | "result"
  | "error";

export type GenerateEvent<TMap = unknown> =
  | { phase: "ingesting"; sourcesCount: number }
  | {
      phase: "subject_id";
      current: number;
      total: number;
      sourceLabel: string;
    }
  | {
      phase: "extracting";
      current: number;
      total: number;
      sourceLabel: string;
    }
  | { phase: "synthesizing" }
  | { phase: "critiquing"; fidelity_score?: number }
  | { phase: "revising"; reason: string }
  | {
      phase: "result";
      summary: string;
      /** The generated UniversalMap to render via FrameworkGrid. */
      map: TMap;
      /** For auto-mode synthesis: the newly-generated FrameworkConfig that
       *  pairs with `map`. The client registers this via registerDynamicFramework
       *  so the board can be edited with the universal op/arrange pipeline.
       *  Absent for explicit-framework generations (the config already exists). */
      config?: FrameworkConfig;
      debug: GenerateDebug;
    }
  | { phase: "error"; message: string };

export type GenerateDebug = {
  mode: "single-shot" | "two-pass";
  sourcesCount: number;
  digestsCount?: number;
  opsCount: number;
  fidelityMode: boolean;
  critiqueRan: boolean;
  revisionRan: boolean;
  fidelityScore?: number;
  revisionOpsCount?: number;
};

/** SSE frame format: `data: <json>\n\n`. */
export function encodeSseFrame<TMap = unknown>(
  event: GenerateEvent<TMap>
): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Parse an SSE chunk into events; return parsed events + any trailing partial buffer. */
export function parseSseFrames<TMap = unknown>(
  buffer: string
): { events: GenerateEvent<TMap>[]; remainder: string } {
  const events: GenerateEvent<TMap>[] = [];
  const frames = buffer.split("\n\n");
  const remainder = frames.pop() ?? "";
  for (const frame of frames) {
    const trimmed = frame.trim();
    if (!trimmed.startsWith("data:")) continue;
    const json = trimmed.slice(5).trimStart();
    try {
      events.push(JSON.parse(json) as GenerateEvent<TMap>);
    } catch {
      // Drop malformed frames silently — defensive only; server controls format.
    }
  }
  return { events, remainder };
}
