import type { ComponentType } from "react";
import type { IngestedSource } from "@/lib/ingestion";
import type { GenerateEvent } from "@/lib/pipeline/events";

// ---------------------------------------------------------------------------
// Archetype contract — bespoke, typed alternatives to the universal
// (UniversalMap / FrameworkGrid) pipeline. Each archetype owns its own
// renderer, agent pipeline, and domain schema. The classifier routes a user
// description to an archetype when confidence ≥ threshold; otherwise the
// universal block-based pipeline handles it.
// ---------------------------------------------------------------------------

export type ArchetypeLibrary = {
  purpose: string;
  selectionHints: string[];
  exampleIntents: string[];
  antiHints?: string[];
};

/**
 * Subset of the universal SSE GenerateEvent union that an archetype pipeline
 * is allowed to emit. The route layer passes these through unchanged, so
 * shapes MUST match the universal event protocol exactly.
 */
export type ArchetypePipelineEvent = Extract<
  GenerateEvent,
  { phase: "subject_id" | "extracting" | "synthesizing" | "critiquing" | "revising" }
>;

export type ArchetypePipelineInput = {
  description: string;
  preamble: string | null;
  sources: IngestedSource[];
  emit: (event: ArchetypePipelineEvent) => void;
};

export type ArchetypePipelineResult<TDoc> = {
  doc: TDoc;
  summary: string;
  opsCount: number;
};

export type ArchetypeRendererProps<TDoc> = {
  doc: TDoc;
  onChange: (next: TDoc) => void;
  busy?: boolean;
  selection: unknown;
  onSelectionChange: (next: unknown) => void;
  createdAt?: number;
};

export type ArchetypeModule<TDoc = unknown> = {
  id: string;
  label: string;
  library: ArchetypeLibrary;
  pipeline: (
    input: ArchetypePipelineInput
  ) => Promise<ArchetypePipelineResult<TDoc>>;
  Component: ComponentType<ArchetypeRendererProps<TDoc>>;
  validateDoc: (
    doc: unknown
  ) => { ok: true; doc: TDoc } | { ok: false; reason: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyArchetypeModule = ArchetypeModule<any>;
