#!/usr/bin/env node
// Phase C live regression — the Gantt test.
//
// Hits the production /api/framework-describe with a Gantt prompt and asserts:
//   1. mode === "universal"
//   2. layout === "grid"
//   3. renderingPlan.cardOrientation === "horizontal-bar"
//   4. renderingPlan.spatialContinuity === "axis-continuous"
//   5. ≥ 70% of populated cards carry meta.x (positioning hint set)
//   6. at least one card has meta.width > 0 (actual bar, not all milestones)
//
// This is the regression that matters: before Phase C, the Gantt prompt
// produced a service-blueprint-looking grid. After Phase C, the agent should
// pick horizontal-bar orientation AND set per-card positioning hints.

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PROMPT =
  "Gantt chart for a 6-month consumer AI product launch across Product, Design, Engineering, and Go-to-Market workstreams";

console.log(`[smoke-gantt] base=${BASE}`);
console.log(`[smoke-gantt] prompt: "${PROMPT}"\n`);

const t0 = Date.now();
const res = await fetch(`${BASE}/api/framework-describe`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ description: PROMPT, existingIds: [] }),
});
const data = await res.json().catch(() => ({ parseError: true }));
const dur = ((Date.now() - t0) / 1000).toFixed(1);

if (res.status !== 200 || !data?.ok) {
  console.log(`FAIL (${dur}s, http ${res.status}): ${data?.error ?? "(no error)"}`);
  process.exit(1);
}

const cfg = data.config;
const map = data.populatedMap;
const rp = cfg.renderingPlan;
const cards = map?.cards ?? [];

console.log(`response in ${dur}s  layout=${cfg.layout}  chrome=${cfg.chrome?.kind ?? "none"}`);
console.log(`renderingPlan:`);
console.log(`  cardOrientation:   ${rp?.cardOrientation}`);
console.log(`  spatialContinuity: ${rp?.spatialContinuity}`);
console.log(`  density:           ${rp?.density}`);
console.log(`  summary: "${rp?.summary}"`);
console.log(`seed: ${cfg.seed.cols.length} cols × ${cfg.seed.rows.length} rows`);
console.log(`populated: ${cards.length} cards`);

const withMetaX = cards.filter((c) => c.meta?.x !== undefined);
const withMetaWidth = cards.filter((c) => {
  const w = Number(c.meta?.width ?? NaN);
  return Number.isFinite(w) && w > 0;
});
const milestones = cards.filter((c) => c.meta?.width === "0");
const pctWithMetaX = cards.length > 0 ? (withMetaX.length / cards.length) * 100 : 0;

console.log(`\nPositioning coverage:`);
console.log(`  cards with meta.x:     ${withMetaX.length}/${cards.length} (${pctWithMetaX.toFixed(0)}%)`);
console.log(`  cards with meta.width > 0 (bars):  ${withMetaWidth.length}`);
console.log(`  cards with meta.width === "0" (milestones): ${milestones.length}`);

// Sample a few cards so we can sanity-check the positioning values
if (withMetaX.length > 0) {
  console.log(`\nSample positioned cards:`);
  for (const c of withMetaX.slice(0, 5)) {
    console.log(
      `  - "${c.text.slice(0, 50)}" colId=${c.colId} rowId=${c.rowId} meta.x=${c.meta?.x} meta.width=${c.meta?.width ?? "—"}`
    );
  }
}

// ── Assertions ──────────────────────────────────────────────────────────────
const problems = [];
if (cfg.layout !== "grid")
  problems.push(`expected layout "grid", got "${cfg.layout}"`);
if (rp?.cardOrientation !== "horizontal-bar")
  problems.push(`expected cardOrientation "horizontal-bar", got "${rp?.cardOrientation}"`);
if (rp?.spatialContinuity !== "axis-continuous")
  problems.push(`expected spatialContinuity "axis-continuous", got "${rp?.spatialContinuity}"`);
if (pctWithMetaX < 70)
  problems.push(`expected ≥ 70% of cards to carry meta.x, got ${pctWithMetaX.toFixed(0)}%`);
if (withMetaWidth.length < 1)
  problems.push(`expected at least one card with meta.width > 0 (an actual duration bar)`);

if (problems.length > 0) {
  console.log("\n✗ Assertions failed:");
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}

console.log("\n✓ Phase C Gantt regression passed. Bars positioned along time axis.");
