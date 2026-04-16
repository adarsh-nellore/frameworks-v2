import { JourneyMap as JourneyMapComponent } from "@/components/JourneyMap";
import type { FrameworkModule } from "../types";
import type { JourneyMap } from "./types";
import type { Op } from "./ops";
import { applyOps, validateOpShape } from "./ops";
import { systemPrompt } from "./prompt";
import { renderUserPayload } from "./payload";
import { toolDescription, toolName, toolSchema, validateMap } from "./schema";
import { seed } from "./seed";

export const exampleInstructions = [
  "Add a Metrics lane tracking activation and retention",
  "Split Decision into Evaluation and Purchase",
  "Rebuild as a patient-onboarding journey",
  "Make every cell more specific and vivid",
];

export const journeyMapModule: FrameworkModule<JourneyMap, Op> = {
  id: "journey-map",
  label: "Customer Journey Map",
  seed,

  systemPrompt,
  toolName,
  toolDescription,
  toolSchema,
  renderUserPayload,

  applyOps,
  validateMap,
  validateOpShape,

  Component: JourneyMapComponent,
  exampleInstructions,
};

export type { JourneyMap, JourneyMapSelection } from "./types";
export type { Op } from "./ops";
