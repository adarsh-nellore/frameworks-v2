import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import { executeArrange } from "@/lib/frameworks/arrange-execute";
import { validateFrameworkConfig } from "@/lib/frameworks/custom/validate";
import {
  proposeFrameworkToolDescription,
  proposeFrameworkToolName,
  proposeFrameworkToolSchema,
} from "@/lib/frameworks/custom/tool";
import { buildDescribeSystemPrompt } from "@/lib/frameworks/custom/prompt";
import { applyOps } from "@/lib/frameworks/universal";
import { buildSourceContentBlocks } from "@/lib/pipeline/source-content";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { IngestedSource } from "@/lib/ingestion";

// ──────────────────────────────────────────────────────────────────────────────
// Shared synthesis helper
//
// Both /api/framework-describe (describe dialog + canvas describe flow) and
// /api/generate (auto mode) call this to turn a natural-language description
// into a fully populated UniversalMap via:
//   1. Claude emits a FrameworkConfig via propose_framework tool.
//   2. validateFrameworkConfig normalizes + semantic-checks.
//   3. executeArrange populates the empty seed.
//   4. applyOps yields the populated map.
//
// Warnings are non-fatal (e.g. a populate step that failed cleanly leaves
// the seed empty but still returns a valid config). Fatal errors throw.
// ──────────────────────────────────────────────────────────────────────────────

export type SynthesizeInput = {
  description: string;
  sources: IngestedSource[];
  existingIds: string[];
};

export type SynthesizeResult = {
  config: FrameworkConfig;
  populatedMap: UniversalMap;
  populationSummary?: string;
  opsCount: number;
  warnings: string[];
};

export async function synthesizeFramework(
  input: SynthesizeInput
): Promise<SynthesizeResult> {
  const { description, sources, existingIds } = input;
  const warnings: string[] = [];

  // ── 1. Synthesize the FrameworkConfig via propose_framework tool ─────────
  const configInput = await proposeConfig(description, sources);

  // ── 2. Validate + normalize the config ───────────────────────────────────
  const v = validateFrameworkConfig(configInput, existingIds);
  if (!v.ok) {
    throw new Error(`Agent produced an invalid config: ${v.reason}`);
  }
  const config = v.config;

  // Dev-time visibility — useful for diagnosing process/flow generations that
  // come back without arrows, or matrix layouts without expected chrome.
  console.log(
    `[synthesize] ${config.id} (${config.label}) — layout=${config.layout}` +
      ` chrome=${config.chrome?.kind ?? "none"}` +
      ` connectors=${config.connectors?.enabled === true}` +
      (config.connectors?.allowedKinds
        ? ` kinds=[${config.connectors.allowedKinds.join(", ")}]`
        : "")
  );

  // ── 3. Populate the empty seed ──────────────────────────────────────────
  let populatedMap = config.seed;
  let populationSummary: string | undefined;
  let opsCount = 0;

  const populateInstruction = populateInstructionFor(config, sources.length > 0);
  const populateResult = await executeArrange({
    map: config.seed,
    config,
    instruction: populateInstruction,
    sources: sources.length > 0 ? sources : undefined,
  });

  if (populateResult.ok) {
    const applied = applyOps(config.seed, populateResult.ops);
    if (applied.ok) {
      populatedMap = applied.map;
      populationSummary = populateResult.summary;
      opsCount = populateResult.ops.length;
      const connectorOps = populateResult.ops.filter(
        (o) => (o as { op?: string }).op === "addConnector"
      ).length;
      console.log(
        `[synthesize] populate ok — ${populateResult.ops.length} ops (${connectorOps} addConnector)`
      );
    } else {
      warnings.push(
        `Populate ops couldn't apply cleanly (${applied.reason}); seed left empty.`
      );
      console.error(
        `[synthesize] populate applyOps failed at index ${applied.failedAtIndex}: ${applied.reason}`
      );
    }
  } else {
    warnings.push(`Populate step failed: ${populateResult.error}. Seed left empty.`);
    console.error(`[synthesize] populate step failed: ${populateResult.error}`);
  }

  return {
    config,
    populatedMap,
    populationSummary,
    opsCount,
    warnings,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 1: propose_framework tool call (Claude)
// ──────────────────────────────────────────────────────────────────────────────

async function proposeConfig(
  description: string,
  sources: IngestedSource[]
): Promise<unknown> {
  const anthropic = getAnthropic();
  const systemPrompt = buildDescribeSystemPrompt();
  const hasSources = sources.length > 0;
  const userText = hasSources
    ? `User description: ${description}

Use the source material attached above to inform the framework choice and structure — the populate step will fill cards from this content. Design columns/rows that match the shape of what you see. Return a FrameworkConfig via the propose_framework tool.`
    : `User description: ${description}

Return a FrameworkConfig via the propose_framework tool.`;

  const sourceBlocks = buildSourceContentBlocks(sources);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = hasSources
    ? [...sourceBlocks, { type: "text", text: userText }]
    : [{ type: "text", text: userText }];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createParams: any = {
    model: getAgentModel(),
    max_tokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      {
        name: proposeFrameworkToolName,
        description: proposeFrameworkToolDescription,
        input_schema: proposeFrameworkToolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userContent }],
  };

  const msg = await anthropic.messages.create(createParams);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Agent did not return a tool call");
  }
  return tool.input;
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 3: Populate instruction template — tuned per layout, and enriched with
// source material when present so the agent pulls specific cards from it.
// ──────────────────────────────────────────────────────────────────────────────

function populateInstructionFor(config: FrameworkConfig, hasSources: boolean): string {
  const base = hasSources
    ? `Populate this framework with specific content drawn from the source material attached to this conversation. Cards should be concrete quotes, findings, or data points from the sources (8–16 words each). Do NOT invent content — stay grounded in what the sources say.

`
    : `Populate this framework with realistic example content that a user would see as a useful starting point. Keep cards specific and concrete (8–16 words each). `;

  // Top-priority visual directive — the renderingPlan summary is the BRIDGE
  // between the agent's semantic reasoning (structuringPrompt) and per-card
  // execution (what meta.x / meta.y / meta.width to set). We prepend it and
  // then append orientation-specific positioning rules when relevant.
  const plan = config.renderingPlan;
  const visualBrief = plan
    ? `\n\n**Visual brief (read carefully before emitting any cards).** ${plan.summary}\n\n` +
      positioningRules(plan)
    : "";

  const connectorNudge = config.connectors?.enabled
    ? `

**This framework uses connectors — reason about them carefully.** Arrows are not decoration; they encode the actual logic of the work. Before emitting any \`addConnector\` op, think through the process:

1. **Trace the real flow.** Start from the trigger (often a \`start\` or first-phase card) and follow the work as it actually happens: "When this step finishes, what happens next, and who does it?" That next card — regardless of whether it's in the same row or phase — is the target of your connector. Don't connect by visual adjacency; connect by causality.
2. **Handoffs cross swimlanes.** If the next step is done by a different actor/system (different row), emit a \`handoff\`. If it stays in the same row, emit a \`sequence\`. A single card may hand off to multiple downstream cards in different lanes — emit one connector per real handoff.
3. **Decisions branch on conditions.** For every card with \`meta.stepKind: "decision"\`, decide the two real outcomes (approved/denied, eligible/ineligible, success/failure, in-scope/out-of-scope) and emit \`decision-yes\` + \`decision-no\` to the two distinct downstream cards. Put the actual condition in \`label\` (e.g. \`"approved"\`, \`"over $5k"\`, \`"SLA exceeded"\`) — not just "yes"/"no" if the real label carries more information.
4. **Loops and retries are real.** If rejection, denial, or missing-info routes work back to an earlier step, emit that backward connector. Don't force a linear left-to-right graph if the process genuinely cycles.
5. **Parallel branches are real.** A card may fan out to multiple concurrent next steps (e.g. "approved" triggers both "provision access" and "notify requester"). Emit one connector per branch.
6. **Coverage, not completeness.** Every non-terminal card (start/task/decision) should have at least one outgoing connector. Terminal cards (\`stepKind: "end"\`) need none. If a card has no plausible next step, mark it as \`end\`.

Set \`meta.stepKind\` on cards via the \`meta\` field on \`addCard\` (\`"start" | "task" | "decision" | "end"\`) so the UI distinguishes node types. Emit connectors AFTER all cards exist so every source and target id is valid when the connector op runs.`
    : "";

  if (config.layout === "matrix") {
    return base + visualBrief + "Aim for 2–4 items in every cell — this is a dense grid where every (col, row) position should be filled." + connectorNudge;
  }
  if (config.layout === "kanban") {
    return base + visualBrief + "Each column should hold 3–7 cards. If the framework naturally has sub-items (e.g. checklist items under a goal, quotes under a theme), use sub-items via addCard with parentCardId for the nested detail." + connectorNudge;
  }
  if (config.layout === "freeform") {
    return (
      base +
      visualBrief +
      `
**This is a freeform spatial framework.** Freeform WITHOUT region chrome becomes a card soup. You MUST decide what shape cards to emit before placing content:

**Case A — named thematic regions** (post-mortems, strategy boards, opportunity landscapes, exec planning boards, anything with N named clusters of ideas that don't map to clean x/y axes):
- Emit ONE \`rectangle\` shape card per region. The card's text is the region label (e.g., "Root Causes", "Warning Signs", "Founder Decisions").
- Lay the rectangles out on a 1600×1000 canvas in a clean grid. Common layouts: 2×3 (3 rectangles wide × 2 tall, each ~500×450 with 40px gaps), 3×2, 4×1 strip, or center+petals for hub-and-spoke topics.
- Each rectangle should be ~500×450px typical, 600×500 if dense. Leave 40–60px between rectangles so labels and cards inside don't collide.
- Then emit 4–8 content cards inside each region, setting \`meta.x\`/\`meta.y\` so they sit INSIDE the rectangle's bounding box with ~30px interior padding. Stack content cards vertically inside the region, 2 columns × 3–4 rows per region when there are many.
- **Check the description for a \`# Shape plan (authoritative)\` block.** If it lists \`regions:\`, emit EXACTLY those regions as rectangle shape cards in the order given. If \`regionLayout\` is specified (e.g., "3x2 grid"), follow it literally.

**Case B — named geometric diagram** (Double Diamond → two diamonds; Venn/Ikigai → overlapping circles; Kano Model → horizontal bands):
- Emit the diagram-appropriate shape cards (\`diamond\`, \`circle\`, \`ellipse\`, or \`rectangle\`) with meaningful overlap/positioning.
- Place content cards inside or on the boundaries of their shape.

**Case C — loose mind-map / brainstorm without implied geometry**:
- Skip shape cards entirely. Place 8–15 content cards with x/y clustered by col.

In all cases: emit shape cards FIRST (lower z-order = background), content cards second. Pick a col id for each content card based on which shape / region it belongs to (this is how AI later rearrangements track regional intent).
      `.trim()
    );
  }
  // Default: grid layout.
  return base + visualBrief + "Target ~50–70% fill across (col, row) positions; leave cells empty where there is no genuine insight. Use sub-items when a card has naturally nested detail." + connectorNudge;
}

// Orientation-specific positioning rules. The visual brief in renderingPlan.summary
// already tells the agent what the target looks like; these rules nail down the
// exact meta keys to set so the renderer can honor the intent.
function positioningRules(plan: NonNullable<FrameworkConfig["renderingPlan"]>): string {
  if (
    plan.cardOrientation === "horizontal-bar" &&
    plan.spatialContinuity === "axis-continuous"
  ) {
    return `**Positioning is REQUIRED on every task card.** Each card's position inside its (colId, rowId) cell is what makes this framework read correctly.
- Each col is ~200 pixels wide. Set \`meta.x\` on every card: pixel offset from the LEFT edge of its starting col. A task that starts at the beginning of its col has \`meta.x = "0"\`; one that starts halfway through has \`meta.x = "100"\`.
- Set \`meta.width\` on every non-milestone card: pixel span the bar covers. A task that spans two cols has \`meta.width = "400"\`. A task filling half of one col has \`meta.width = "100"\`.
- Milestone convention: set \`meta.width = "0"\` on milestone cards — they render as a diamond marker at meta.x rather than a bar.
- If a task conceptually spans multiple cols, anchor it to its STARTING col via \`colId\`, then let \`meta.width\` extend it visually past the col boundary.
`;
  }
  if (
    plan.cardOrientation === "dot" &&
    plan.spatialContinuity === "xy-continuous"
  ) {
    return `**Positioning is REQUIRED on every entity card.** Each card's (x, y) inside the plot area is what makes this framework read correctly.
- Set \`meta.x\` AND \`meta.y\` on every card. Both are pixels from the top-left of the overall plot area, 0–1000 each.
- Distribute entities across the plot so clusters and outliers are visible. Do NOT pile dots on top of each other; nudge positions 10–20px apart if two entities score similarly.
- The (colId, rowId) cell is still semantic (which quadrant this entity falls into), but the exact visual position comes from meta.x / meta.y.
`;
  }
  if (plan.cardOrientation === "dot" && plan.spatialContinuity === "axis-continuous") {
    return `**Positioning is REQUIRED on every event card.** \`meta.x\` places the dot along the single continuous axis (within its col). \`meta.y\` is optional — use it to stagger events on the same axis position.
`;
  }
  // stacked + cell-discrete or any other combination: no positioning rules.
  return "";
}
