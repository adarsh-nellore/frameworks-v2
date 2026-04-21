// JSONSchema for the emit_digest tool input. The extraction agent reads one
// source and emits a structured digest preserving the journey's narrative arc
// without making the synthesis decision yet.

export const digestSchema = {
  type: "object",
  properties: {
    source_label: {
      type: "string",
      description:
        "Short, human-readable label for this source (e.g. 'Sarah interview', 'Persona: Power user').",
    },
    persona_signals: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete persona traits inferred from the source (e.g. 'time-pressured urban professional', 'first-time grocery shopper'). Empty array if none.",
    },
    journey_arc: {
      type: "string",
      description:
        "1-2 sentence summary of the overall journey shape captured in this source.",
    },
    observed_phases: {
      type: "array",
      description:
        "The phases or temporal segments visible in the source, in order. Each phase has a name, brief summary, and any vivid quotes or paraphrases.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short phase name (e.g. 'Pre-shop planning').",
          },
          summary: {
            type: "string",
            description: "1-2 sentences describing what happens in this phase.",
          },
          quotes: {
            type: "array",
            items: { type: "string" },
            description:
              "Verbatim quotes or close paraphrases from the source. Preserve specificity.",
          },
        },
        required: ["name", "summary", "quotes"],
        additionalProperties: false,
      },
    },
    themes: {
      type: "object",
      description:
        "Cross-phase themes grouped by the row kinds they would map to in a journey map. Use known kinds where possible (actions, thoughts, emotions, pain_points, opportunities, touchpoints, metrics, stakeholders, systems, channels, decisions, artifacts) but invent kinds when the material warrants.",
      properties: {
        actions: { type: "array", items: { type: "string" } },
        thoughts: { type: "array", items: { type: "string" } },
        emotions: { type: "array", items: { type: "string" } },
        pain_points: { type: "array", items: { type: "string" } },
        opportunities: { type: "array", items: { type: "string" } },
        touchpoints: { type: "array", items: { type: "string" } },
        metrics: { type: "array", items: { type: "string" } },
        stakeholders: { type: "array", items: { type: "string" } },
      },
      additionalProperties: { type: "array", items: { type: "string" } },
    },
  },
  required: [
    "source_label",
    "persona_signals",
    "journey_arc",
    "observed_phases",
    "themes",
  ],
  additionalProperties: false,
} as const;

export const DIGEST_TOOL_NAME = "emit_digest";
export const DIGEST_TOOL_DESCRIPTION =
  "Emit a structured research digest summarizing the source material's journey content. The digest is consumed downstream to synthesize a journey map.";

export type Digest = {
  source_label: string;
  persona_signals: string[];
  journey_arc: string;
  observed_phases: Array<{
    name: string;
    summary: string;
    quotes: string[];
  }>;
  themes: Record<string, string[] | undefined>;
};

export function validateDigest(
  u: unknown
): { ok: true; digest: Digest } | { ok: false; reason: string } {
  if (typeof u !== "object" || u === null) {
    return { ok: false, reason: "digest must be an object" };
  }
  const o = u as Record<string, unknown>;
  if (typeof o.source_label !== "string")
    return { ok: false, reason: "source_label must be a string" };
  if (!Array.isArray(o.persona_signals))
    return { ok: false, reason: "persona_signals must be an array" };
  if (typeof o.journey_arc !== "string")
    return { ok: false, reason: "journey_arc must be a string" };
  if (!Array.isArray(o.observed_phases))
    return { ok: false, reason: "observed_phases must be an array" };
  for (let i = 0; i < o.observed_phases.length; i++) {
    const p = o.observed_phases[i] as Record<string, unknown>;
    if (typeof p?.name !== "string")
      return { ok: false, reason: `observed_phases[${i}].name missing` };
    if (typeof p?.summary !== "string")
      return { ok: false, reason: `observed_phases[${i}].summary missing` };
    if (!Array.isArray(p?.quotes))
      return { ok: false, reason: `observed_phases[${i}].quotes must be an array` };
  }
  if (typeof o.themes !== "object" || o.themes === null)
    return { ok: false, reason: "themes must be an object" };
  return { ok: true, digest: o as unknown as Digest };
}
