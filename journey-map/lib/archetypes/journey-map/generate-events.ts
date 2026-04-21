// Journey-map-bound binding for the framework-agnostic pipeline events.
// The actual event protocol lives in `lib/pipeline/events.ts` — this file
// just specializes the generic to JourneyMap so callers in journey-map
// land have ergonomic types without re-stating the union.

import type {
  GenerateDebug,
  GenerateEvent as GenericGenerateEvent,
  GeneratePhase,
} from "@/lib/pipeline/events";
import { encodeSseFrame, parseSseFrames } from "@/lib/pipeline/events";
import type { JourneyMap } from "./types";

export type { GenerateDebug, GeneratePhase };
export type GenerateEvent = GenericGenerateEvent<JourneyMap>;
export const encodeSseFrameJM = (e: GenerateEvent) =>
  encodeSseFrame<JourneyMap>(e);
export const parseSseFramesJM = (buffer: string) =>
  parseSseFrames<JourneyMap>(buffer);
// Re-export the un-specialized helpers too so callers can pick.
export { encodeSseFrame, parseSseFrames };
