import type { ArchetypeModule } from "@/lib/archetypes/types";
import type { TableDoc } from "./schema";
import { validateTableDoc } from "./schema";
import { tableLibrary } from "./library";
import { runTablePipeline } from "./pipeline";
import { TableRenderer } from "./renderer";

export const tableArchetype: ArchetypeModule<TableDoc> = {
  id: "table",
  label: "Table",
  library: tableLibrary,
  pipeline: runTablePipeline,
  Component: TableRenderer,
  validateDoc: (doc) => {
    const r = validateTableDoc(doc);
    return r.ok ? { ok: true, doc: r.doc } : { ok: false, reason: r.reason };
  },
};
