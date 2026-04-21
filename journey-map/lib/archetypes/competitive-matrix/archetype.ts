import type { ArchetypeModule } from "@/lib/archetypes/types";
import type { CompetitiveMatrixDoc } from "./schema";
import { validateCompetitiveMatrixDoc } from "./schema";
import { competitiveMatrixLibrary } from "./library";
import { runCompetitiveMatrixPipeline } from "./pipeline";
import { CompetitiveMatrixRenderer } from "./renderer";

export const competitiveMatrixArchetype: ArchetypeModule<CompetitiveMatrixDoc> = {
  id: "competitive-matrix",
  label: "Competitive Matrix",
  library: competitiveMatrixLibrary,
  pipeline: runCompetitiveMatrixPipeline,
  Component: CompetitiveMatrixRenderer,
  validateDoc: (doc) => {
    const r = validateCompetitiveMatrixDoc(doc);
    return r.ok ? { ok: true, doc: r.doc } : { ok: false, reason: r.reason };
  },
};
