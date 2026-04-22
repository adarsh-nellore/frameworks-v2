import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getThemeNormalizeModel } from "@/lib/anthropic";
import type { SourceDigest } from "./source-digest";

// ──────────────────────────────────────────────────────────────────────────────
// prompt-clarifier — turn-based conversational pre-step that asks open-ended
// follow-ups to sharpen an ambiguous prompt before /api/generate runs. Each
// call is ONE turn: the model either returns a question to ask OR declares
// ready with a structured constraints object. Client drives the loop.
//
// Design principles:
//   - One question at a time. Open-ended with optional quick-reply
//     suggestions (Claude.ai style), NEVER a pure multiple-choice form.
//   - Framework-aware. The system prompt primes each layout so the agent
//     can ask shape-specific questions once intent is clear.
//   - Source-grounded. When `sourceDigest.text` is present, the model is
//     instructed to reference actual column names / document titles / text
//     themes in its questions.
//   - Terminate aggressively. 4-turn hard cap enforced here (server-side).
//   - Fails soft. On any error, routes fall back to direct generate with the
//     Haiku interpreter still running on short prompts.
//
// Opt-out: PROMPT_CLARIFIER=off disables the clarifier entirely; client
// should fall back to direct submit when shouldClarify returns false.
// ──────────────────────────────────────────────────────────────────────────────

export type ClarifierTurnPair = {
  question: string;
  answer: string;
};

export type ClarifierQuestion = {
  question: string;
  rationale?: string;
  suggestions?: string[];
  allowFreeText: boolean;
};

export type ClarifierConstraints = {
  /** Any fields the model saw fit to include. Stable keys we care about:
   *  layout, subject, shape, swimlanes, axes, columns, rows, depth,
   *  entities, grounding, must-include. Free-form values; the synth prompt
   *  treats every key as authoritative. */
  [key: string]: string | string[] | undefined;
};

export type ClarifierTurnResult =
  | { ready: true; constraints: ClarifierConstraints }
  | { ready: false; question: ClarifierQuestion };

export type ClarifierTurnInput = {
  prompt: string;
  transcript: ClarifierTurnPair[];
  sourceDigest: SourceDigest;
  /** Optional snapshot of an existing board the user is iterating on (from
   *  FrameworkGridStage). Gives the clarifier context about what already
   *  exists so it can ask targeted questions like "which regions should I
   *  preserve?" or "what's the axis you want?" instead of generic ones. */
  boardSnapshot?: string;
};

const MAX_TURNS = 4;

export function getClarifierModel(): string {
  return process.env.CLARIFIER_MODEL || getThemeNormalizeModel();
}

export function clarifierEnabled(): boolean {
  return process.env.PROMPT_CLARIFIER !== "off";
}

/** Lightweight heuristic for whether to even attempt the clarifier on turn 1.
 *  A prompt that's long, shape-explicit, AND has no sources will usually
 *  short-circuit to ready on turn 0 anyway — but we let the model decide. We
 *  only skip the clarifier outright when it's disabled via env. */
export function shouldClarify(
  prompt: string,
  hasSources: boolean
): boolean {
  if (!clarifierEnabled()) return false;
  const t = prompt.trim();
  if (t.length === 0 && !hasSources) return false;
  return true;
}

export async function runClarifierTurn(input: ClarifierTurnInput): Promise<ClarifierTurnResult> {
  // Server-side hard cap: at turn MAX_TURNS, force ready regardless of model.
  if (input.transcript.length >= MAX_TURNS) {
    return {
      ready: true,
      constraints: composeFallbackConstraints(input),
    };
  }

  const client = getAnthropic();
  const system = buildSystemPrompt(input.transcript.length);
  const user = buildUserMessage(input);

  let raw: unknown;
  try {
    const response = await client.messages.create({
      model: getClarifierModel(),
      max_tokens: 800,
      temperature: 0.3,
      system,
      tools: [CLARIFIER_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "clarifier_turn" },
      messages: [{ role: "user", content: user }],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("Clarifier did not produce a clarifier_turn tool_use block");
    }
    raw = block.input;
  } catch (err) {
    console.warn("[prompt-clarifier] turn failed — returning ready with fallback constraints:", err);
    return {
      ready: true,
      constraints: composeFallbackConstraints(input),
    };
  }

  return validateAndCoerce(raw, input);
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(turnIndex: number): string {
  const turnsRemaining = MAX_TURNS - turnIndex;
  return `You are a clarifier that sharpens rough framework-board requests into precise briefs a downstream synth agent can act on. One turn at a time.

Your job each turn:
- Read the user's prompt, the conversation transcript so far, and any source digest.
- EITHER ask ONE open-ended question whose answer materially changes what gets rendered, OR declare ready with a structured constraints object.
- Do not ask questions whose answers wouldn't change the output (cosmetic, stylistic, or already-stated).

Hard rules:
- Open-ended free-text answers are always allowed. Suggestions are optional quick-replies (2–4 max); never a forced multiple-choice.
- Never invent subject detail. If the subject is missing, ASK; don't guess.
- When sources are attached, ground questions in them — reference CSV column names verbatim, quote document titles, cite named entities from text previews. Never ask for information already spelled out in a source.
- Declare ready as SOON as a first-rate synth agent would succeed with what's been gathered. Conservative > thorough. Don't ask three questions when one more would've been enough.
- Turns remaining: ${turnsRemaining}. If this is the last turn, you MUST return ready.

Framework primers — once the likely layout is clear, ask shape-specific questions:
- matrix (two axes, e.g. 2×2, competitive matrices): ask which two properties become axes, which competitors/items populate cells, whether any are fixed.
- grid (swimlanes × stages, e.g. journey maps, service blueprints, process maps): ask who the actor is, how many swimlanes and what kind (actions / touchpoints / emotions / pain points / backstage), and the stage scope.
- kanban (columns of cards, e.g. card sort, affinity, JTBD, Now/Next/Later): ask what the columns represent, how many, and the item granularity.
- freeform (mind map, concept map): ask what sits at the center and how branches are organized.

Constraints shape (when you return ready): return the fields actually confirmed. Common keys: layout, subject, shape, swimlanes, axes, columns, rows, depth, entities, grounding, must_include. Free-text answers land verbatim.

Call clarifier_turn with exactly one mode: question OR ready.`;
}

function buildUserMessage(input: ClarifierTurnInput): string {
  const parts: string[] = [];
  if (input.boardSnapshot && input.boardSnapshot.trim().length > 0) {
    parts.push(`## Current board (the user is iterating on this — preserve or restructure as their prompt implies)`);
    parts.push(input.boardSnapshot.trim());
    parts.push(``);
  }
  parts.push(`## User ${input.boardSnapshot ? "instruction" : "prompt"}`);
  parts.push(input.prompt.trim() || "(empty — likely source-driven)");
  if (input.sourceDigest.text && input.sourceDigest.text.trim().length > 0) {
    parts.push(``);
    parts.push(input.sourceDigest.text);
  }
  if (input.transcript.length > 0) {
    parts.push(``);
    parts.push(`## Conversation so far`);
    for (const pair of input.transcript) {
      parts.push(`Q: ${pair.question}`);
      parts.push(`A: ${pair.answer}`);
    }
  }
  parts.push(``);
  parts.push(`Call clarifier_turn now.`);
  return parts.join("\n");
}

// ── Validation / coercion ────────────────────────────────────────────────────

function validateAndCoerce(raw: unknown, input: ClarifierTurnInput): ClarifierTurnResult {
  if (!raw || typeof raw !== "object") {
    return { ready: true, constraints: composeFallbackConstraints(input) };
  }
  const r = raw as Record<string, unknown>;
  if (r.ready === true) {
    const constraints = r.constraints && typeof r.constraints === "object"
      ? coerceConstraints(r.constraints as Record<string, unknown>)
      : composeFallbackConstraints(input);
    return { ready: true, constraints };
  }
  // Otherwise expect a question payload.
  const q = r.question;
  const question = typeof q === "string" ? q.trim() : typeof (r.question as { text?: string })?.text === "string" ? ((r.question as { text: string }).text).trim() : "";
  if (!question) {
    return { ready: true, constraints: composeFallbackConstraints(input) };
  }
  const rationale =
    typeof r.rationale === "string" && r.rationale.trim().length > 0
      ? r.rationale.trim()
      : undefined;
  const rawSuggestions = Array.isArray(r.suggestions) ? r.suggestions : [];
  const suggestions = rawSuggestions
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 4);
  const allowFreeText = r.allowFreeText === false ? false : true;
  return {
    ready: false,
    question: { question, rationale, suggestions: suggestions.length ? suggestions : undefined, allowFreeText },
  };
}

function coerceConstraints(obj: Record<string, unknown>): ClarifierConstraints {
  const out: ClarifierConstraints = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) out[key] = trimmed;
    } else if (Array.isArray(value)) {
      const arr = value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim());
      if (arr.length > 0) out[key] = arr;
    }
    // Ignore non-string/array values — constraints block is text.
  }
  return out;
}

/** Build a best-effort constraints block from the transcript + prompt when
 *  the model errored out or hit the turn cap. Keeps anything the user
 *  explicitly answered so the synth still gets some signal. */
function composeFallbackConstraints(input: ClarifierTurnInput): ClarifierConstraints {
  const out: ClarifierConstraints = {};
  if (input.prompt.trim()) {
    out.subject = input.prompt.trim().slice(0, 400);
  }
  if (input.transcript.length > 0) {
    out.notes = input.transcript.map((p) => `${p.question} → ${p.answer}`);
  }
  return out;
}

// ── Constraints block rendering (shared with the route) ──────────────────────

export function renderConstraintsBlock(constraints: ClarifierConstraints): string {
  const lines: string[] = ["# Constraints (user-confirmed)"];
  for (const [key, value] of Object.entries(constraints)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`- ${key}: ${value.join(", ")}`);
    } else {
      lines.push(`- ${key}: ${value}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// ── Tool schema ──────────────────────────────────────────────────────────────

const CLARIFIER_TOOL = {
  name: "clarifier_turn",
  description:
    "One clarifier turn. Either ask ONE open-ended question (with optional quick-reply suggestions) OR declare ready with a structured constraints object.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ready: {
        type: "boolean",
        description:
          "true when you have enough to produce a good board. false when you need one more clarifying question.",
      },
      // ready=true fields:
      constraints: {
        type: "object",
        description:
          "Structured, authoritative facts the user has confirmed. Use flat string or string-array values. Common keys: layout, subject, shape, swimlanes, axes, columns, rows, depth, entities, grounding, must_include. Include only what's actually been confirmed.",
        additionalProperties: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
        },
      },
      // ready=false fields:
      question: {
        type: "string",
        description:
          "The next question to ask. Open-ended phrasing. Reference source material by name / column where applicable.",
      },
      rationale: {
        type: "string",
        description:
          "One short sentence explaining why this question matters. Shown muted under the question to help the user answer well.",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        maxItems: 4,
        description:
          "Optional quick-reply suggestions. 2–4 max. Each should be a plausible concrete answer the user can tap to prefill the input.",
      },
      allowFreeText: {
        type: "boolean",
        description: "Always true — free text must be accepted. Included for forward compatibility.",
      },
    },
  },
} as const;
