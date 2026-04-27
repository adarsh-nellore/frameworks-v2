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
import {
  diffContract,
  renderContractBlock,
  type ShapeContract,
} from "@/lib/frameworks/shape-contract";
import {
  canParallelPopulate,
  runParallelPopulate,
  type PopulateScope,
} from "@/lib/frameworks/populate-parallel";
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
  /** Optional typed contract from the shape planner. When present, the
   *  description already carries `renderContractBlock(contract)`; the
   *  contract is used here only for post-hoc validation (Phase 5 retry
   *  diff). Synth prompts read the contract from the description text. */
  contract?: ShapeContract;
  /** Optional progress hooks for the parallel populate stage — callers
   *  (e.g. /api/generate's stream) can surface per-scope progress. Fired
   *  only on the parallel path; the legacy single-call path emits no
   *  intermediate signals. */
  onScopeStart?: (scope: PopulateScope, total: number) => void;
  onScopeDone?: (scope: PopulateScope, opsCount: number) => void;
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
  const { description, sources, existingIds, contract } = input;
  const warnings: string[] = [];

  // ── 1. Synthesize the FrameworkConfig via propose_framework tool ─────────
  const configInput = await proposeConfig(description, sources);

  // ── 2. Validate + normalize the config ───────────────────────────────────
  const v = validateFrameworkConfig(configInput, existingIds);
  if (!v.ok) {
    throw new Error(`Agent produced an invalid config: ${v.reason}`);
  }
  let config = v.config;

  // Stamp cellGroups from the contract onto the config. The synth agent
  // never emits cellGroups (it's not in the tool schema); the renderer reads
  // them to draw CellGroupChrome behind the grouped cells. Skip when the
  // contract has no groups or the variant isn't clustered.
  if (contract && contract.variant === "clustered" && contract.cellGroups && contract.cellGroups.length > 0) {
    config = {
      ...config,
      cellGroups: contract.cellGroups.map((g) => ({
        id: g.id,
        label: g.label,
        cells: g.cells.map((cell) => ({ colId: cell.colId, rowId: cell.rowId })),
        ...(g.chromeStyle ? { chromeStyle: g.chromeStyle } : {}),
      })),
      ...(contract.cellGroupLayoutHint
        ? { cellGroupLayoutHint: contract.cellGroupLayoutHint }
        : {}),
    };
  }

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
  let populateOk = false;
  let populateError: string | null = null;

  const populateInstruction = populateInstructionFor(
    config,
    sources.length > 0,
    contract
  );

  // Parallel populate path — split by scope (row / col / cell-group) and run
  // a small Haiku worker per scope concurrently. Disabled when connectors
  // are required (cross-scope graph) or when there's only one scope. We
  // also fall back to sequential whenever any non-text source is attached
  // (PDF / image / file) because workers don't currently receive source
  // content blocks — the single-call path needs them in scope to ground
  // cards. Text-only sources (paste of the prompt itself) are fine; their
  // content is already baked into the populate instruction.
  const hasMediaSources = sources.some((s) => s.kind === "pdf" || s.kind === "image");
  const useParallel = canParallelPopulate(config, contract) && !hasMediaSources;
  if (useParallel) {
    const t0 = Date.now();
    const parallel = await runParallelPopulate({
      config,
      baseInstruction: populateInstruction,
      contract,
      onScopeStart: input.onScopeStart,
      onScopeDone: input.onScopeDone,
    });
    if (parallel.ok) {
      const applied = applyOps(config.seed, parallel.ops);
      if (applied.ok) {
        populatedMap = applied.map;
        populationSummary = parallel.perScopeSummaries.join(" · ");
        opsCount = parallel.ops.length;
        populateOk = true;
        console.log(
          `[synthesize] parallel populate ok — ${parallel.ops.length} ops across ${parallel.perScopeSummaries.length} scopes (${parallel.failedScopes} failed) in ${Date.now() - t0}ms`
        );
      } else {
        populateError = `Parallel ops couldn't apply (${applied.reason})`;
        console.warn(
          `[synthesize] parallel applyOps failed at index ${applied.failedAtIndex}: ${applied.reason} — falling back to single-call populate`
        );
      }
    } else {
      populateError = parallel.error;
      console.warn(
        `[synthesize] parallel populate failed (${parallel.error}) — falling back to single-call populate`
      );
    }
  }

  // Legacy single-call populate. Runs when parallel is disabled OR when
  // parallel failed (fallback). The retry-with-corrective-signal block
  // below catches both first-attempt-empty and parallel-fallback-empty.
  if (!populateOk) {
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
        populateOk = true;
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
  } else if (populateError) {
    // Parallel succeeded after all (above branch ran) — surface the earlier
    // error as a warning so it shows up in debug output without blocking.
    warnings.push(`Parallel populate had a recovered error: ${populateError}`);
  }

  // If populate produced too few cards relative to the contract's minimum
  // density (or 3 when no contract), retry ONCE with a CORRECTIVE signal —
  // not just "try harder". We compute the exact diff (which cells are
  // empty, which are below density.min) and embed it in the retry prompt so
  // the agent can target the gaps rather than re-hallucinate.
  const topLevelCount = populatedMap.cards.filter((c) => !c.parentCardId).length;
  const minRequired = contract
    ? Math.max(3, contract.density.min * Math.max(1, contract.axes.cols.length * contract.axes.rows.length) / 3)
    : 3;
  if (topLevelCount < minRequired) {
    const reason = populateOk
      ? `the populate pass left only ${topLevelCount} cards`
      : `populate did not produce a valid result${populateError ? ` (${populateError})` : ""}`;
    console.warn(
      `[synthesize] retrying populate — ${reason}; first pass left ${topLevelCount} top-level cards (min required ${Math.ceil(minRequired)})`
    );
    const correctiveSignal = contract
      ? buildContractRetrySignal(populatedMap, contract, config)
      : "";
    const retry = await executeArrange({
      map: config.seed,
      config,
      instruction: `${populateInstruction}

**RETRY REQUIRED — corrective signal below**

Your previous attempt produced too few cards. Do not re-hallucinate a new shape. Target the gaps named below.

${correctiveSignal || `You MUST emit a comprehensive set of \`addCard\` ops this turn — at least one card per (col, row) position where content naturally belongs, more where the framework calls for density. Do not return an empty or near-empty ops array. If you were uncertain about phrasing, use plausible practitioner language; the user can refine later.`}`,
      sources: sources.length > 0 ? sources : undefined,
    });
    if (retry.ok) {
      const retried = applyOps(config.seed, retry.ops);
      if (retried.ok && retried.map.cards.length > populatedMap.cards.length) {
        populatedMap = retried.map;
        populationSummary = retry.summary;
        opsCount = retry.ops.length;
        warnings.push("Populate retried once after an empty first pass.");
        console.log(
          `[synthesize] populate retry ok — ${retry.ops.length} ops, ${retried.map.cards.length} final cards`
        );
      } else {
        console.error(
          `[synthesize] populate retry still insufficient — ${retried.ok ? retried.map.cards.length + " cards" : "applyOps failed: " + retried.reason}`
        );
      }
    } else {
      console.error(`[synthesize] populate retry step failed: ${retry.error}`);
    }
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
// Contract-aware retry signal. When the first populate attempt came up short,
// we compute a structured diff against the contract and hand the agent the
// specific cells it missed — targeted, not scolding. Empty string when the
// contract is absent (legacy retry path stays in place).
// ──────────────────────────────────────────────────────────────────────────────

function buildContractRetrySignal(
  map: UniversalMap,
  contract: ShapeContract,
  config: FrameworkConfig
): string {
  const diff = diffContract(map, contract);
  const lines: string[] = [];
  if (diff.missingCells.length > 0) {
    const labelled = diff.missingCells.map((cell) => {
      const colLabel = config.seed.cols.find((c) => c.id === cell.colId)?.label ?? cell.colId;
      const rowLabel = config.seed.rows.find((r) => r.id === cell.rowId)?.label ?? cell.rowId;
      return `  - colId=${cell.colId} (${colLabel}) × rowId=${cell.rowId} (${rowLabel})`;
    });
    lines.push(`**Empty cells requiring at least ${contract.density.min} card(s) each (${diff.missingCells.length} total):**`);
    lines.push(...labelled);
  }
  if (diff.underfilledCells.length > 0) {
    lines.push(``);
    lines.push(`**Underfilled cells (have fewer than ${contract.density.min}):**`);
    for (const { cellRef, have, need } of diff.underfilledCells) {
      const colLabel = config.seed.cols.find((c) => c.id === cellRef.colId)?.label ?? cellRef.colId;
      const rowLabel = config.seed.rows.find((r) => r.id === cellRef.rowId)?.label ?? cellRef.rowId;
      lines.push(`  - (${colLabel} × ${rowLabel}): have ${have}, need ≥ ${need}`);
    }
  }
  if (lines.length === 0) return "";
  lines.push(``);
  lines.push(
    `Emit one \`addCard\` op per missing cell (colId + rowId must match exactly). Use plausible domain language; the user can refine later. Do not invent labels outside the enumerated list when one is present in the Contract block.`
  );
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 3: Populate instruction template — tuned per layout, and enriched with
// source material when present so the agent pulls specific cards from it.
// ──────────────────────────────────────────────────────────────────────────────

function populateInstructionFor(
  config: FrameworkConfig,
  hasSources: boolean,
  contract?: ShapeContract
): string {
  // The contract block — SAME text that was embedded into the synth
  // description — must also be in the populate instruction so the universal
  // prompt's "honor the # Contract block" rule has something to honor. Without
  // this the populate agent sees the rule but can't find the block and ends
  // up emitting zero ops.
  const contractBlock = contract ? `${renderContractBlock(contract)}\n\n` : "";

  const base = hasSources
    ? `${contractBlock}Populate this framework with specific content drawn from the source material attached to this conversation. Cards should be concrete quotes, findings, or data points from the sources (8–16 words each). Do NOT invent content — stay grounded in what the sources say.

`
    : `${contractBlock}Populate this framework with realistic example content that a user would see as a useful starting point. Keep cards specific and concrete (8–16 words each). `;

  // Reshape preservation rule — when the description carries a `# Existing
  // board` block, every named entity / observation from there is enumerated
  // content the populate agent MUST reuse. The rule complements the contract
  // block; together they pin both the new shape and the existing content.
  const preservation = `

**If the description contains a \`# Existing board\` block, treat that block as your CONTENT SOURCE — the user is RESHAPING, not regenerating.** Hard rules:

1. **Every original entity name must appear on the new shape.** If the original board listed Anthropic, OpenAI, Google DeepMind, Meta, Mistral, xAI as rows / entities, those exact names must be the entities on the new shape — placed as cards within the new (col, row) cells that best characterize them on the new axes.
2. **Each original observation should land somewhere on the new shape.** Pull card text DIRECTLY from the existing-board cards (verbatim quotes preferred; light edits only when the new axes change the angle). If the new shape has fewer cells than original cards, stack multiple cards per cell — do not truncate the data.
3. **DO NOT invent fresh entities to fit the new layout.** A reshape from "labs × dimensions" to "speed × reasoning" does NOT mean replacing labs with model names — it means positioning the same labs (and their original observations) on the new axes.
4. **Honor the contract's \`enumerated.entities\`** when present — that list is the closed set of entity names. If you find yourself emitting an entity not in that list, you've gone off-script.
5. **Density**: emit at least \`enumerated.entities.length\` cards if entities are listed, or one card per existing-board entry, whichever is smaller. Match \`density.target\` per cell; if there's not enough cells for everything, prefer stacking over dropping cards.`;

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
    return base + preservation + visualBrief + "Aim for 2–4 items in every cell — this is a dense grid where every (col, row) position should be filled." + connectorNudge;
  }
  if (config.layout === "kanban") {
    return base + preservation + visualBrief + "Each column should hold 3–7 cards. If the framework naturally has sub-items (e.g. checklist items under a goal, quotes under a theme), use sub-items via addCard with parentCardId for the nested detail." + connectorNudge;
  }
  if (config.layout === "freeform") {
    return (
      base +
      preservation +
      visualBrief +
      `
**Legacy freeform path.** Emit regular grid-style cards — 4–6 per (colId, rowId) cell. DO NOT set \`meta.x\`, \`meta.y\`, \`meta.shapeKind\`, \`meta.shapeWidth\`, or \`meta.shapeHeight\` on any card. Absolute positioning is no longer part of the AI path; the grid renderer owns geometry.

If the Contract block (\`# Contract (authoritative — honor exactly)\`) lists \`cellGroups:\`, place cards into the cells that belong to each group so the cluster chrome groups them visually.
      `.trim()
    );
  }
  // Default: grid layout.
  return base + preservation + visualBrief + "Target ~50–70% fill across (col, row) positions; leave cells empty where there is no genuine insight. Use sub-items when a card has naturally nested detail." + connectorNudge;
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
