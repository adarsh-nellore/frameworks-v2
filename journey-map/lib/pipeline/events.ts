// Framework-agnostic SSE event protocol for the generate pipeline.
// The pipeline phases (subject_id → extracting → synthesizing → critiquing →
// revising → result) are not journey-map-specific — any 2D framework
// (matrix, etc.) that reuses this orchestration emits the same events.
//
// The `result` event's `map` payload is parameterized by the framework's
// map type — journey-map uses JourneyMap; a future matrix would use Matrix.

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
      map: TMap;
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
