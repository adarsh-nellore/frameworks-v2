import { test } from "node:test";
import { strict as assert } from "node:assert";
import { applyOps, validateMap, type UniversalMap, type Op } from "../lib/frameworks/universal";

// Simulate what happens when the agent returns ops and the client applies them.
// This catches issues like ops referencing IDs that don't exist yet, ordering
// problems, or state corruption from sequential apply.

const journeyMapBase: UniversalMap = {
  id: "test",
  title: "SaaS Trial-to-Value Journey",
  meta: { persona: "Operations Manager" },
  cols: [
    { id: "c1", label: "Awareness", kind: "awareness" },
    { id: "c2", label: "Consideration", kind: "consideration" },
    { id: "c3", label: "Decision", kind: "decision" },
    { id: "c4", label: "Onboarding", kind: "onboarding" },
  ],
  rows: [
    { id: "r1", label: "Actions", kind: "actions" },
    { id: "r2", label: "Pain Points", kind: "pain_points" },
  ],
  cards: [
    { id: "k1", colId: "c1", rowId: "r1", text: "Reads a comparison article", order: 0 },
    { id: "k2", colId: "c3", rowId: "r1", text: "Starts a free trial", order: 0 },
    { id: "k3", colId: "c4", rowId: "r2", text: "Setup feels heavy", order: 0 },
  ],
};

test("Real agent op batch (insert col + new card) round-trips cleanly", () => {
  // This is the actual ops batch from the live arrange test
  const agentOps: Op[] = [
    { op: "addCol", label: "Post-Trial", kind: "post_trial", atIndex: 3 },
    {
      op: "addCard",
      colId: "c5", // Forward reference — c5 is the new col's ID
      rowId: "r1",
      text: "**Schedules** a ==15-minute== onboarding call with customer success team",
    },
  ];

  const result = applyOps(journeyMapBase, agentOps);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // New col should be at index 3, between Decision and Onboarding
  assert.equal(result.map.cols.length, 5);
  assert.equal(result.map.cols[3].label, "Post-Trial");
  assert.equal(result.map.cols[3].id, "c5");
  assert.equal(result.map.cols[4].label, "Onboarding");

  // New card should be in c5/r1
  const newCard = result.map.cards.find((c) => c.colId === "c5");
  assert.ok(newCard);
  assert.match(newCard!.text, /Schedules/);
  assert.match(newCard!.text, /15-minute/);

  // Original cards untouched
  assert.equal(result.map.cards.filter((c) => c.id === "k1")[0].text, "Reads a comparison article");
});

test("JTBD agent batch (3 cards with priority meta) applies cleanly", () => {
  const jtbdBase: UniversalMap = {
    id: "test",
    title: "Reg Affairs",
    meta: { jobPerformer: "RA professional", coreJobStatement: "..." },
    cols: [
      { id: "c1", label: "Functional Jobs", kind: "functional_jobs" },
      { id: "c4", label: "Desired Outcomes", kind: "desired_outcomes" },
    ],
    rows: [{ id: "r0", label: "", kind: "default" }],
    cards: [{ id: "k1", colId: "c1", rowId: "r0", text: "Track FDA guidance docs weekly", order: 0 }],
  };

  const agentOps: Op[] = [
    {
      op: "addCard",
      colId: "c4",
      rowId: "r0",
      text: "Minimize time from **regulatory update** to ==compliance gap== identification",
      meta: { priority: "high" },
    },
    {
      op: "addCard",
      colId: "c4",
      rowId: "r0",
      text: "Reduce ==gap detection== cycle from weeks to **days** after guidance changes",
      meta: { priority: "high" },
    },
    {
      op: "addCard",
      colId: "c4",
      rowId: "r0",
      text: "**Identify** ==90%== of compliance gaps before scheduled external audits",
      meta: { priority: "high" },
    },
  ];

  const result = applyOps(jtbdBase, agentOps);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const cards = result.map.cards.filter((c) => c.colId === "c4");
  assert.equal(cards.length, 3);
  for (const c of cards) {
    assert.equal(c.meta?.priority, "high");
  }
  // Order should be 0, 1, 2 in insertion order
  assert.deepEqual(
    cards.map((c) => c.order).sort(),
    [0, 1, 2]
  );
});

test("Affinity agent batch (addCol + addCards using new colId) applies cleanly", () => {
  const base: UniversalMap = {
    id: "test",
    title: "Research",
    meta: { context: "User interviews" },
    cols: [{ id: "c0", label: "Ungrouped", kind: "ungrouped" }],
    rows: [
      { id: "r1", label: "Observation", kind: "observation" },
      { id: "r2", label: "Quote", kind: "quote" },
      { id: "r3", label: "Insight", kind: "insight" },
      { id: "r4", label: "Need", kind: "need" },
    ],
    cards: [],
  };

  // The agent emitted addCol first, then 3 addCards using c1 (the next ID).
  const agentOps: Op[] = [
    { op: "addCol", label: "Trust Signals", kind: "theme" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "Users **check** for security badges and ==SSL certificates==" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "Participants **scrolled** to footer looking for ==physical address==" },
    { op: "addCard", colId: "c1", rowId: "r3", text: "Trust must be **proven** repeatedly across multiple touchpoints" },
  ];

  const result = applyOps(base, agentOps);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // Verify the new col exists and got id c1
  assert.equal(result.map.cols.length, 2);
  const trustCol = result.map.cols.find((c) => c.label === "Trust Signals");
  assert.ok(trustCol);
  assert.equal(trustCol!.id, "c1");

  // 3 cards in c1
  const inTrust = result.map.cards.filter((c) => c.colId === "c1");
  assert.equal(inTrust.length, 3);
  // 2 in r1 (observations), 1 in r3 (insight)
  assert.equal(inTrust.filter((c) => c.rowId === "r1").length, 2);
  assert.equal(inTrust.filter((c) => c.rowId === "r3").length, 1);
});

test("Competitive map agent batch (addRow + 3 cell assessments) applies cleanly", () => {
  const base: UniversalMap = {
    id: "test",
    title: "Comp Map",
    meta: { xAxisLabel: "Specialization", yAxisLabel: "Depth" },
    cols: [
      { id: "c1", label: "Mahogany", kind: "subject" },
      { id: "c2", label: "Citeline", kind: "competitor" },
      { id: "c3", label: "Veeva", kind: "competitor" },
    ],
    rows: [{ id: "r1", label: "Target Market", kind: "criterion" }],
    cards: [
      { id: "k1", colId: "c1", rowId: "r1", text: "Small-mid pharma", order: 0 },
      { id: "k2", colId: "c2", rowId: "r1", text: "Large pharma + CROs", order: 0 },
      { id: "k3", colId: "c3", rowId: "r1", text: "Enterprise pharma", order: 0 },
    ],
  };

  const agentOps: Op[] = [
    { op: "addRow", label: "Pricing Model", kind: "criterion" },
    { op: "addCard", colId: "c1", rowId: "r2", text: "**Flexible** usage-based pricing starting at ==$5k/month==" },
    { op: "addCard", colId: "c2", rowId: "r2", text: "**Annual enterprise contracts**, typically ==$100k+==" },
    { op: "addCard", colId: "c3", rowId: "r2", text: "**Premium** per-seat licensing, ==~$500/user/month==" },
  ];

  const result = applyOps(base, agentOps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // New row r2 exists
  assert.equal(result.map.rows.length, 2);
  assert.equal(result.map.rows[1].id, "r2");
  // 3 new cards in r2
  assert.equal(result.map.cards.filter((c) => c.rowId === "r2").length, 3);
});

test("Generated map from /api/generate validates as UniversalMap", () => {
  // This is the full map that the live generate route produced.
  const generatedMap = {
    id: "generated",
    title: "Regulatory Affairs Daily Workflow",
    meta: {
      jobPerformer: "Sarah, Regulatory Affairs Manager at mid-size pharma",
      coreJobStatement: "When managing regulatory compliance...",
    },
    cols: [
      { id: "c1", label: "Functional Jobs", kind: "functional_jobs" },
      { id: "c4", label: "Desired Outcomes", kind: "desired_outcomes" },
    ],
    rows: [{ id: "r0", label: "", kind: "default" }],
    cards: [
      { id: "k1", colId: "c1", rowId: "r0", text: "**Monitor** FDA changes", order: 0 },
      { id: "k14", colId: "c4", rowId: "r0", text: "Achieve **zero late discoveries**", order: 3, meta: { priority: "high" } },
    ],
  };

  const v = validateMap(generatedMap);
  assert.equal(v.ok, true);

  // Subsequent agent ops on this map should work
  const r = applyOps(generatedMap as UniversalMap, [
    { op: "addCard", colId: "c4", rowId: "r0", text: "Another outcome" },
  ]);
  assert.equal(r.ok, true);
});
