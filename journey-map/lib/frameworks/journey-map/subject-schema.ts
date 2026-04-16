// Tool schema for the subject-identification agent. The agent reads ONE
// source and decides what kind of source it is, who the journey is about,
// and what the journey actually IS — separating the source's surface
// narrative (e.g. "the meeting") from the substance (the interviewee's
// actual work / life / role).

export const SUBJECT_TOOL_NAME = "identify_subject";
export const SUBJECT_TOOL_DESCRIPTION =
  "Emit a structured identification of the journey's subject and recommended map shape based on the source material.";

export const SOURCE_KINDS = [
  "interview_transcript",
  "meeting_notes",
  "persona",
  "user_story",
  "jtbd",
  "research_notes",
  "support_log",
  "scenario",
  "mixed",
  "other",
] as const;

export const JOURNEY_DENSITY = ["low", "medium", "high", "very_high"] as const;

export const subjectSchema = {
  type: "object",
  properties: {
    source_kind: {
      type: "string",
      enum: SOURCE_KINDS as unknown as string[],
      description:
        "What kind of source this is — interview transcript, persona doc, JTBD statement, etc.",
    },
    subject: {
      type: "object",
      description:
        "Who the journey is about. The subject is the protagonist whose journey will be visualized.",
      properties: {
        name: {
          type: ["string", "null"],
          description:
            "Best-guess name from the source (e.g. 'Sarah'). null if unknown.",
        },
        role: {
          type: ["string", "null"],
          description:
            "Best-guess role / job / function (e.g. 'regulatory affairs CMC professional'). null if unknown.",
        },
        description: {
          type: "string",
          description:
            "1-2 sentences identifying the subject — who they are and the relevant context.",
        },
      },
      required: ["name", "role", "description"],
      additionalProperties: false,
    },
    journey_topic: {
      type: "string",
      description:
        "The journey we are building — phrased as 'their <activity / workflow / experience>'. E.g. 'their daily workflow sourcing and acting on regulatory updates.' This is THE core decision the agent is making.",
    },
    not_the_journey_of: {
      type: "string",
      description:
        "Explicit anti-target — what the journey is NOT about. For interviews: typically 'the interview / meeting itself.' For research notes: 'the note-taking session.' For demos: 'the demo flow.' This guards against the most common failure: building the journey of the source's surface narrative instead of its substance.",
    },
    journey_density: {
      type: "string",
      enum: JOURNEY_DENSITY as unknown as string[],
      description:
        "How much journey content the source contains. low = sparse persona doc; medium = standard interview / scenario; high = dense interview with many tools/phases/pain-points; very_high = multi-source or 60+ minute deep interview.",
    },
    recommended_stages: {
      type: "array",
      items: { type: "integer", minimum: 3, maximum: 20 },
      minItems: 2,
      maxItems: 2,
      description:
        "Recommended [min, max] number of stages for the journey map, calibrated to source density. Examples: [4,6] sparse, [5,7] short, [7,10] standard, [8,12] dense, [10,15] multi-source.",
    },
    recommended_rows: {
      type: "array",
      items: { type: "integer", minimum: 2, maximum: 12 },
      minItems: 2,
      maxItems: 2,
      description:
        "Recommended [min, max] number of rows / lanes. Examples: [3,5] sparse, [5,7] standard, [6,8] dense, [6,9] multi-source.",
    },
    rationale: {
      type: "string",
      description:
        "1-2 sentences justifying the subject identification and map-shape recommendation. Cite specific signals from the source.",
    },
  },
  required: [
    "source_kind",
    "subject",
    "journey_topic",
    "not_the_journey_of",
    "journey_density",
    "recommended_stages",
    "recommended_rows",
    "rationale",
  ],
  additionalProperties: false,
} as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];
export type JourneyDensity = (typeof JOURNEY_DENSITY)[number];

export type SubjectId = {
  source_kind: SourceKind;
  subject: {
    name: string | null;
    role: string | null;
    description: string;
  };
  journey_topic: string;
  not_the_journey_of: string;
  journey_density: JourneyDensity;
  recommended_stages: [number, number];
  recommended_rows: [number, number];
  rationale: string;
};

export function validateSubjectId(
  u: unknown
): { ok: true; subject: SubjectId } | { ok: false; reason: string } {
  if (typeof u !== "object" || u === null) {
    return { ok: false, reason: "subject must be an object" };
  }
  const o = u as Record<string, unknown>;
  if (
    typeof o.source_kind !== "string" ||
    !SOURCE_KINDS.includes(o.source_kind as SourceKind)
  ) {
    return { ok: false, reason: "invalid source_kind" };
  }
  if (typeof o.subject !== "object" || o.subject === null) {
    return { ok: false, reason: "subject.subject must be an object" };
  }
  const s = o.subject as Record<string, unknown>;
  if (typeof s.description !== "string") {
    return { ok: false, reason: "subject.description must be a string" };
  }
  if (typeof o.journey_topic !== "string") {
    return { ok: false, reason: "journey_topic must be a string" };
  }
  if (typeof o.not_the_journey_of !== "string") {
    return { ok: false, reason: "not_the_journey_of must be a string" };
  }
  if (
    typeof o.journey_density !== "string" ||
    !JOURNEY_DENSITY.includes(o.journey_density as JourneyDensity)
  ) {
    return { ok: false, reason: "invalid journey_density" };
  }
  if (
    !Array.isArray(o.recommended_stages) ||
    o.recommended_stages.length !== 2 ||
    !o.recommended_stages.every((n) => typeof n === "number")
  ) {
    return { ok: false, reason: "recommended_stages must be a 2-number array" };
  }
  if (
    !Array.isArray(o.recommended_rows) ||
    o.recommended_rows.length !== 2 ||
    !o.recommended_rows.every((n) => typeof n === "number")
  ) {
    return { ok: false, reason: "recommended_rows must be a 2-number array" };
  }
  if (typeof o.rationale !== "string") {
    return { ok: false, reason: "rationale must be a string" };
  }
  return { ok: true, subject: o as unknown as SubjectId };
}

/** Render a SubjectId as a compact "Subject context" block for downstream prompts. */
export function renderSubjectContext(s: SubjectId): string {
  const subjectLine = s.subject.name
    ? `${s.subject.description} (${s.subject.role || "—"}; named: ${s.subject.name})`
    : `${s.subject.description}${s.subject.role ? ` (${s.subject.role})` : ""}`;
  return [
    "Subject context (from subject-id agent):",
    `  Subject:    ${subjectLine}`,
    `  Journey:    ${s.journey_topic}`,
    `  NOT about:  ${s.not_the_journey_of}`,
    `  Source:     ${s.source_kind}`,
    `  Density:    ${s.journey_density} → recommended ${s.recommended_stages[0]}–${s.recommended_stages[1]} stages × ${s.recommended_rows[0]}–${s.recommended_rows[1]} lanes`,
    `  Rationale:  ${s.rationale}`,
  ].join("\n");
}

/** Merge multiple SubjectIds into a single one for cross-source synthesis.
 *  Strategy: take the most-detailed subject (longest description), union
 *  density up, take the widest recommended ranges. Source kinds are joined.
 */
export function mergeSubjectIds(ids: SubjectId[]): SubjectId {
  if (ids.length === 1) return ids[0];
  const primary = [...ids].sort(
    (a, b) => b.subject.description.length - a.subject.description.length
  )[0];
  const densityRank = (d: JourneyDensity) =>
    JOURNEY_DENSITY.indexOf(d);
  const density = ids
    .map((i) => i.journey_density)
    .sort((a, b) => densityRank(b) - densityRank(a))[0];
  const minStages = Math.min(...ids.map((i) => i.recommended_stages[0]));
  const maxStages = Math.max(...ids.map((i) => i.recommended_stages[1]));
  const minRows = Math.min(...ids.map((i) => i.recommended_rows[0]));
  const maxRows = Math.max(...ids.map((i) => i.recommended_rows[1]));
  return {
    ...primary,
    journey_density: density,
    recommended_stages: [minStages, maxStages],
    recommended_rows: [minRows, maxRows],
    rationale: `Merged from ${ids.length} sources. ${primary.rationale}`,
  };
}
