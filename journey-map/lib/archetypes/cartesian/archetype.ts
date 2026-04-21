import type { ArchetypeModule } from "@/lib/archetypes/types";
import type { CartesianDoc } from "./schema";
import { validateCartesianDoc } from "./schema";
import { cartesianLibrary } from "./library";
import { runCartesianPipeline } from "./pipeline";
import { CartesianRenderer } from "./renderer";

export const cartesianArchetype: ArchetypeModule<CartesianDoc> = {
  id: "cartesian",
  label: "Cartesian Plot",
  library: cartesianLibrary,
  pipeline: runCartesianPipeline,
  Component: CartesianRenderer,
  validateDoc: (doc) => {
    const r = validateCartesianDoc(doc);
    return r.ok ? { ok: true, doc: r.doc } : { ok: false, reason: r.reason };
  },
};
