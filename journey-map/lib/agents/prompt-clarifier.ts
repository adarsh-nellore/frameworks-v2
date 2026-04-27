import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getThemeNormalizeModel } from "@/lib/anthropic";
import type { SourceDigest } from "./source-digest";
import type { ShapeContract } from "@/lib/frameworks/shape-contract";

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
  /** Draft ShapeContract from the shape planner. When present, the clarifier
   *  knows exactly what's already been decided and asks ONE question tied to
   *  a low-confidence field (if any). This is what stops the clarifier from
   *  regressing into execution-detail micromanaging. */
  draftContract?: ShapeContract | null;
};

/** How many clarifier model calls we'll make before force-readying server-side.
 *  Turn 0 (transcript.length === 0) always consults the model. Turns at or
 *  beyond this number return ready without consulting. The conversational
 *  budget is intentionally tight: one focused follow-up beats three meandering
 *  ones for getting the user back to a concrete board. */
const MAX_TURNS = 1;

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
  const isFirstTurn = turnIndex === 0;
  return `You are a clarifier. The user is about to generate (or iterate on) a framework board. Your job: ask one sharp follow-up that materially shapes what gets built, then get out of the way.

## Behavior by turn

${isFirstTurn
  ? `**Turn 0 — ask ONE question by default.** A good board needs more than a shape and a subject. The thing that's almost always missing from a one-line prompt is one of: who reads it, what they decide from it, what angle the user actually cares about, or which slice of an enormous topic to cover. Pick the single highest-leverage one and ask. Examples:
- Prompt: "service blueprint for a telehealth urgent-care visit" → "Who's the primary reader — clinical ops, product, or compliance?" (each rebalances which swimlane gets depth)
- Prompt: "competitive matrix of foundation model labs across 8 dimensions" → "Is this for an enterprise buyer making a procurement call, or for an investor sizing the field?"
- Prompt: "post-mortem of the SVB collapse for founders" → "Is the angle 'lessons for treasury management' or 'how to read warning signs in your own bank'?"
- Prompt: "mind map of my career" → "What's the decision this is supposed to inform — a job search, a year-end review, or a long-arc plan?"

The ONLY reason to skip the question and return ready immediately on turn 0 is if the user has already pinned audience + angle + scope explicitly in their prompt (rare). When in doubt, ask.

If a board snapshot is present (the user is iterating on an existing board), still ask one question when the iteration is ambiguous — e.g., "make this 2×2" → "Which two axes? (e.g., market scope × pricing strategy, or cost × differentiation)". If the iteration is unambiguous (e.g., "add 3 risks per row"), you may return ready.`
  : `**Turn ${turnIndex} — bias toward ready.** The user has answered. Only ask another question if there's a SECOND ambiguity that's just as load-bearing as the first. Otherwise, return ready and roll up everything you've learned into constraints.`}

## Permitted question topics (intent, not execution)

- Audience / reader / user.
- Use case or decision the board supports.
- Angle / framing of the subject.
- Scope when the subject is huge ("the internet" → ask for the slice).
- A genuine shape fork (two very different shapes both fit, and the answer changes what gets built — e.g., timeline vs five-whys for a post-mortem).
- The subject if it's truly missing.

## Forbidden topics (the synth + planner decide these)

- Cell content style (rating vs descriptor — never).
- Counts: cards, columns, rows, bands, density.
- Specific col / row labels — the shape planner picks these.
- Which chrome.
- Connectors.
- Any execution detail a good practitioner would just default.

## Format rules

- ONE question per turn. Short (under 15 words ideally). Plain language. No compound questions.
- Suggestions are optional quick-replies (2–3 max). Always allow free text. Never force multiple choice.
- Never invent subject detail. If missing, ask briefly.
- ${isFirstTurn ? "This is your one and only chance to ask. After this turn the system finalizes regardless." : "Final turn — return ready now."}

## Constraints shape (when you return ready)

Return ONLY fields the user actually stated or plausibly confirmed. Common keys: subject, audience, scope, angle, use_case, must_include. Do not invent \`layout\`, \`columns\`, \`rows\`, \`bands\`, \`density\` — those belong to the shape planner. Flat string or string-array values only.

## Tone of questions

Phrase it like a sharp collaborator double-checking intent — not like a form. Examples of the bar:
- ✓ "Who's the main audience — founders, operators, or investors?"
- ✓ "Is this a timeline of the collapse, or a root-cause breakdown?"
- ✗ "For each of the 8 capability dimensions, should each cell contain a single rating/score, a brief descriptor, or a short comparative statement?" (execution detail, too long)

Call clarifier_turn with exactly one mode: question OR ready. On turn 0, ask unless the prompt already pins audience + angle + scope. After that, bias toward ready.`;
}

function buildUserMessage(input: ClarifierTurnInput): string {
  const parts: string[] = [];
  if (input.boardSnapshot && input.boardSnapshot.trim().length > 0) {
    parts.push(`## Current board (the user is iterating on this — preserve or restructure as their prompt implies)`);
    parts.push(input.boardSnapshot.trim());
    parts.push(``);
  }
  if (input.draftContract) {
    parts.push(`## Draft shape (from the shape planner — already decided; don't re-ask about these)`);
    parts.push(renderDraftForClarifier(input.draftContract));
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
  parts.push(
    `Call clarifier_turn now. On turn 0, default to asking ONE follow-up about audience / angle / scope / use case unless the prompt already pins those — the planner has the shape covered, but it can't infer who this is for or what slice the user actually cares about.`
  );
  return parts.join("\n");
}

/** Render a compact view of the planner's draft contract + its confidence
 *  flags so the clarifier can see what's already decided and where the
 *  actual gaps are. Kept short to preserve the clarifier's terse style. */
function renderDraftForClarifier(contract: ShapeContract): string {
  const lines: string[] = [];
  lines.push(`- subject: "${contract.subject}"  [confidence: ${contract.confidence?.subject ?? "?"}]`);
  lines.push(`- variant: ${contract.variant}  [confidence: ${contract.confidence?.variant ?? "?"}]`);
  if (contract.audience) lines.push(`- audience: ${contract.audience}`);
  lines.push(
    `- cols (${contract.axes.cols.length}): ${contract.axes.cols.map((c) => c.label).join(", ")}  [axes confidence: ${contract.confidence?.axes ?? "?"}]`
  );
  lines.push(
    `- rows (${contract.axes.rows.length}): ${contract.axes.rows.map((r) => r.label).join(", ")}`
  );
  if (contract.cellGroups && contract.cellGroups.length > 0) {
    lines.push(
      `- cellGroups (${contract.cellGroups.length}): ${contract.cellGroups.map((g) => g.label).join(" | ")}  [confidence: ${contract.confidence?.cellGroups ?? "?"}]`
    );
  }
  if (contract.chrome) lines.push(`- chrome: ${contract.chrome}`);
  lines.push(
    `- density: ${contract.density.min}–${contract.density.max} per cell  [confidence: ${contract.confidence?.density ?? "?"}]`
  );
  if (contract.enumerated.entities && contract.enumerated.entities.length > 0) {
    lines.push(`- enumerated entities: ${contract.enumerated.entities.join(", ")}`);
  }
  if (contract.enumerated.dimensions && contract.enumerated.dimensions.length > 0) {
    lines.push(`- enumerated dimensions: ${contract.enumerated.dimensions.join(", ")}`);
  }
  lines.push(`- rationale: ${contract.rationale}`);
  lines.push(``);
  lines.push(
    "The planner has the SHAPE handled. Use this draft to AVOID asking about col/row labels, variant, or chrome — those are settled. Your question (if any) should be about audience, angle, scope, or use case — the things the planner can't infer alone."
  );
  return lines.join("\n");
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
