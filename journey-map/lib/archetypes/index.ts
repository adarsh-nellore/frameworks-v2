import type { AnyArchetypeModule } from "./types";

// Single static registry. Archetypes self-register by importing their module
// file, which calls registerArchetype at load time. Server-side only (no
// shared memory across serverless invocations, but the list of archetypes is
// known at build time so that's fine — unlike dynamic custom frameworks).

const registry = new Map<string, AnyArchetypeModule>();

export function registerArchetype(mod: AnyArchetypeModule): void {
  if (registry.has(mod.id)) {
    throw new Error(`Archetype ${mod.id} already registered`);
  }
  registry.set(mod.id, mod);
}

export function getArchetype(id: string): AnyArchetypeModule | undefined {
  return registry.get(id);
}

export function listArchetypes(): AnyArchetypeModule[] {
  return Array.from(registry.values());
}

export function hasArchetypes(): boolean {
  return registry.size > 0;
}

// Built-in archetype registrations. Each import drives a side-effect
// registration via registerArchetype() below.
import { journeyMapArchetype } from "./journey-map/archetype";
import { tableArchetype } from "./table/archetype";
import { competitiveMatrixArchetype } from "./competitive-matrix/archetype";
import { cartesianArchetype } from "./cartesian/archetype";
import { processMapArchetype } from "./process-map/archetype";

registerArchetype(journeyMapArchetype);
registerArchetype(tableArchetype);
registerArchetype(competitiveMatrixArchetype);
registerArchetype(cartesianArchetype);
registerArchetype(processMapArchetype);

export type {
  ArchetypeModule,
  AnyArchetypeModule,
  ArchetypeLibrary,
  ArchetypePipelineInput,
  ArchetypePipelineEvent,
  ArchetypePipelineResult,
  ArchetypeRendererProps,
} from "./types";
