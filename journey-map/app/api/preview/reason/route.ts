import { NextResponse } from "next/server";
import { postProcessExecutorOutput, type ActionFlags } from "@/lib/agents/post-process";
import {
  runFrameworkAction,
  type ReasonInput,
  type StructureHint,
} from "@/lib/agents/framework-reasoner";

export const runtime = "nodejs";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /api/preview/reason
//
// Single-call framework agent. Runs one Sonnet call with a framework-aware
// system prompt; post-processes the arrange_grid tool output. Returns plain
// JSON (no streaming — the call is fast enough that streaming adds complexity
// without benefit).
//
// Parallel orchestration: the CALLER fires multiple requests concurrently. The
// recreate-frameworks script does this with Promise.all across all 4 actions
// per framework × 2 frameworks = 8 parallel calls. Total wall-clock ≈ max
// single-call latency.
// ──────────────────────────────────────────────────────────────────────────────

type ReqBody = {
  frameworkName: string;
  instanceContext: string;
  task: string;
  structureHint?: StructureHint;
  cells: Array<{ id: string; row: number; col: number; text: string }>;
  edges: Array<{ id: string; fromId: string; toId: string; label?: string }>;
  clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
  flags: ActionFlags;
};

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.frameworkName || !body.task || !Array.isArray(body.cells) || body.cells.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing frameworkName / task / cells" },
      { status: 400 }
    );
  }

  const input: ReasonInput = {
    frameworkName: body.frameworkName,
    instanceContext: body.instanceContext ?? "",
    structureHint: body.structureHint,
    task: body.task,
    board: {
      cells: body.cells,
      edges: body.edges ?? [],
      clusters: body.clusters ?? [],
      rows: body.rows,
      cols: body.cols,
      rowLabels: body.rowLabels,
      colLabels: body.colLabels,
    },
    flags: body.flags ?? {},
  };

  let rawOutput;
  try {
    rawOutput = await runFrameworkAction(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Agent error: ${message}` }, { status: 502 });
  }

  let processed;
  try {
    processed = postProcessExecutorOutput({
      rawOutput,
      inputCells: body.cells,
      inputRows: body.rows,
      inputCols: body.cols,
      flags: body.flags ?? {},
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Post-process error: ${message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...processed });
}
