#!/usr/bin/env node
// Live smoke test for /api/framework-describe.
//
// Hits the running dev server with a handful of deliberately unusual prompts
// and reports which succeed vs fail. Run with the dev server up:
//   npm run dev   (in one terminal)
//   node scripts/smoke-describe.mjs   (in another)
//
// Each prompt tests a different class of potential agent failure:
//   1. Contradictory intent (card sort + axes)
//   2. Coordinate-axes request (the Phase A regression)
//   3. 3×3 matrix (non-2×2 matrix variant)
//   4. Venn-shaped prompt (chrome picking)
//   5. Process-flow prompt (connectors must be enabled)
//   6. Wardley-ish / dual-axis with specific vocab
//
// Exit code is non-zero if any prompt returns !ok.

const PROMPTS = [
  {
    name: "contradictory (card sort + axes)",
    description:
      "A card sort exercise with coordinate axes and arrows to classify user research findings",
    expectedShape: { layoutIn: ["kanban", "matrix", "grid"] },
  },
  {
    name: "coordinate-axes (Phase A target)",
    description:
      "Build a cartesian competitive landscape plot for AI startups with double-sided arrows on both axes, x = innovation speed, y = enterprise-readiness",
    expectedShape: {
      layoutIn: ["matrix"],
      chromeIn: ["coordinate-cross", undefined, null],
    },
  },
  {
    name: "3x3 priority matrix",
    description:
      "A 3x3 priority matrix with high/medium/low on both axes to rank Q3 tasks by impact and urgency",
    expectedShape: { layoutIn: ["matrix", "grid"] },
  },
  {
    name: "venn shape",
    description:
      "Show the overlap between engineering, design, and product disciplines at our company — a 3-circle venn",
    expectedShape: { layoutIn: ["kanban", "grid"], chromeIn: ["venn", undefined, null] },
  },
  {
    name: "process flow with swimlanes",
    description:
      "Map our incident response process across four teams — on-call engineer, incident commander, customer comms, postmortem owner — with arrows for handoffs and decisions",
    expectedShape: { layoutIn: ["grid", "kanban"], connectorsRequired: true },
  },
];

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

function fmt(o) {
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

async function describe(description) {
  const res = await fetch(`${BASE}/api/framework-describe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description, existingIds: [] }),
  });
  const body = await res.json().catch(() => ({ parseError: true }));
  return { status: res.status, body };
}

function checkShape(body, expected) {
  const problems = [];
  if (!body?.ok) {
    problems.push(`server returned ok=false: ${body?.error ?? "(no error field)"}`);
    return problems;
  }
  if (body.mode !== "universal") {
    problems.push(`mode should be "universal", got "${body.mode}"`);
  }
  const cfg = body.config ?? {};
  if (expected.layoutIn && !expected.layoutIn.includes(cfg.layout)) {
    problems.push(
      `layout "${cfg.layout}" not in expected set ${JSON.stringify(expected.layoutIn)}`
    );
  }
  if (expected.chromeIn) {
    const actual = cfg.chrome?.kind ?? null;
    if (!expected.chromeIn.includes(actual) && !expected.chromeIn.includes(undefined)) {
      problems.push(
        `chrome.kind "${actual}" not in expected set ${JSON.stringify(expected.chromeIn)}`
      );
    }
  }
  if (expected.connectorsRequired && !cfg.connectors?.enabled) {
    problems.push("connectors should be enabled for this prompt");
  }
  return problems;
}

const startedAt = Date.now();
console.log(`[smoke-describe] base=${BASE}, ${PROMPTS.length} prompts\n`);

const results = [];
for (let i = 0; i < PROMPTS.length; i++) {
  const p = PROMPTS[i];
  const n = `${i + 1}/${PROMPTS.length}`;
  process.stdout.write(`[${n}] ${p.name} … `);
  const t0 = Date.now();
  let outcome;
  try {
    const { status, body } = await describe(p.description);
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    if (status !== 200 || !body?.ok) {
      console.log(`FAIL (${dur}s, http ${status})`);
      console.log(`    error: ${body?.error ?? "(no error)"}`);
      outcome = { ok: false, name: p.name, error: body?.error ?? `http ${status}` };
    } else {
      const problems = checkShape(body, p.expectedShape);
      const cfg = body.config;
      const shape = `layout=${cfg.layout}${cfg.chrome?.kind ? ` chrome=${cfg.chrome.kind}` : ""}${cfg.connectors?.enabled ? " connectors" : ""} cols=${cfg.seed.cols.length} rows=${cfg.seed.rows.length} cards=${body.populatedMap?.cards?.length ?? 0}`;
      if (problems.length === 0) {
        console.log(`ok  (${dur}s) ${shape}`);
        outcome = { ok: true, name: p.name, shape };
      } else {
        console.log(`soft-fail (${dur}s) ${shape}`);
        for (const pr of problems) console.log(`    · ${pr}`);
        outcome = { ok: false, name: p.name, soft: true, shape, problems };
      }
    }
  } catch (e) {
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`THROW (${dur}s)`);
    console.log(`    ${e?.message ?? e}`);
    outcome = { ok: false, name: p.name, error: e?.message ?? String(e) };
  }
  results.push(outcome);
}

const totalDur = ((Date.now() - startedAt) / 1000).toFixed(1);
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n[smoke-describe] ${passed}/${results.length} passed in ${totalDur}s`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  ✗ ${r.name}`);
    if (r.error) console.log(`      error: ${r.error}`);
    if (r.problems) for (const p of r.problems) console.log(`      · ${p}`);
  }
  process.exit(1);
}
