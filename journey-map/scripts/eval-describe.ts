#!/usr/bin/env tsx
/**
 * Evaluation harness for /api/framework-describe.
 *
 * Usage:
 *   1. In one terminal: `npm run dev`
 *   2. In another:      `npx tsx scripts/eval-describe.ts`
 *
 * Override the target host with HOST=http://localhost:3001 npx tsx ...
 * Run a single case with CASE="SWOT analysis" ...
 *
 * Prints a per-case summary: layout, dimensions, populated card counts,
 * truncated structuringPrompt, sample card texts, warnings. Non-zero exit
 * code if any case fails to return ok: true.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FrameworkConfig } from "../lib/frameworks/universal/config";
import type { UniversalMap, Card } from "../lib/frameworks/universal/types";

const HOST = process.env.HOST || "http://localhost:3000";
const FILTER = process.env.CASE?.toLowerCase();

const CASES: { label: string; description: string }[] = [
  {
    label: "Priority Matrix (2x2)",
    description: "A 2x2 matrix for prioritizing features by impact and effort.",
  },
  {
    label: "Customer Journey Map",
    description:
      "A customer journey map showing how a small-business owner discovers, evaluates, and adopts a new accounting product.",
  },
  {
    label: "MECE Framework",
    description:
      "A MECE framework for analyzing the levers that drive customer retention — mutually exclusive, collectively exhaustive categories with supporting sub-points.",
  },
  {
    label: "SWOT Analysis",
    description: "A SWOT analysis for a mid-market CRM startup.",
  },
  {
    label: "Stakeholder Map",
    description:
      "A 2x2 stakeholder map by influence and interest for a cloud migration program.",
  },
  {
    label: "Card Sort",
    description:
      "A card sort exercise for organizing user research findings into themes.",
  },
  {
    label: "RACI Matrix",
    description:
      "A RACI matrix for a marketing launch, with responsibilities across creative, legal, comms, and product.",
  },
  {
    label: "Kano Model",
    description:
      "A Kano model categorizing product features by customer satisfaction impact.",
  },
  // A framework NOT represented anywhere in our few-shot library — tests the
  // design rubric's ability to extrapolate from first principles.
  {
    label: "Wardley Map",
    description:
      "A Wardley Map showing a value chain from user needs down to commodity components, with each component positioned along an evolution axis from genesis to commodity.",
  },
];

type DescribeResponse =
  | {
      ok: true;
      config: FrameworkConfig;
      populatedMap: UniversalMap;
      populationSummary?: string;
      warnings?: string[];
    }
  | { ok: false; error: string };

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function snippet(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function cardsAt(map: UniversalMap, colId: string, rowId: string): Card[] {
  return map.cards.filter((c) => c.colId === colId && c.rowId === rowId && !c.parentCardId);
}

function childrenOf(map: UniversalMap, parentId: string): Card[] {
  return map.cards.filter((c) => c.parentCardId === parentId);
}

function bar(): string {
  return "─".repeat(72);
}

async function runCase(label: string, description: string): Promise<boolean> {
  const started = Date.now();
  process.stdout.write(`\n${bar()}\n▶ ${label}\n  ${description}\n\n`);

  let data: DescribeResponse;
  try {
    const res = await fetch(`${HOST}/api/framework-describe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
    data = (await res.json()) as DescribeResponse;
    if (!res.ok) {
      console.log(`  ✗ HTTP ${res.status}`);
      console.log(`  error: ${(data as any)?.error ?? "unknown"}`);
      return false;
    }
  } catch (e) {
    console.log(`  ✗ Network error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  if (!data.ok) {
    console.log(`  ✗ ${data.error}`);
    return false;
  }

  const { config, populatedMap } = data;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const topLevel = populatedMap.cards.filter((c) => !c.parentCardId).length;
  const nested = populatedMap.cards.length - topLevel;

  console.log(`  id:       ${config.id}`);
  console.log(`  label:    ${config.label}`);
  console.log(
    `  layout:   ${config.layout}   fixedCols=${!!config.fixedCols}   fixedRows=${!!config.fixedRows}`
  );
  console.log(
    `  dims:     ${config.seed.cols.length} col${config.seed.cols.length === 1 ? "" : "s"} × ${config.seed.rows.length} row${config.seed.rows.length === 1 ? "" : "s"}`
  );
  console.log(
    `  nouns:    col=${config.colNoun}, row=${config.rowNoun}, card=${config.cardNoun}`
  );
  if (config.heroMetaFields && config.heroMetaFields.length > 0) {
    console.log(
      `  hero:     ${config.heroMetaFields.map((f) => f.key).join(", ")}`
    );
  }
  if (config.cardMetaFields && config.cardMetaFields.length > 0) {
    console.log(
      `  cardMeta: ${config.cardMetaFields.map((f) => `${f.key}=[${f.options.join("|")}]`).join("; ")}`
    );
  }
  console.log(
    `  populated: ${topLevel} top-level card${topLevel === 1 ? "" : "s"}${nested > 0 ? ` + ${nested} sub-item${nested === 1 ? "" : "s"}` : ""}  (${elapsed}s)`
  );
  console.log(`  structuringPrompt:`);
  for (const line of wrap(config.structuringPrompt, 66)) {
    console.log(`    ${line}`);
  }

  // Cell-by-cell summary with truncated card texts.
  console.log(`  cells:`);
  for (const row of populatedMap.rows) {
    for (const col of populatedMap.cols) {
      const here = cardsAt(populatedMap, col.id, row.id);
      if (here.length === 0) continue;
      console.log(`    ${col.label} · ${row.label}  (${here.length})`);
      for (const c of here.slice(0, 3)) {
        console.log(`      - ${snippet(c.text)}`);
        const kids = childrenOf(populatedMap, c.id);
        for (const k of kids.slice(0, 3)) {
          console.log(`         └ ${snippet(k.text)}`);
        }
        if (kids.length > 3) console.log(`         └ (+${kids.length - 3} more sub-items)`);
      }
      if (here.length > 3) console.log(`      - (+${here.length - 3} more cards)`);
    }
  }

  if (data.warnings && data.warnings.length > 0) {
    console.log(`  warnings:`);
    for (const w of data.warnings) console.log(`    - ${w}`);
  }

  console.log(`  ✓ ok`);
  return true;
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

async function main() {
  const cases = FILTER
    ? CASES.filter((c) => c.label.toLowerCase().includes(FILTER))
    : CASES;

  if (cases.length === 0) {
    console.log(`No cases match CASE="${FILTER}"`);
    process.exit(1);
  }

  console.log(`Target: ${HOST}`);
  console.log(`Running ${cases.length} case${cases.length === 1 ? "" : "s"}…`);

  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const ok = await runCase(c.label, c.description);
    if (ok) pass++;
    else fail++;
    // Small pause between cases so we don't slam the API.
    await wait(500);
  }

  console.log(`\n${bar()}`);
  console.log(`SUMMARY  pass=${pass}  fail=${fail}  total=${cases.length}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
