import { getAnthropic, getAgentModel } from "@/lib/anthropic";
import { listArchetypes } from "./index";
import type { AnyArchetypeModule } from "./types";

export type ArchetypeScore = {
  id: string;
  score: number;
  rationale: string;
};

export type ClassifyResult =
  | {
      kind: "archetype";
      archetypeId: string;
      score: number;
      scores: ArchetypeScore[];
    }
  | { kind: "fallback"; scores: ArchetypeScore[] };

export const DEFAULT_THRESHOLD = 0.7;

const TOOL_NAME = "archetype_scores";

export async function classifyIntent(
  description: string,
  threshold: number = DEFAULT_THRESHOLD,
  archetypesOverride?: AnyArchetypeModule[]
): Promise<ClassifyResult> {
  const archetypes = archetypesOverride ?? listArchetypes();
  if (archetypes.length === 0) {
    return { kind: "fallback", scores: [] };
  }

  const system = buildClassifierPrompt(archetypes);
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: getAgentModel(),
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: description.trim() }],
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Score every registered archetype against the user's description. Return one entry per archetype with a confidence score in [0, 1].",
        input_schema: {
          type: "object",
          required: ["scores"],
          additionalProperties: false,
          properties: {
            scores: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "score", "rationale"],
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  score: { type: "number", minimum: 0, maximum: 1 },
                  rationale: { type: "string", maxLength: 280 },
                },
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> =>
      block.type === "tool_use" && block.name === TOOL_NAME
  );
  if (!toolUse) {
    return { kind: "fallback", scores: [] };
  }

  const raw = toolUse.input as { scores?: ArchetypeScore[] };
  const knownIds = new Set(archetypes.map((a) => a.id));
  const scores = (raw.scores ?? []).filter(
    (s) => knownIds.has(s.id) && typeof s.score === "number"
  );
  if (scores.length === 0) {
    return { kind: "fallback", scores: [] };
  }

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.score >= threshold) {
    return {
      kind: "archetype",
      archetypeId: top.id,
      score: top.score,
      scores: sorted,
    };
  }
  return { kind: "fallback", scores: sorted };
}

export function buildClassifierPrompt(archetypes: AnyArchetypeModule[]): string {
  const entries = archetypes
    .map((a) => {
      const { library } = a;
      const hints = library.selectionHints.map((h) => `  - ${h}`).join("\n");
      const examples = library.exampleIntents
        .map((e) => `  - "${e}"`)
        .join("\n");
      const anti = library.antiHints?.length
        ? `\nDO NOT pick when:\n${library.antiHints
            .map((h) => `  - ${h}`)
            .join("\n")}`
        : "";
      return `### ${a.label} (id: ${a.id})
Purpose: ${library.purpose}
Pick when the user asks for any of:
${hints}
Example intents that should score high:
${examples}${anti}`;
    })
    .join("\n\n");

  return `You are an intent classifier for a framework-generation product. Given a short user description of what they want to build, score each registered ARCHETYPE on a scale of 0.0 to 1.0 reflecting how confidently the description maps to that archetype.

Scoring guidance:
- 0.90–1.00: Textbook match — the user explicitly asks for this archetype (by name or an unambiguous synonym).
- 0.70–0.89: Strong match — domain, shape, and purpose clearly fit; some ambiguity remains.
- 0.40–0.69: Partial match — the archetype COULD work but isn't the obvious fit.
- 0.00–0.39: Weak or no match.

Return a score for EVERY archetype listed below via the ${TOOL_NAME} tool. Scores should be calibrated relative to each other — if one archetype is a clear winner, others should be noticeably lower. If the description is vague or doesn't match any archetype's shape, score all archetypes below 0.70 and the system will fall back to a generic block-based framework.

## Archetypes

${entries}`;
}
