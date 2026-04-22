#!/usr/bin/env node
// Direct test of the context-based agent actions on the three preview datasets.
// Calls Claude with the exact prompts from app/api/preview/rearrange/route.ts
// and prints raw tool outputs. No dev server required.
//
// Usage:
//   ANTHROPIC_API_KEY=... node scripts/test-agent-actions.mjs [action] [dataset]
//   ANTHROPIC_API_KEY=... node scripts/test-agent-actions.mjs add-related brainstorm

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-4-5";

const ACTIONS = {
  "group-by-theme": {
    instruction:
      "Read the cell text and cluster cells that share a theme. IMPORTANT: if the framework has load-bearing structural axes (swimlanes in a process, levels in a hierarchy), do NOT destroy them — instead, cluster WITHIN each row/swimlane, or group related swimlanes together. For a brainstorm with no inherent structure, freely regroup cells into themed columns and return colLabels (1–3 words per label) naming each theme. Only generate labels when you can actually name the grouping.",
    temperature: 0.55,
  },
  prioritize: {
    instruction:
      "Rank the cells by priority / urgency / impact. BEFORE rearranging, decide whether the framework has an inherent order (process, hierarchy, timeline). If YES: sort WITHIN the existing structure — e.g. re-order steps within each swimlane by criticality, keeping swimlane rows intact. Don't collapse the process into a priority-tier matrix. If NO (brainstorm of independent items): use columns as priority tiers ('Ship now', 'Next up', 'Later') and return colLabels. Only use tiers when cells are genuinely independent.",
    temperature: 0.5,
  },
  "label-sections": {
    instruction:
      "Don't move any cells. Look at how they're currently laid out and infer meaningful section labels. Return rowLabels (one per row) and colLabels (one per col) that describe what each row / column represents. If a row or col has no clear theme, use an empty string for that entry. Return every input cell at its existing (row, col).",
    temperature: 0.35,
  },
  "add-related": {
    instruction:
      "Read the existing cells AND their edges. Identify 3–5 genuine GAPS — not more-of-the-same, but: a missing perspective, a follow-up question, an exception path, a counter-argument, a related data point, an overlooked stakeholder. Diversity of TYPE matters: don't just add more process steps or more feature ideas; add a mix of question / critique / precondition / alternative. Introduce NEW cells with fresh ids prefixed 'agent-' and CONNECT each one to the existing structure via one or more newEdges — a new cell must point to or be pointed at by at least one existing cell, otherwise it floats orphaned. For a hierarchy, new cells attach as children or parents. For a process, new cells slot into the flow as alternative branches or exception paths (and must respect swimlanes). For a brainstorm, edges are preferred (e.g. pain → feature-idea that solves it). PLACEMENT: place each new cell IMMEDIATELY ADJACENT to (same row/col, or one step away from) the existing cell it most relates to, so its edge(s) span ≤ 2 cells. Expanding the grid by a single column or row is better than placing new cells far from what they connect to — long edges across 3+ cells produce unreadable crossing arrows. Prefer minimal grid growth. Keep every existing cell at its current position.",
    temperature: 0.65,
  },
  "form-clusters": {
    instruction:
      "Identify 2–5 meaningful CLUSTERS in the current layout. A cluster is a VISUAL GROUPING of cells that share a theme — shown as a dashed bounding box around them with a short label. Clusters don't move cells. RULES: (1) ≥2 cells per cluster; (2) members should be SPATIALLY CONTIGUOUS on the grid — pick the largest contiguous subset if related cells are scattered; (3) short labels (1-3 words); (4) tone: 'warn' (risks, pains), 'success' (wins, goals), 'info' (data, context), 'accent' (opportunities, features), 'neutral' (else); (5) each cell in at most ONE cluster; (6) not every cell needs to be in a cluster. Do NOT move cells. Return clusters with fresh ids like 'cluster-1'.",
    temperature: 0.55,
  },
};

const STRUCTURE_GUIDANCE = {
  "process-flow":
    "This is a PROCESS DIAGRAM. Rows are SWIMLANES (who owns each step) — they are load-bearing and must be preserved: a cell in swimlane row R must stay in row R. Edges encode the directed flow of work — don't reverse them, don't create cycles, don't leave new cells orphaned. The column axis represents time/flow order, NOT categorical stages — do NOT generate colLabels. If an action would fundamentally break the flow (e.g. prioritize into tiers, cluster by category), adapt minimally or return cells unchanged — don't reshape the process into a matrix.",
  hierarchy:
    "This is a HIERARCHY / TREE. Edges are parent→child and define who reports to whom. Preserve the tree structure — don't rearrange so children sit above parents. When adding new cells, connect them into the tree with new edges. Don't leave new cells floating. Actions like 'prioritize' or 'group by theme' usually don't apply — the hierarchy IS the grouping. If asked, return cells unchanged.",
  "brainstorm-dump":
    "This is a BRAINSTORM. Cells are independent items with no inherent structure. Feel free to completely reorganize — group, prioritize, cluster, rewrite section labels. This is the ideal target for context-based actions.",
};

const DATASETS = {
  org: {
    structureHint: "hierarchy",
    rows: 3,
    cols: 5,
    cells: [
      { id: "ceo",      row: 0, col: 2, text: "CEO" },
      { id: "cto",      row: 1, col: 1, text: "CTO" },
      { id: "cpo",      row: 1, col: 3, text: "CPO" },
      { id: "eng",      row: 2, col: 0, text: "Eng" },
      { id: "design",   row: 2, col: 2, text: "Design" },
      { id: "research", row: 2, col: 4, text: "Research" },
    ],
    edges: [
      { id: "e1", fromId: "ceo", toId: "cto" },
      { id: "e2", fromId: "ceo", toId: "cpo" },
      { id: "e3", fromId: "cto", toId: "eng" },
      { id: "e4", fromId: "cto", toId: "design" },
      { id: "e5", fromId: "cpo", toId: "design" },
      { id: "e6", fromId: "cpo", toId: "research" },
    ],
  },
  process: {
    structureHint: "process-flow",
    rows: 4,
    cols: 9,
    cells: [
      { id: "alert",      row: 0, col: 0, text: "Alert fires (PagerDuty)" },
      { id: "assess",     row: 0, col: 1, text: "Assess blast radius" },
      { id: "close",      row: 0, col: 6, text: "Close pager, verify SLO" },
      { id: "page",       row: 1, col: 2, text: "Page SRE lead" },
      { id: "rollback",   row: 1, col: 4, text: "Rollback / hotfix" },
      { id: "monitor",    row: 1, col: 5, text: "Metrics green, monitor" },
      { id: "rca",        row: 1, col: 7, text: "Isolate root cause" },
      { id: "status",     row: 2, col: 4, text: "Status page update" },
      { id: "rcaemail",   row: 2, col: 8, text: "Send RCA email" },
      { id: "decision",   row: 3, col: 3, text: "Customer-facing?" },
      { id: "postmortem", row: 3, col: 8, text: "Publish postmortem" },
    ],
    edges: [
      { id: "p1",  fromId: "alert",    toId: "assess" },
      { id: "p2",  fromId: "assess",   toId: "page" },
      { id: "p3",  fromId: "page",     toId: "decision", label: "escalate" },
      { id: "p4",  fromId: "decision", toId: "rollback" },
      { id: "p5",  fromId: "decision", toId: "status", label: "public" },
      { id: "p6",  fromId: "rollback", toId: "monitor" },
      { id: "p7",  fromId: "monitor",  toId: "close" },
      { id: "p8",  fromId: "monitor",  toId: "rca" },
      { id: "p9",  fromId: "rca",      toId: "postmortem" },
      { id: "p10", fromId: "status",   toId: "rcaemail" },
    ],
  },
  // ── Stress-test dataset: 35 raw cards from a complex product strategy session ─
  mega: {
    structureHint: "brainstorm-dump",
    rows: 7,
    cols: 5,
    cells: [
      { id: "m01", row: 0, col: 0, text: "Churn spike: 18% in Q2 from SMB cohort" },
      { id: "m02", row: 0, col: 1, text: "Enterprise NRR 124%; SMB NRR 87%" },
      { id: "m03", row: 0, col: 2, text: "Competitor B shipped AI agent mode last week" },
      { id: "m04", row: 0, col: 3, text: "Board pressure: IPO narrative by FY27" },
      { id: "m05", row: 0, col: 4, text: "Sales: 'We lose 40% of deals on data residency'" },
      { id: "m06", row: 1, col: 0, text: "Feature: offline-first mobile sync" },
      { id: "m07", row: 1, col: 1, text: "Feature: AI agent co-pilot in doc editor" },
      { id: "m08", row: 1, col: 2, text: "Feature: EU-only data residency" },
      { id: "m09", row: 1, col: 3, text: "Feature: usage-based pricing for SMB" },
      { id: "m10", row: 1, col: 4, text: "Feature: SCIM + SSO for all paid tiers" },
      { id: "m11", row: 2, col: 0, text: "Pain: onboarding drop at invite step (38%)" },
      { id: "m12", row: 2, col: 1, text: "Pain: no audit logs — blocks financial services" },
      { id: "m13", row: 2, col: 2, text: "Pain: 15+ API integrations required per customer" },
      { id: "m14", row: 2, col: 3, text: "Pain: pricing page confuses PLG vs sales" },
      { id: "m15", row: 2, col: 4, text: "Pain: mobile crash rate 3× desktop" },
      { id: "m16", row: 3, col: 0, text: "Data: AI features drive 2.4× engagement" },
      { id: "m17", row: 3, col: 1, text: "Data: Support tickets up 40% YoY" },
      { id: "m18", row: 3, col: 2, text: "Data: 67% of CS time on manual onboarding" },
      { id: "m19", row: 3, col: 3, text: "Data: Free→paid conversion: 4.2% (tgt 8%)" },
      { id: "m20", row: 3, col: 4, text: "Data: Mobile session length: 1.8 min avg" },
      { id: "m21", row: 4, col: 0, text: "Constraint: Only 3 new eng hires Q3" },
      { id: "m22", row: 4, col: 1, text: "Constraint: SOC2 Type II audit starts Nov" },
      { id: "m23", row: 4, col: 2, text: "Constraint: Mobile team: 1 eng, 0 designer" },
      { id: "m24", row: 4, col: 3, text: "Constraint: GPT-5 rate limits during launch" },
      { id: "m25", row: 4, col: 4, text: "Constraint: CS budget frozen until Q4" },
      { id: "m26", row: 5, col: 0, text: "Goal: Hit $8M ARR by EOY" },
      { id: "m27", row: 5, col: 1, text: "Goal: Land 3 Fortune 500 logos" },
      { id: "m28", row: 5, col: 2, text: "Goal: Cut CAC payback < 14 months" },
      { id: "m29", row: 5, col: 3, text: "Goal: Launch in EU by Q4" },
      { id: "m30", row: 5, col: 4, text: "Goal: Reach 50K MAU on mobile" },
      { id: "m31", row: 6, col: 0, text: "Q: Rebuild mobile app or accept degraded UX?" },
      { id: "m32", row: 6, col: 1, text: "Q: Open-source the agent framework?" },
      { id: "m33", row: 6, col: 2, text: "Q: Sunset free tier to focus on enterprise?" },
      { id: "m34", row: 6, col: 3, text: "Q: Partner with AWS for data residency?" },
      { id: "m35", row: 6, col: 4, text: "Q: Hire VP of Eng before scaling?" },
    ],
    edges: [],
  },

  brainstorm: {
    structureHint: "brainstorm-dump",
    rows: 4,
    cols: 5,
    cells: [
      { id: "b01", row: 0, col: 0, text: "AI autofill first-run setup" },
      { id: "b02", row: 0, col: 1, text: "First-run wizard takes 8 min" },
      { id: "b03", row: 0, col: 2, text: "Trial→paid: 8% (industry 15%)" },
      { id: "b04", row: 0, col: 3, text: "Eng HC locked: 2 hires in Q3" },
      { id: "b05", row: 0, col: 4, text: "2× mid-market conversion by EOY" },
      { id: "b06", row: 1, col: 0, text: "Team dashboards w/ shared filters" },
      { id: "b07", row: 1, col: 1, text: "Users can't find saved filters" },
      { id: "b08", row: 1, col: 2, text: "Median time-to-value: 11 days" },
      { id: "b09", row: 1, col: 3, text: "SOC2 audit scheduled Q4" },
      { id: "b10", row: 1, col: 4, text: "Cut time-to-value by 50%" },
      { id: "b11", row: 2, col: 0, text: "Mobile push for digest delivery" },
      { id: "b12", row: 2, col: 1, text: "Mobile web is read-only" },
      { id: "b13", row: 2, col: 2, text: "Mobile: 23% sessions, 3% conv" },
      { id: "b14", row: 2, col: 3, text: "Legacy auth blocks SSO on free" },
      { id: "b15", row: 2, col: 4, text: "Ship SSO for paid tiers" },
      { id: "b16", row: 3, col: 0, text: "Slack bot: summarize yesterday" },
      { id: "b17", row: 3, col: 1, text: "Digests get buried in inbox" },
      { id: "b18", row: 3, col: 2, text: "Enterprise NRR 118%, SMB 94%" },
      { id: "b19", row: 3, col: 3, text: "CSV export for all tables" },
      { id: "b20", row: 3, col: 4, text: "Exports lose table formatting" },
    ],
    edges: [],
  },
};

const ARRANGE_TOOL = {
  name: "arrange_grid",
  description:
    "Produce a new grid arrangement. Return every input cell (by id) with its new row/col. May also return new cells (new ids + text), row/col section labels, and new edges connecting cells — depending on what the action asks for.",
  input_schema: {
    type: "object",
    required: ["cells", "rows", "cols"],
    additionalProperties: false,
    properties: {
      cells: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "row", "col"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            row: { type: "integer", minimum: 0 },
            col: { type: "integer", minimum: 0 },
            text: { type: "string" },
          },
        },
      },
      rows: { type: "integer", minimum: 1, maximum: 30 },
      cols: { type: "integer", minimum: 1, maximum: 30 },
      rowLabels: { type: "array", items: { type: "string" } },
      colLabels: { type: "array", items: { type: "string" } },
      newEdges: {
        type: "array",
        items: {
          type: "object",
          required: ["fromId", "toId"],
          additionalProperties: false,
          properties: {
            fromId: { type: "string" },
            toId: { type: "string" },
            label: { type: "string" },
          },
        },
      },
      clusters: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "cellIds"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            cellIds: { type: "array", items: { type: "string" }, minItems: 2 },
            tone: { type: "string", enum: ["neutral", "warn", "success", "info", "accent"] },
          },
        },
      },
    },
  },
};

const BASE_SYSTEM_PROMPT = `You rearrange cells on a 2D grid.

Model:
- Each cell has { id, row, col, text }. Position is discrete: row and col are non-negative integers.
- Edges are directed: { fromId, toId } — they define semantic relationships (parent→child, step→step, cause→effect).
- Grid size is rows × cols. No two cells may share the same (row, col).
- Connectors follow cell ids, so moving a cell automatically re-routes its edges.

Rules:
- Return EVERY input cell via the arrange_grid tool. Use the same ids as the input.
- Never rename or drop existing cells. You may add new cells ONLY when the action asks for it.
- Respect the action's intent — different actions want different outcomes.
- Empty slots are fine and often desirable (buffer cells carry meaning).
- If the action doesn't meaningfully apply to this framework, return cells UNCHANGED and omit rowLabels / colLabels. Don't invent structure where none is needed.
- Only return rowLabels or colLabels when you are genuinely setting or CHANGING the axis meaning.`;

function buildSystemPrompt(hint) {
  if (!hint) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nFramework context:\n${STRUCTURE_GUIDANCE[hint]}`;
}

async function callAgent(actionKey, datasetKey) {
  const action = ACTIONS[actionKey];
  const data = DATASETS[datasetKey];
  if (!action) throw new Error(`Unknown action: ${actionKey}`);
  if (!data) throw new Error(`Unknown dataset: ${datasetKey}`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const user =
    `Grid: ${data.rows} rows × ${data.cols} cols\n\n` +
    `Cells (${data.cells.length}):\n` +
    data.cells.map((c) => `  ${c.id} @ (${c.row},${c.col}) — "${c.text}"`).join("\n") +
    (data.edges.length
      ? `\n\nEdges (${data.edges.length}):\n` +
        data.edges.map((e) => `  ${e.fromId} → ${e.toId}${e.label ? ` [${e.label}]` : ""}`).join("\n")
      : "\n\nNo edges.") +
    `\n\nTask: ${action.instruction}\n\nCall arrange_grid with the result. Include every cell id.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: action.temperature,
    system: buildSystemPrompt(data.structureHint),
    tools: [ARRANGE_TOOL],
    tool_choice: { type: "tool", name: "arrange_grid" },
    messages: [{ role: "user", content: user }],
  });
  const tool = resp.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("No tool call in response");
  return tool.input;
}

function asciiGrid(rows, cols, cells, rowLabels, colLabels) {
  const byPos = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));
  const colWidth = 22;
  const pad = (s, w) => (s ?? "").toString().slice(0, w).padEnd(w);
  const lines = [];
  if (colLabels?.length) {
    const header = colLabels.map((l) => pad(l.toUpperCase(), colWidth)).join(" │ ");
    lines.push("        " + header);
    lines.push("        " + "─".repeat(header.length));
  }
  for (let r = 0; r < rows; r++) {
    const label = rowLabels?.[r] ?? "";
    const row = [];
    for (let c = 0; c < cols; c++) {
      const cell = byPos.get(`${r}:${c}`);
      row.push(pad(cell ? cell.text : "·", colWidth));
    }
    lines.push(pad(label, 7) + " " + row.join(" │ "));
  }
  return lines.join("\n");
}

async function runOne(actionKey, datasetKey) {
  console.log(`\n\n========== ${actionKey.toUpperCase()} on ${datasetKey.toUpperCase()} ==========\n`);
  const data = DATASETS[datasetKey];
  console.log("BEFORE:");
  console.log(asciiGrid(data.rows, data.cols, data.cells));
  try {
    const out = await callAgent(actionKey, datasetKey);
    // Hydrate text from input for cells that omitted it.
    const inputText = new Map(data.cells.map((c) => [c.id, c.text]));
    const cellsWithText = out.cells.map((c) => ({
      ...c,
      text: c.text ?? inputText.get(c.id) ?? c.id,
    }));
    console.log(`\nAFTER (${out.rows}×${out.cols}):`);
    console.log(asciiGrid(out.rows, out.cols, cellsWithText, out.rowLabels, out.colLabels));
    const inputIds = new Set(data.cells.map((c) => c.id));
    const newCells = out.cells.filter((c) => !inputIds.has(c.id));
    if (newCells.length) {
      console.log(`\nNEW CELLS (${newCells.length}):`);
      for (const c of newCells) console.log(`  ${c.id} @ (${c.row},${c.col}) — "${c.text}"`);
    }
    if (out.newEdges?.length) {
      console.log(`\nNEW EDGES (${out.newEdges.length}):`);
      for (const e of out.newEdges) {
        console.log(`  ${e.fromId} → ${e.toId}${e.label ? ` [${e.label}]` : ""}`);
      }
    }
    if (out.clusters?.length) {
      console.log(`\nCLUSTERS (${out.clusters.length}):`);
      for (const c of out.clusters) {
        console.log(
          `  ${c.id}${c.label ? ` "${c.label}"` : ""} [${c.tone ?? "neutral"}]: ${c.cellIds.join(", ")}`
        );
      }
    }
    // Validation for process-flow: did swimlanes survive?
    if (data.structureHint === "process-flow") {
      const originalLanes = new Map(data.cells.map((c) => [c.id, c.row]));
      const moved = out.cells.filter((c) => {
        if (!inputIds.has(c.id)) return false;
        return originalLanes.get(c.id) !== c.row;
      });
      if (moved.length) {
        console.log(`\n⚠ SWIMLANE VIOLATIONS (${moved.length}): cells moved out of their original row`);
        for (const c of moved) {
          console.log(`  ${c.id}: row ${originalLanes.get(c.id)} → ${c.row}`);
        }
      } else {
        console.log(`\n✓ Swimlanes preserved.`);
      }
    }
    if (data.structureHint === "hierarchy" && newCells.length && !out.newEdges?.length) {
      console.log(`\n⚠ HIERARCHY: ${newCells.length} new cells introduced with 0 new edges → orphans`);
    }
  } catch (e) {
    console.log(`\nERROR: ${e.message}`);
  }
}

async function runChained(actions, datasetKey) {
  console.log(`\n\n========== CHAIN [${actions.join(" → ")}] on ${datasetKey.toUpperCase()} ==========\n`);
  const data = DATASETS[datasetKey];
  let state = {
    structureHint: data.structureHint,
    rows: data.rows,
    cols: data.cols,
    cells: [...data.cells],
    edges: [...data.edges],
  };
  for (const actionKey of actions) {
    console.log(`\n— Step: ${actionKey} —`);
    try {
      const action = ACTIONS[actionKey];
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const user =
        `Grid: ${state.rows} rows × ${state.cols} cols\n\n` +
        `Cells (${state.cells.length}):\n` +
        state.cells.map((c) => `  ${c.id} @ (${c.row},${c.col}) — "${c.text}"`).join("\n") +
        (state.edges.length
          ? `\n\nEdges (${state.edges.length}):\n` +
            state.edges.map((e) => `  ${e.fromId} → ${e.toId}${e.label ? ` [${e.label}]` : ""}`).join("\n")
          : "\n\nNo edges.") +
        `\n\nTask: ${action.instruction}\n\nCall arrange_grid with the result.`;
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: action.temperature,
        system: buildSystemPrompt(state.structureHint),
        tools: [ARRANGE_TOOL],
        tool_choice: { type: "tool", name: "arrange_grid" },
        messages: [{ role: "user", content: user }],
      });
      const tool = resp.content.find((b) => b.type === "tool_use");
      if (!tool || tool.type !== "tool_use") throw new Error("No tool call");
      const out = tool.input;
      // Update state
      const inputText = new Map(state.cells.map((c) => [c.id, c.text]));
      const inputIds = new Set(state.cells.map((c) => c.id));
      state.cells = out.cells.map((c) => ({
        id: c.id,
        row: c.row,
        col: c.col,
        text: c.text ?? inputText.get(c.id) ?? c.id,
      }));
      state.rows = out.rows;
      state.cols = out.cols;
      if (out.newEdges?.length) {
        for (const e of out.newEdges) {
          state.edges.push({
            id: `e-${state.edges.length + 1}`,
            fromId: e.fromId,
            toId: e.toId,
            label: e.label,
          });
        }
      }
      const newCellCount = out.cells.filter((c) => !inputIds.has(c.id)).length;
      console.log(`  → ${state.rows}×${state.cols} grid, ${state.cells.length} cells (+${newCellCount} new), ${state.edges.length} edges, labels=${!!(out.rowLabels || out.colLabels)}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      return;
    }
  }
  console.log(`\nFINAL STATE:`);
  console.log(asciiGrid(state.rows, state.cols, state.cells));
}

async function main() {
  const [actionArg, datasetArg] = process.argv.slice(2);
  if (actionArg === "chain") {
    const chain = datasetArg?.split(":");
    if (!chain || chain.length < 2) {
      console.log("Usage: chain <dataset>:<action1>,<action2>,...");
      console.log("Example: chain mega:group-by-theme,prioritize,add-related");
      return;
    }
    const [ds, actionStr] = chain;
    await runChained(actionStr.split(","), ds);
    return;
  }
  const actions = actionArg ? [actionArg] : Object.keys(ACTIONS);
  const datasets = datasetArg ? [datasetArg] : Object.keys(DATASETS);
  for (const a of actions) {
    for (const d of datasets) {
      await runOne(a, d);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
