import type { ArchetypeModule } from "@/lib/archetypes/types";
import type { ProcessMapDoc } from "./schema";
import { validateProcessMapDoc } from "./schema";
import { processMapLibrary } from "./library";
import { runProcessMapPipeline } from "./pipeline";
import { ProcessMapRenderer } from "./renderer";

export const processMapArchetype: ArchetypeModule<ProcessMapDoc> = {
  id: "process-map",
  label: "Process Map",
  library: processMapLibrary,
  pipeline: runProcessMapPipeline,
  Component: ProcessMapRenderer,
  validateDoc: (doc) => {
    const r = validateProcessMapDoc(doc);
    return r.ok ? { ok: true, doc: r.doc } : { ok: false, reason: r.reason };
  },
};
