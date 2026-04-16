#!/usr/bin/env tsx
/**
 * Evaluation harness for /api/arrange — Copilot-style edits on existing frameworks.
 *
 * Usage (with dev server already running on 3000/3001/3002/…):
 *   HOST=http://localhost:3002 npx tsx scripts/eval-arrange.ts
 *   HOST=... CASE="sub-items" npx tsx scripts/eval-arrange.ts
 *
 * Prints ops count, summary, and a before→after delta per case.
 * Exits non-zero if any case fails.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  applyOps,
  type UniversalMap,
  type Op,
} from "../lib/frameworks/universal";
import {
  journeyMapConfig,
  matrix2x2Config,
  jtbdCanvasConfig,
} from "../lib/frameworks/universal";

const HOST = process.env.HOST || "http://localhost:3000";
const FILTER = process.env.CASE?.toLowerCase();

type Case = {
  label: string;
  frameworkId: string;
  seed: UniversalMap;
  instruction: string;
  /** Optional focus (selection) passed as agent context. */
  focus?: unknown;
  /** Assertion callback on the applied map. Return a string to mark the case as "warn" (still passes). */
  check?: (before: UniversalMap, after: UniversalMap, ops: Op[]) => string | undefined;
};

const CASES: Case[] = [
  {
    label: "matrix-2x2: add content to one quadrant",
    frameworkId: matrix2x2Config.id,
    seed: matrix2x2Config.seed,
    instruction:
      "Add three new Quick Wins about API improvements — a new public endpoint, rate-limit headers, and a pagination change.",
    check: (before, after) => {
      const gainedInQuickWins =
        after.cards.filter((c) => c.colId === "c1" && c.rowId === "r1").length -
        before.cards.filter((c) => c.colId === "c1" && c.rowId === "r1").length;
      if (gainedInQuickWins < 3)
        return `expected +3 cards in Quick Wins (c1·r1), got +${gainedInQuickWins}`;
      return undefined;
    },
  },
  {
    label: "matrix-2x2: rename a quadrant axis label",
    frameworkId: matrix2x2Config.id,
    seed: matrix2x2Config.seed,
    instruction: "Rename the x-axis from 'Effort' to 'Engineering Cost'.",
    check: (_, after) => {
      if (after.meta.xAxisLabel !== "Engineering Cost")
        return `xAxisLabel still "${after.meta.xAxisLabel}"`;
      return undefined;
    },
  },
  {
    label: "matrix-2x2: move a card between quadrants",
    frameworkId: matrix2x2Config.id,
    seed: matrix2x2Config.seed,
    instruction:
      "Move the 'AI-powered anomaly detection' card from Big Bets to Quick Wins — we just shipped the ML infrastructure.",
    check: (before, after) => {
      const card = after.cards.find((c) => c.text.toLowerCase().includes("anomaly detection"));
      const beforeCard = before.cards.find((c) =>
        c.text.toLowerCase().includes("anomaly detection")
      );
      if (!card || !beforeCard) return `card not found`;
      if (card.colId !== "c1" || card.rowId !== "r1")
        return `card ended up at (${card.colId}·${card.rowId}), expected (c1·r1)`;
      return undefined;
    },
  },
  {
    label: "matrix-2x2: create sub-items under a card (Phase 2 nesting)",
    frameworkId: matrix2x2Config.id,
    seed: matrix2x2Config.seed,
    instruction:
      "Under the 'Real-time collaborative editing' card in Big Bets, add three sub-items: presence/cursor sync, conflict resolution, and offline replay.",
    check: (before, after) => {
      const parent = after.cards.find((c) =>
        c.text.toLowerCase().includes("real-time collaborative editing")
      );
      if (!parent) return `parent card not found after arrange`;
      const kids = after.cards.filter((c) => c.parentCardId === parent.id);
      if (kids.length < 3)
        return `expected ≥3 sub-items under parent, got ${kids.length}`;
      // Before there should be zero children of that parent.
      const beforeKids = before.cards.filter((c) => c.parentCardId === parent.id);
      if (beforeKids.length !== 0) return `parent already had children before`;
      return undefined;
    },
  },
  {
    label: "journey-map: add a new stage + fill lanes",
    frameworkId: journeyMapConfig.id,
    seed: journeyMapConfig.seed,
    instruction:
      "Add a new 'Activation' stage between Onboarding and Retention, and populate the actions, thoughts, and pain_points lanes for it with realistic content.",
    check: (before, after, ops) => {
      const addedCol = after.cols.find(
        (c) => c.label.toLowerCase().includes("activation") && !before.cols.some((b) => b.id === c.id)
      );
      if (!addedCol) return `no new Activation col added`;
      const newCards = after.cards.filter(
        (c) => c.colId === addedCol.id && !before.cards.some((b) => b.id === c.id)
      );
      if (newCards.length < 3) return `expected ≥3 new cards in the Activation col, got ${newCards.length}`;
      void ops;
      return undefined;
    },
  },
  {
    label: "jtbd-canvas: bulk add in a specific section",
    frameworkId: jtbdCanvasConfig.id,
    seed: jtbdCanvasConfig.seed,
    instruction:
      "Add five new entries to the 'Desired Outcomes' section describing what the user wants in their own words.",
    check: (before, after) => {
      // Desired Outcomes col id depends on seed order — look it up dynamically.
      const col = after.cols.find((c) => c.label.toLowerCase().includes("desired outcomes"));
      if (!col) return `Desired Outcomes col not found`;
      const added =
        after.cards.filter((c) => c.colId === col.id).length -
        before.cards.filter((c) => c.colId === col.id).length;
      if (added < 5) return `expected +5 cards in Desired Outcomes, got +${added}`;
      return undefined;
    },
  },
  {
    label: "matrix-2x2: selection-focused refinement (focus: specific cards)",
    frameworkId: matrix2x2Config.id,
    seed: matrix2x2Config.seed,
    // Focus the agent on the existing "Inline CSV export" and "Keyboard shortcut" cards;
    // ask it to rewrite them to be sharper.
    focus: { type: "cards", ids: ["k1", "k2"] },
    instruction:
      "Rewrite the selected cards to be more specific about the user-facing improvement — include a concrete number or named feature.",
    check: (before, after) => {
      const k1b = before.cards.find((c) => c.id === "k1");
      const k1a = after.cards.find((c) => c.id === "k1");
      if (!k1b || !k1a) return `card k1 missing`;
      if (k1a.text === k1b.text) return `k1 text unchanged (agent ignored focus?)`;
      return undefined;
    },
  },
];

function bar() {
  return "─".repeat(72);
}

function snippet(text: string, max = 56) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function summarizeOps(ops: Op[]): string {
  const counts: Record<string, number> = {};
  for (const op of ops) counts[op.op] = (counts[op.op] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
}

async function runCase(c: Case): Promise<"ok" | "warn" | "fail"> {
  const started = Date.now();
  console.log(`\n${bar()}\n▶ ${c.label}`);
  console.log(`  instruction: ${c.instruction}`);

  // Clone the seed so we don't mutate the shared config.
  const before: UniversalMap = JSON.parse(JSON.stringify(c.seed));

  let data: any;
  try {
    const res = await fetch(`${HOST}/api/arrange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frameworkId: c.frameworkId,
        map: before,
        instruction: c.instruction,
        ...(c.focus ? { focus: c.focus } : {}),
      }),
    });
    data = await res.json();
    if (!res.ok) {
      console.log(`  ✗ HTTP ${res.status}: ${data?.error ?? "unknown"}`);
      return "fail";
    }
  } catch (e) {
    console.log(`  ✗ network: ${e instanceof Error ? e.message : String(e)}`);
    return "fail";
  }

  const ops = data.ops as Op[];
  const summary: string = data.summary ?? "";
  const applied = applyOps(before, ops);
  if (!applied.ok) {
    console.log(`  ✗ ops did not apply: ${applied.reason} (index ${applied.failedAtIndex})`);
    return "fail";
  }
  const after = applied.map;

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ops:     ${ops.length}  (${summarizeOps(ops)})  — ${elapsed}s`);
  console.log(`  summary: ${snippet(summary, 120)}`);
  console.log(
    `  delta:   cards ${before.cards.length}→${after.cards.length}  ·  cols ${before.cols.length}→${after.cols.length}  ·  rows ${before.rows.length}→${after.rows.length}`
  );

  // Show a couple of newly-added cards' text.
  const newIds = new Set(
    after.cards.filter((a) => !before.cards.some((b) => b.id === a.id)).map((c) => c.id)
  );
  if (newIds.size > 0) {
    const sample = [...newIds].slice(0, 3).map((id) => after.cards.find((c) => c.id === id)!);
    console.log(`  samples:`);
    for (const s of sample) {
      const marker = s.parentCardId ? "└" : "-";
      console.log(`    ${marker} ${snippet(s.text)}`);
    }
    if (newIds.size > 3) console.log(`    - (+${newIds.size - 3} more new cards)`);
  }

  if (c.check) {
    const msg = c.check(before, after, ops);
    if (msg) {
      console.log(`  ⚠ check: ${msg}`);
      return "warn";
    }
  }
  console.log(`  ✓ ok`);
  return "ok";
}

async function main() {
  const cases = FILTER ? CASES.filter((c) => c.label.toLowerCase().includes(FILTER)) : CASES;
  if (cases.length === 0) {
    console.log(`No cases match CASE="${FILTER}"`);
    process.exit(1);
  }
  console.log(`Target: ${HOST}\nRunning ${cases.length} case${cases.length === 1 ? "" : "s"}…`);

  let pass = 0,
    warn = 0,
    fail = 0;
  for (const c of cases) {
    const result = await runCase(c);
    if (result === "ok") pass++;
    else if (result === "warn") warn++;
    else fail++;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n${bar()}`);
  console.log(`SUMMARY  pass=${pass}  warn=${warn}  fail=${fail}  total=${cases.length}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
