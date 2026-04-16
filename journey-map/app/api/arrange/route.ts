import { NextResponse } from "next/server";
import { getFramework } from "@/lib/frameworks";
import { validateFrameworkConfig } from "@/lib/frameworks/custom/validate";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import { executeArrange } from "@/lib/frameworks/arrange-execute";
import { validateMap } from "@/lib/frameworks/universal";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// /api/arrange
//
// Thin HTTP wrapper around executeArrange. Accepts:
//   - frameworkId: id of the framework module to use (static or registered).
//   - customConfig (optional): FrameworkConfig for a dynamic/custom framework
//     that doesn't live in the static registry. Used when the Copilot is
//     talking to a user-synthesized framework. Server validates the config
//     then uses it via makeModule without persistent registration — the
//     registry is client-side (localStorage).
// ──────────────────────────────────────────────────────────────────────────────

type ReqBody = {
  frameworkId: string;
  map: unknown;
  instruction: string;
  focus?: unknown;
  /** Dynamic framework config for customs not in the static registry. */
  customConfig?: unknown;
};

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.frameworkId || !body?.map || typeof body.instruction !== "string") {
    return NextResponse.json(
      { error: "Expected { frameworkId, map, instruction }" },
      { status: 400 }
    );
  }

  // Resolve the framework: static registry first, then customConfig fallback.
  let config: FrameworkConfig;
  try {
    config = getFramework(body.frameworkId).config;
  } catch {
    if (!body.customConfig) {
      return NextResponse.json(
        { error: `Unknown framework id: ${body.frameworkId}` },
        { status: 400 }
      );
    }
    const v = validateFrameworkConfig(body.customConfig);
    if (!v.ok) {
      return NextResponse.json(
        { error: `Invalid customConfig: ${v.reason}` },
        { status: 400 }
      );
    }
    config = v.config;
  }

  // Validate map up-front so we can return 400 (user error) separately from
  // 502 (agent error). executeArrange will validate again internally.
  const mapValidation = validateMap(body.map);
  if (!mapValidation.ok) {
    return NextResponse.json(
      { error: `Invalid map: ${mapValidation.reason}` },
      { status: 400 }
    );
  }

  const result = await executeArrange({
    map: mapValidation.map,
    config,
    instruction: body.instruction,
    focus: body.focus,
  });

  if (!result.ok) {
    // Distinguish the narrow "user-error" cases from agent-side failures.
    const isUserError = /^Invalid (map|focus)/.test(result.error);
    const status = isUserError ? 400 : 502;
    const payload: Record<string, unknown> = { error: result.error };
    if (result.ops) payload.ops = result.ops;
    if (result.failedAtIndex !== undefined) payload.failedAtIndex = result.failedAtIndex;
    return NextResponse.json(payload, { status });
  }

  return NextResponse.json({ summary: result.summary, ops: result.ops });
}
