import type { ArchetypeModule } from "@/lib/archetypes/types";
import type { JourneyMap } from "./types";
import { validateMap } from "./schema";
import { journeyMapLibrary } from "./library";
import { runJourneyMapPipeline } from "./pipeline";
import { JourneyMapRenderer } from "./renderer";

export const journeyMapArchetype: ArchetypeModule<JourneyMap> = {
  id: "journey-map",
  label: "Customer Journey Map",
  library: journeyMapLibrary,
  pipeline: runJourneyMapPipeline,
  Component: JourneyMapRenderer,
  validateDoc: (doc) => {
    const r = validateMap(doc);
    return r.ok ? { ok: true, doc: r.map } : { ok: false, reason: r.reason };
  },
};
