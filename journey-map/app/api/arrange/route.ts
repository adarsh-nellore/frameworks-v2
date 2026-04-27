import { NextResponse } from "next/server";
import { getFramework } from "@/lib/frameworks";
import { validateFrameworkConfig } from "@/lib/frameworks/custom/validate";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import { executeArrange } from "@/lib/frameworks/arrange-execute";
import { validateMap } from "@/lib/frameworks/universal";
import type { Op } from "@/lib/frameworks/universal/ops";

// Keys on card.meta that trigger positioned card rendering (Gantt bars,
// Cartesian dots, freeform absolute positions, shape-card chrome). When the
// active layout / renderingPlan doesn't opt into positioned rendering, these
// keys have no effect on render and only serve to confuse future turns — so
// we drop any arrange op that tries to set them. Values kept in sync with
// PresentedCard's inferPresentMode and FreeformLayout's shape-card schema.
const POSITIONING_META_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "shapeKind",
  "shapeWidth",
  "shapeHeight",
]);

/** True when the given config's layout+renderingPlan legitimately use
 *  positioned cards. Only then are meta.x/y/etc. respected by the renderer.
 *
 *  Clustered-variant boards (config.cellGroups present) are rendered as a
 *  regular grid with CellGroupChrome painting behind the cells — the grid
 *  owns geometry, NOT the agent. So clustered boards never allow positioning
 *  meta even if layout happens to be "freeform" (legacy configs). */
function layoutAllowsPositioning(config: FrameworkConfig): boolean {
  if (config.cellGroups && config.cellGroups.length > 0) return false;
  if (config.layout === "freeform") return true;
  const orientation = config.renderingPlan?.cardOrientation;
  return (
    orientation === "horizontal-bar" ||
    orientation === "dot" ||
    orientation === "mixed"
  );
}

/** Drop any op that would set positioning meta on a layout that doesn't use
 *  it. Returns the filtered ops plus a count of what was dropped so the
 *  caller can surface it in the summary. Silent filtering would be worse
 *  than useless — the client status banner should tell the user. */
function stripPositioningOps(
  ops: Op[],
  config: FrameworkConfig
): { ops: Op[]; stripped: number } {
  if (layoutAllowsPositioning(config)) return { ops, stripped: 0 };
  let stripped = 0;
  const kept: Op[] = [];
  for (const op of ops) {
    if (op.op === "setCardMeta" && POSITIONING_META_KEYS.has(op.key)) {
      stripped++;
      continue;
    }
    if (op.op === "addCard" && op.meta) {
      const cleanMeta: Record<string, string> = {};
      let hadPos = false;
      for (const [k, v] of Object.entries(op.meta)) {
        if (POSITIONING_META_KEYS.has(k)) {
          hadPos = true;
          continue;
        }
        cleanMeta[k] = v;
      }
      if (hadPos) stripped++;
      kept.push({ ...op, meta: Object.keys(cleanMeta).length ? cleanMeta : undefined });
      continue;
    }
    kept.push(op);
  }
  return { ops: kept, stripped };
}

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

  const { ops: filteredOps, stripped } = stripPositioningOps(result.ops, config);
  const summary =
    stripped > 0
      ? `${result.summary}\n(Dropped ${stripped} positioning op${stripped === 1 ? "" : "s"} that don't apply to this layout.)`
      : result.summary;
  return NextResponse.json({ summary, ops: filteredOps });
}
