import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getThemeNormalizeModel } from "@/lib/anthropic";

// ──────────────────────────────────────────────────────────────────────────────
// prompt-interpreter — a thin Haiku pre-step that normalizes rough or terse
// user prompts into a structured brief the synth agent can act on. Runs only
// when a heuristic says the prompt is likely under-specified; skipped on
// complete prompts so we don't pay the Haiku tax for nothing.
//
// Design principles:
//   - Does NOT rewrite the user's prompt. Appends an "Interpreter notes"
//     block so the synth agent sees both original intent + interpretation.
//   - Normalization, not invention. Haiku is told explicitly not to add
//     details the user didn't imply.
//   - Fails soft. If Haiku errors or returns nothing useful, we pass the
//     original prompt through unchanged. Never blocks generation.
//   - Opt-out via env: set `PROMPT_INTERPRETER=off` to disable entirely.
// ──────────────────────────────────────────────────────────────────────────────

export type InterpreterResult = {
  shape?: "matrix" | "grid" | "kanban" | "freeform";
  subject?: string;
  depth?: "sparse" | "medium" | "dense";
  structuralHints?: string[];
  contentHints?: string[];
  needsClarification?: boolean;
};

/** Decide whether to run the interpreter at all. Short prompts benefit most;
 *  longer prompts already carry enough detail that interpretation adds noise.
 *  Also skipped when `PROMPT_INTERPRETER=off`. */
export function shouldInterpret(prompt: string): boolean {
  if (process.env.PROMPT_INTERPRETER === "off") return false;
  const t = prompt.trim();
  if (t.length === 0) return false;
  // Terse prompts are where interpretation pays. The shape-keyword detector
  // already handles explicit shape words deterministically, so the interpreter
  // is mostly filling in subject / depth / structural hints on short inputs.
  if (t.length < 120) return true;
  // Longer prompts that happen to miss a subject noun — hard to detect cheaply
  // without an LLM. Skip for now; false negatives are the safer failure mode.
  return false;
}

export async function interpretPrompt(
  prompt: string
): Promise<InterpreterResult | null> {
  try {
    const client = getAnthropic();
    const response = await client.messages.create({
      model: getThemeNormalizeModel(),
      max_tokens: 600,
      temperature: 0.2,
      system: SYSTEM,
      tools: [INTERPRET_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "interpret_prompt" },
      messages: [
        {
          role: "user",
          content: `User prompt (may be terse):\n"${prompt.trim()}"\n\nCall interpret_prompt. Be honest about what's actually stated vs. inferred.`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const raw = block.input as Partial<InterpreterResult>;
    // Shallow validation + coercion.
    const result: InterpreterResult = {};
    if (
      raw.shape === "matrix" ||
      raw.shape === "grid" ||
      raw.shape === "kanban" ||
      raw.shape === "freeform"
    ) {
      result.shape = raw.shape;
    }
    if (typeof raw.subject === "string" && raw.subject.trim().length > 0) {
      result.subject = raw.subject.trim();
    }
    if (raw.depth === "sparse" || raw.depth === "medium" || raw.depth === "dense") {
      result.depth = raw.depth;
    }
    if (Array.isArray(raw.structuralHints)) {
      result.structuralHints = raw.structuralHints
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .slice(0, 6);
    }
    if (Array.isArray(raw.contentHints)) {
      result.contentHints = raw.contentHints
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .slice(0, 6);
    }
    if (typeof raw.needsClarification === "boolean") {
      result.needsClarification = raw.needsClarification;
    }
    return result;
  } catch (err) {
    console.warn("[prompt-interpreter] failed — falling back to raw prompt:", err);
    return null;
  }
}

export function formatInterpreterNotes(result: InterpreterResult): string {
  const lines: string[] = ["# Interpreter notes (Haiku pre-step)"];
  if (result.shape) lines.push(`- Likely shape: ${result.shape}`);
  if (result.subject) lines.push(`- Subject: ${result.subject}`);
  if (result.depth) lines.push(`- Depth target: ${result.depth}`);
  if (result.structuralHints?.length) {
    lines.push(`- Structural hints:`);
    for (const h of result.structuralHints) lines.push(`    · ${h}`);
  }
  if (result.contentHints?.length) {
    lines.push(`- Content hints:`);
    for (const h of result.contentHints) lines.push(`    · ${h}`);
  }
  if (result.needsClarification) {
    lines.push(
      `- Note: original prompt was terse; the above are best-effort interpretations, not user-stated facts. Use them as a prior, not ground truth.`
    );
  }
  // If the interpreter produced nothing, return an empty block so callers can
  // skip appending. Callers should check formatInterpreterNotes(...).trim().
  return lines.length > 1 ? lines.join("\n") : "";
}

const SYSTEM = `You are a prompt-interpreter that normalizes rough user requests for framework boards into a structured brief. A downstream agent will use your output + the user's original text to synthesize and populate the board.

Your job is NORMALIZATION, not invention. Only surface what the user actually said or plausibly implied — never add specific constraints, entities, numbers, or domain details the user didn't mention. When the prompt is too vague to act on confidently, set needsClarification=true and keep your other fields conservative.

Fields:
- shape: one of "matrix" (two axes), "grid" (swimlanes × stages), "kanban" (columns of cards, no rows), "freeform" (unstructured canvas). Omit if not clearly implied.
- subject: the domain or topic the board covers. Echo the user's subject as-is, don't broaden or narrow.
- depth: "sparse" (<30 cells), "medium" (30-80 cells), "dense" (80+ cells). Infer from phrasing like "quick sketch" vs "comprehensive" — default medium.
- structuralHints: short phrases about stages, swimlanes, axis pairs, tiers. Only if the user mentioned them.
- contentHints: short phrases about specific content the user wants covered. Only if mentioned.
- needsClarification: true if the prompt is too terse/vague to proceed with confidence.

Hard rules:
- If the user didn't say a number, don't guess one ("10 stages", "6 swimlanes" → bad unless stated).
- If the user didn't name entities, don't add them ("Anthropic", "OpenAI" → bad unless mentioned).
- Empty fields are fine. Conservative beats confident-and-wrong.`;

const INTERPRET_TOOL = {
  name: "interpret_prompt",
  description:
    "Structured interpretation of a rough user prompt. Fields should reflect what the user stated or plausibly implied, not inventions.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      shape: {
        type: "string",
        enum: ["matrix", "grid", "kanban", "freeform"],
        description: "Layout most compatible with what the user described. Omit if unclear.",
      },
      subject: {
        type: "string",
        description:
          "The topic the board is about. Echo what the user said; do not reword or broaden.",
      },
      depth: {
        type: "string",
        enum: ["sparse", "medium", "dense"],
        description: "Richness target. Default medium.",
      },
      structuralHints: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
        description:
          "Phrases about structure the user implied (e.g., 'swimlanes for patient vs provider', 'effort × impact axes').",
      },
      contentHints: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
        description:
          "Specific content the user mentioned should be covered (entities, constraints, framings).",
      },
      needsClarification: {
        type: "boolean",
        description:
          "True if the prompt is so terse that downstream synthesis must invent substantially to proceed.",
      },
    },
  },
} as const;
