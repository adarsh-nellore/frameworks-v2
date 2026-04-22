#!/usr/bin/env node
// Phase C experiment — prototype the renderingPlan field and see what the agent
// actually emits for 3 characteristic prompts, BEFORE writing any production
// renderer code.
//
// Loads ANTHROPIC_API_KEY from .env.local, clones proposeFrameworkToolSchema
// with a new renderingPlan field appended, runs synthesis 3x, prints the
// renderingPlan + layout + chrome the agent picked, and draws a lo-fi ASCII
// sketch of what the renderer would produce under that plan.
//
// Run:  node scripts/experiment-rendering-plan.mjs
//
// This script does NOT modify any production files. The tool schema it uses
// is assembled in-memory; the real propose_framework schema is untouched.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

// Load .env.local into process.env (not using dotenv to keep this script
// dependency-free beyond @anthropic-ai/sdk which is already in node_modules).
function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  try {
    const txt = readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* .env.local missing — hope the var is in the environment */
  }
}
loadEnvLocal();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set (and .env.local doesn't supply it). Aborting.");
  process.exit(1);
}

// Import the real system prompt and tool schema via dynamic import of the
// compiled JS. To avoid a TS build step, we instead read them as source and
// hand-extract; simpler: use tsx to run this file. But since this is a .mjs
// script, we'll use a minimal inline copy of the prompt for the experiment.
// The schema is JSON-ish so we inline the relevant parts too.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

// Minimal propose_framework tool schema with renderingPlan added. Shortened
// versions of the real fields — enough for the agent to emit a valid config.
const TOOL_SCHEMA = {
  type: "object",
  required: [
    "id",
    "label",
    "layout",
    "colNoun",
    "rowNoun",
    "cardNoun",
    "structuringPrompt",
    "exampleInstructions",
    "renderingPlan",
    "seed",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 3, maxLength: 80 },
    label: { type: "string", maxLength: 40 },
    layout: { type: "string", enum: ["grid", "kanban", "matrix", "freeform"] },
    chrome: {
      type: "object",
      required: ["kind"],
      additionalProperties: true,
      properties: {
        kind: {
          type: "string",
          enum: [
            "double-diamond",
            "venn",
            "kano-curve",
            "funnel",
            "concentric",
            "coordinate-cross",
          ],
        },
        leftLabel: { type: "string" },
        rightLabel: { type: "string" },
        circles: { type: "array", items: { type: "string" } },
      },
    },
    colNoun: { type: "string", maxLength: 20 },
    rowNoun: { type: "string", maxLength: 20 },
    cardNoun: { type: "string", maxLength: 20 },
    fixedCols: { type: "boolean" },
    fixedRows: { type: "boolean" },
    structuringPrompt: { type: "string", minLength: 40, maxLength: 2000 },
    exampleInstructions: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", maxLength: 120 },
    },
    // ── The new field under test ──────────────────────────────────────────
    renderingPlan: {
      type: "object",
      required: ["cardOrientation", "spatialContinuity", "density", "summary"],
      additionalProperties: false,
      properties: {
        cardOrientation: {
          type: "string",
          enum: ["stacked", "horizontal-bar", "dot", "mixed"],
          description:
            "'stacked' = cards flow vertically in each (col,row) cell. Default for discrete frameworks like SWOT, journey map, kanban, service blueprint. " +
            "'horizontal-bar' = cards render as horizontal pills at meta.x with meta.width — use for Gantt, roadmap, timeline, any framework where duration along one axis is load-bearing. " +
            "'dot' = cards render as small markers at continuous meta.x/meta.y — use for scatter plots, cartesian positioning, 2D maps where position carries information. " +
            "'mixed' = combinations (e.g. background shape cards + content cards).",
        },
        spatialContinuity: {
          type: "string",
          enum: ["cell-discrete", "axis-continuous", "xy-continuous"],
          description:
            "'cell-discrete' = cards belong to a single (col,row) cell. " +
            "'axis-continuous' = one axis is continuous; cards carry meta.x and optional meta.width. " +
            "'xy-continuous' = both axes continuous; cards carry meta.x AND meta.y.",
        },
        density: {
          type: "string",
          enum: ["sparse", "moderate", "dense"],
          description:
            "'sparse' = clusters, much empty space. 'moderate' = 1–3 items per cell. 'dense' = every cell populated.",
        },
        summary: {
          type: "string",
          minLength: 20,
          maxLength: 400,
          description:
            "1-3 sentence prose description of how the framework should read at a glance. This becomes the directive for the populate step.",
        },
      },
    },
    seed: {
      type: "object",
      required: ["id", "title", "cols", "rows", "cards", "meta"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        meta: { type: "object", additionalProperties: { type: "string" } },
        cols: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "label"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: "^c\\d+$" },
              label: { type: "string" },
              kind: { type: "string" },
            },
          },
        },
        rows: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "label"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: "^r\\d+$" },
              label: { type: "string" },
              kind: { type: "string" },
            },
          },
        },
        cards: { type: "array", maxItems: 0 },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a framework architect. Given a short natural-language description, return a FrameworkConfig via the propose_framework tool.

## Three-layer reasoning you must perform

When building a framework, reason through THREE distinct layers, in order:

1. **Semantic understanding.** What is this framework? What do cols, rows, and cards MEAN? Capture this in structuringPrompt.

2. **Visual plan.** How should the framework look at a glance? Are cards discrete notes (stacked in cells) OR horizontal bars spanning time OR dots positioned at continuous (x,y)? This is the **renderingPlan** field — the bridge between meaning and per-card placement.

3. **Per-card execution.** Where does each individual card sit? This happens in a later populate step, which reads your renderingPlan to decide whether to set meta.x, meta.y, meta.width on each card.

**The renderingPlan is how you tell downstream rendering whether this is "stacked notes in cells" (SWOT, journey map, kanban, service blueprint) OR "horizontal bars on a time axis" (Gantt, roadmap) OR "positioned dots on continuous axes" (scatter plot, cartesian plot).**

## Examples of renderingPlan choices

- **Gantt / roadmap / timeline with duration:**
  { cardOrientation: "horizontal-bar", spatialContinuity: "axis-continuous", density: "moderate", summary: "Swimlanes stack vertically; tasks render as horizontal bars positioned along each row's time axis with width proportional to duration. Dependencies as arrows between bar edges." }

- **Scatter plot / cartesian / magic quadrant:**
  { cardOrientation: "dot", spatialContinuity: "xy-continuous", density: "moderate", summary: "Each entity renders as a small dot at continuous (x,y) within the plot. Labels adjacent to dots. Position carries information." }

- **SWOT / quadrant / Eisenhower / BCG:**
  { cardOrientation: "stacked", spatialContinuity: "cell-discrete", density: "moderate", summary: "Four quadrants with 3-5 findings stacked in each." }

- **Journey map / service blueprint / user story map:**
  { cardOrientation: "stacked", spatialContinuity: "cell-discrete", density: "moderate", summary: "Phases as cols, lanes as rows, cards stacked in each cell to show moments/actions." }

- **Kanban / affinity / card sort / SCAMPER:**
  { cardOrientation: "stacked", spatialContinuity: "cell-discrete", density: "moderate", summary: "Single row; cards stack vertically in category columns." }

## Layout rules (condensed)

- matrix = fixed N×M grid with 2 meaningful axes (SWOT, BCG, 2×2 priority). fixedCols + fixedRows both true. At least 2 cols AND 2 rows.
- kanban = 1 row, cards stack in category cols (JTBD, affinity, SWOT-as-kanban, Double Diamond).
- grid = 2 meaningful axes with at least one dynamic (journey map, service blueprint, RACI, Gantt).
- freeform = Miro-style mind map. No tabular semantics.

## Output format

- id: kebab-case, starts with "custom-".
- label: human name.
- colNoun / rowNoun / cardNoun: singular nouns.
- seed: cols c1..cN and rows r1..rN, cards: [] (populate step fills them later).
- exampleInstructions: 2–5 short suggestions.
- structuringPrompt: 3–6 sentences on what col/row/card MEAN. Do NOT mention op names like addCard, moveRow.
- renderingPlan: the 4-field object above. Required.

Call propose_framework once. Do not return free-form text.`;

const PROMPTS = [
  { id: "gantt", user: "Gantt chart for a 6-month consumer AI product launch" },
  { id: "scatter", user: "Competitive cartesian plot of AI infrastructure vendors on cost vs reliability" },
  { id: "swot", user: "SWOT analysis for an AI startup entering the enterprise market" },
  { id: "roadmap", user: "Product roadmap across 4 quarters organized by workstream (Product, Design, Engineering, GTM)" },
  { id: "journey", user: "Customer journey map for a new SaaS onboarding flow" },
];

function renderSketch(result) {
  const { renderingPlan, seed } = result;
  if (!renderingPlan) return "  (no renderingPlan — can't sketch)";
  const { cardOrientation, spatialContinuity } = renderingPlan;
  const cols = (seed?.cols ?? []).map((c) => c.label).slice(0, 6);
  const rows = (seed?.rows ?? []).map((r) => r.label).slice(0, 5);

  if (cardOrientation === "horizontal-bar") {
    const colHeader = "        │" + cols.map((c) => ` ${c.padEnd(9).slice(0, 9)}│`).join("");
    const sep = "────────┼" + cols.map(() => "──────────┼").join("").slice(0, -1) + "┤";
    const rowBar = (label, offset, len) =>
      "        │" + cols.map((_, i) => {
        const cellStart = i * 10;
        const cellEnd = (i + 1) * 10;
        let s = "          ";
        const barStart = Math.max(0, offset - cellStart);
        const barEnd = Math.min(10, len + offset - cellStart);
        if (barStart < 10 && barEnd > 0 && offset < cellEnd) {
          s = s.split("");
          for (let k = barStart; k < barEnd && k < 10; k++) s[k] = "═";
          if (barStart < 10 && barStart >= 0 && offset >= cellStart)
            s[barStart] = "●";
          if (barEnd <= 10 && barEnd > 0 && len + offset <= cellEnd)
            s[barEnd - 1] = "●";
          s = s.join("");
        }
        return s + "│";
      }).join("");
    let out = `  Rendering plan says "horizontal-bar". Sketch of first swimlane:\n`;
    out += colHeader + "\n";
    out += sep + "\n";
    // Draw 3 sample bars with varying lengths/offsets to give a feel:
    if (rows[0]) {
      out += ` ${rows[0].padEnd(7)}│`.replace(/^/, "        │").slice(0, 9) +
        cols.map(() => "          │").join("").slice(0, -1) + "│\n";
      out += rowBar(rows[0] ?? "Row 1", 2, 18) + "\n";
      out += rowBar(rows[0] ?? "Row 1", 14, 24) + "\n";
      out += rowBar(rows[0] ?? "Row 1", 35, 15) + "\n";
    }
    return out;
  }

  if (cardOrientation === "dot") {
    let out = `  Rendering plan says "dot". Sketch of plot area:\n`;
    out += "         ↑\n";
    out += "         │    •     •\n";
    out += "         │  •         •\n";
    out += "         │      •\n";
    out += "       ──●──────────────→\n";
    out += "         │    •\n";
    out += "         │        •   •\n";
    out += "         │  •       •\n";
    out += "         ↓\n";
    out += "  Each dot = one entity at continuous (meta.x, meta.y). Labels adjacent.\n";
    return out;
  }

  // stacked fallback
  let out = `  Rendering plan says "stacked". Sketch:\n`;
  const colHeader = "  │" + cols.map((c) => ` ${c.padEnd(12).slice(0, 12)}│`).join("");
  out += colHeader + "\n";
  for (const r of rows) {
    out += `  │ ${r.padEnd(10).slice(0, 10).padEnd(12)}│` +
      cols.slice(1).map(() => " [item]       │").join("") + "\n";
    out += `  │` + cols.map(() => " [item]       │").join("") + "\n";
  }
  return out;
}

async function runOne(prompt) {
  const t0 = Date.now();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: "propose_framework",
        description:
          "Propose a FrameworkConfig for the described framework, including a renderingPlan that tells downstream rendering how cards should visually arrange.",
        input_schema: TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `User description: ${prompt.user}\n\nReturn a FrameworkConfig via the propose_framework tool.` }],
  });
  const tool = msg.content.find((c) => c.type === "tool_use");
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  if (!tool || tool.type !== "tool_use") {
    return { id: prompt.id, user: prompt.user, error: "no tool_use block in response", dur };
  }
  return { id: prompt.id, user: prompt.user, dur, result: tool.input };
}

console.log("== Phase C experiment — renderingPlan field probe ==\n");
console.log(`Model: ${MODEL}`);
console.log(`Prompts: ${PROMPTS.length}`);
console.log();

const results = [];
for (let i = 0; i < PROMPTS.length; i++) {
  const p = PROMPTS[i];
  process.stdout.write(`[${i + 1}/${PROMPTS.length}] ${p.id} ("${p.user.slice(0, 60)}...") ... `);
  try {
    const r = await runOne(p);
    if (r.error) {
      console.log(`FAIL (${r.dur}s): ${r.error}`);
      results.push(r);
      continue;
    }
    const rp = r.result.renderingPlan;
    console.log(
      `ok (${r.dur}s): layout=${r.result.layout}` +
        (r.result.chrome?.kind ? ` chrome=${r.result.chrome.kind}` : "") +
        ` cardOrientation=${rp?.cardOrientation}` +
        ` continuity=${rp?.spatialContinuity}` +
        ` density=${rp?.density}`
    );
    results.push(r);
  } catch (e) {
    console.log(`THROW: ${e?.message ?? e}`);
    results.push({ id: p.id, user: p.user, error: e?.message ?? String(e) });
  }
}

console.log("\n\n== Per-prompt details ==\n");
for (const r of results) {
  console.log(`━━━ [${r.id}] "${r.user}" ━━━`);
  if (r.error) {
    console.log(`  ERROR: ${r.error}\n`);
    continue;
  }
  const cfg = r.result;
  const rp = cfg.renderingPlan;
  console.log(`  layout:            ${cfg.layout}${cfg.chrome?.kind ? `  chrome: ${cfg.chrome.kind}` : ""}`);
  console.log(`  cols x rows:       ${cfg.seed.cols.length} x ${cfg.seed.rows.length}`);
  console.log(`  colNoun/rowNoun:   ${cfg.colNoun} / ${cfg.rowNoun}`);
  console.log(`  renderingPlan:`);
  console.log(`    cardOrientation:   ${rp?.cardOrientation}`);
  console.log(`    spatialContinuity: ${rp?.spatialContinuity}`);
  console.log(`    density:           ${rp?.density}`);
  console.log(`    summary: "${rp?.summary}"`);
  console.log();
  console.log(renderSketch(cfg));
  console.log();
}

console.log("== Coverage check ==");
const expected = {
  gantt: "horizontal-bar",
  scatter: "dot",
  swot: "stacked",
  roadmap: "horizontal-bar",
  journey: "stacked",
};
let hits = 0, total = 0;
for (const r of results) {
  if (r.error) continue;
  total++;
  const want = expected[r.id];
  const got = r.result.renderingPlan?.cardOrientation;
  const mark = got === want ? "✓" : "✗";
  if (got === want) hits++;
  console.log(`  ${mark} ${r.id.padEnd(10)} expected=${want.padEnd(16)} got=${got}`);
}
console.log(`\n${hits}/${total} prompts picked the expected cardOrientation.`);
if (hits < total) {
  console.log("\n⚠ Some mismatches. Refine the system prompt guidance for those framework types before writing renderer code.");
  process.exit(1);
}
console.log("\n✓ All cardOrientation predictions matched. Schema design validated. Safe to proceed with renderer implementation.");
