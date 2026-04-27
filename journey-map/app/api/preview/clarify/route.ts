import { NextResponse } from "next/server";
import { ingestSources, IngestionError, type RawInput } from "@/lib/ingestion";
import { buildSourceDigest, type SourceDigest } from "@/lib/agents/source-digest";
import {
  runClarifierTurn,
  type ClarifierTurnPair,
  type ClarifierTurnResult,
} from "@/lib/agents/prompt-clarifier";
import {
  runShapePlanner,
  type ExistingBoardForPlanner,
} from "@/lib/agents/shape-planner";
import type { ShapeContract } from "@/lib/frameworks/shape-contract";

export const runtime = "nodejs";
export const maxDuration = 15;

// ──────────────────────────────────────────────────────────────────────────────
// /api/preview/clarify
//
// One clarifier turn. Supports two request shapes:
//
//   Turn 1 (FormData) — carries the user's prompt + attached files/URLs. We
//     ingest server-side, build a source digest, run the first turn, and
//     return the digest alongside the turn so the client can reuse it on
//     subsequent turns without re-uploading files.
//
//   Turns 2..N (JSON) — client sends { prompt, transcript, sourceDigest }.
//     No files. We trust the digest returned on turn 1.
//
// On any internal failure we return a degenerate "ready: true" with a
// best-effort constraints object so the caller can still proceed with
// generation instead of being blocked.
// ──────────────────────────────────────────────────────────────────────────────

type JsonBody = {
  prompt: string;
  transcript?: ClarifierTurnPair[];
  sourceDigest?: SourceDigest;
  /** Optional — when iterating inside FrameworkGridStage, pass a text
   *  snapshot of the current board so the clarifier can ask targeted
   *  questions grounded in what already exists. */
  boardSnapshot?: string;
  /** Optional — when reshaping an existing board, pass its full content
   *  in structured form so the planner pins every existing entity as
   *  enumerated content. Without this the planner invents replacements to
   *  match a new shape (e.g., listing "GPT-4 Turbo, Llama 2 7B" on a 2×2
   *  reshape of a board that originally listed Anthropic, OpenAI, etc.). */
  existingBoard?: ExistingBoardForPlanner;
};

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleTurnOne(req);
    }
    return await handleSubsequentTurn(req);
  } catch (err) {
    const message =
      err instanceof IngestionError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.warn("[preview/clarify] failing soft to ready:", message);
    return NextResponse.json(
      {
        ok: true,
        ready: true,
        constraints: { notes: [message] },
        sourceDigest: { text: "", meta: { csvs: [], sourceCount: 0 } },
        error: message,
      },
      { status: 200 }
    );
  }
}

async function handleTurnOne(req: Request): Promise<Response> {
  const fd = await req.formData();
  const prompt = ((fd.get("prompt") as string | null) ?? "").toString();

  const inputs: RawInput[] = [];
  const pasted = fd.get("text") as string | null;
  if (pasted && pasted.trim().length > 0) {
    inputs.push({ type: "paste", text: pasted, name: "Pasted notes" });
  }
  for (const [key, value] of fd.entries()) {
    if (value instanceof File && value.size > 0 && (key === "file" || /^file_\d+$/.test(key))) {
      inputs.push({ type: "file", file: value, name: value.name });
    }
  }
  for (const [key, value] of fd.entries()) {
    if (typeof value === "string" && value.trim() && (key === "url" || /^url_\d+$/.test(key))) {
      inputs.push({ type: "url", url: value.trim() });
    }
  }

  const sources = inputs.length > 0 ? await ingestSources(inputs) : [];
  const sourceDigest = buildSourceDigest(sources);

  // Plan-first ordering: the shape planner runs in parallel with the
  // clarifier so /api/generate can reuse the contract (skipping a redundant
  // ~25s replan). On turn 0 we always let the clarifier speak — the user
  // wants at least one substantive follow-up about audience / scope / angle
  // even when the planner is confident about shape. The contract is returned
  // alongside so the client can pass it through to /api/generate.
  const [draftContract, result] = await Promise.all([
    planDraft(prompt, sourceDigest),
    runClarifierTurn({
      prompt,
      transcript: [],
      sourceDigest,
      // Resolved below — the planner result is awaited above before we
      // consult it, so the clarifier sees no draft on turn 0. That's
      // intentional: we want the clarifier to ask its own opening question
      // grounded in the user's prompt, not parrot the planner's draft.
      draftContract: null,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    ...serializeResult(result),
    sourceDigest,
    contract: draftContract ?? undefined,
  });
}

async function handleSubsequentTurn(req: Request): Promise<Response> {
  let body: JsonBody;
  try {
    body = (await req.json()) as JsonBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body?.prompt !== "string") {
    return NextResponse.json(
      { ok: false, error: "Expected { prompt: string, transcript?, sourceDigest? }" },
      { status: 400 }
    );
  }

  const transcript = Array.isArray(body.transcript) ? sanitizeTranscript(body.transcript) : [];
  const sourceDigest: SourceDigest =
    body.sourceDigest && typeof body.sourceDigest.text === "string"
      ? body.sourceDigest
      : { text: "", meta: { csvs: [], sourceCount: 0 } };

  // Iteration turns: replan + reclarify in parallel. The planner sees the
  // transcript so the contract reflects answered questions. The clarifier
  // gets the draft contract this time — by turn 1+ it's reasonable for the
  // clarifier to defer to the planner on anything the planner is confident
  // about, and only ask about a remaining low-confidence field. The
  // MAX_TURNS cap inside runClarifierTurn enforces convergence. When the
  // user is reshaping an existing board, the planner also sees the full
  // card list so its enumerated-entities rule pins them into the new
  // shape.
  const combinedPrompt = transcript.length > 0
    ? `${body.prompt.trim()}\n\n# Clarifier transcript\n${transcript.map((p, i) => `Q${i + 1}: ${p.question}\nA${i + 1}: ${p.answer}`).join("\n")}`
    : body.prompt.trim();
  const existingBoard = sanitizeExistingBoard(body.existingBoard);
  const draftContract = await planDraft(combinedPrompt, sourceDigest, existingBoard);

  const result = await runClarifierTurn({
    prompt: body.prompt,
    transcript,
    sourceDigest,
    boardSnapshot: typeof body.boardSnapshot === "string" ? body.boardSnapshot : undefined,
    draftContract,
  });

  return NextResponse.json({
    ok: true,
    ...serializeResult(result),
    sourceDigest,
    contract: draftContract ?? undefined,
  });
}

function serializeResult(result: ClarifierTurnResult) {
  if (result.ready) {
    return { ready: true as const, constraints: result.constraints };
  }
  return { ready: false as const, question: result.question };
}

function sanitizeTranscript(input: unknown[]): ClarifierTurnPair[] {
  const out: ClarifierTurnPair[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const q = typeof obj.question === "string" ? obj.question.trim() : "";
    const a = typeof obj.answer === "string" ? obj.answer.trim() : "";
    if (!q || !a) continue;
    out.push({ question: q, answer: a });
  }
  return out.slice(0, 8);
}

// ──────────────────────────────────────────────────────────────────────────────
// Plan-first clarifier helpers (Phase 2).
// ──────────────────────────────────────────────────────────────────────────────

async function planDraft(
  prompt: string,
  digest: SourceDigest,
  existingBoard?: ExistingBoardForPlanner
): Promise<ShapeContract | null> {
  try {
    return (
      (await runShapePlanner({
        description: prompt.trim(),
        sourcesSummary: digest.text,
        existingBoard,
      })) ?? null
    );
  } catch (e) {
    console.warn("[preview/clarify] draft planner failed:", e);
    return null;
  }
}

function sanitizeExistingBoard(
  raw: unknown
): ExistingBoardForPlanner | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const cardsRaw = Array.isArray(r.cards) ? r.cards : [];
  const cards: Array<{ col: string; row: string; text: string }> = [];
  for (const c of cardsRaw) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const col = typeof o.col === "string" ? o.col.trim() : "";
    const row = typeof o.row === "string" ? o.row.trim() : "";
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    cards.push({ col, row, text });
  }
  if (cards.length === 0) return undefined;
  const out: ExistingBoardForPlanner = { cards };
  if (typeof r.title === "string" && r.title.trim()) out.title = r.title.trim();
  if (Array.isArray(r.cols)) {
    out.cols = r.cols.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  }
  if (Array.isArray(r.rows)) {
    out.rows = r.rows.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  }
  return out;
}

