import { NextResponse } from "next/server";
import { ingestSources, IngestionError, type RawInput } from "@/lib/ingestion";
import { buildSourceDigest, type SourceDigest } from "@/lib/agents/source-digest";
import {
  runClarifierTurn,
  type ClarifierTurnPair,
  type ClarifierTurnResult,
} from "@/lib/agents/prompt-clarifier";

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

  const result = await runClarifierTurn({
    prompt,
    transcript: [],
    sourceDigest,
  });

  return NextResponse.json({ ok: true, ...serializeResult(result), sourceDigest });
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

  const result = await runClarifierTurn({
    prompt: body.prompt,
    transcript,
    sourceDigest,
    boardSnapshot: typeof body.boardSnapshot === "string" ? body.boardSnapshot : undefined,
  });

  return NextResponse.json({ ok: true, ...serializeResult(result), sourceDigest });
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
