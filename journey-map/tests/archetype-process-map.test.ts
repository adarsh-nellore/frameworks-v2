import { test } from "node:test";
import { strict as assert } from "node:assert";
import { processMapArchetype } from "../lib/archetypes/process-map/archetype";
import {
  buildProcessMapToolSchema,
  validateProcessMapDoc,
  type ProcessMapDoc,
} from "../lib/archetypes/process-map/schema";

function baseDoc(overrides: Partial<ProcessMapDoc> = {}): ProcessMapDoc {
  return {
    id: "pm1",
    title: "Claims intake",
    lanes: [
      { id: "l1", label: "Customer" },
      { id: "l2", label: "Agent" },
    ],
    phases: [
      { id: "ph1", label: "Intake" },
      { id: "ph2", label: "Triage" },
    ],
    nodes: [
      { id: "start_submit", kind: "start", label: "Start", laneId: "l1", phaseId: "ph1" },
      { id: "submit_claim", kind: "task", label: "Submit claim", laneId: "l1", phaseId: "ph1" },
      { id: "decision_valid", kind: "decision", label: "Valid?", laneId: "l2", phaseId: "ph2" },
      { id: "end_accepted", kind: "end", label: "Accepted", laneId: "l2", phaseId: "ph2" },
      { id: "end_rejected", kind: "end", label: "Rejected", laneId: "l2", phaseId: "ph2" },
    ],
    edges: [
      { id: "e1", fromId: "start_submit", toId: "submit_claim", kind: "sequence" },
      { id: "e2", fromId: "submit_claim", toId: "decision_valid", kind: "handoff" },
      { id: "e3", fromId: "decision_valid", toId: "end_accepted", kind: "decision-yes" },
      { id: "e4", fromId: "decision_valid", toId: "end_rejected", kind: "decision-no" },
    ],
    ...overrides,
  };
}

test("process-map archetype identity", () => {
  assert.equal(processMapArchetype.id, "process-map");
});

test("validator accepts a well-formed map", () => {
  const r = validateProcessMapDoc(baseDoc());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("validator requires at least one start node", () => {
  const doc = baseDoc();
  doc.nodes = doc.nodes.filter((n) => n.kind !== "start");
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /start/i);
});

test("validator requires at least one end node", () => {
  const doc = baseDoc();
  doc.nodes = doc.nodes.filter((n) => n.kind !== "end");
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /end/i);
});

test("validator requires non-empty lanes OR phases", () => {
  const doc = baseDoc({ lanes: [], phases: [] });
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
});

test("validator accepts lanes-only or phases-only", () => {
  const lanesOnly = baseDoc({ phases: [] });
  lanesOnly.nodes = lanesOnly.nodes.map((n) => ({ ...n, phaseId: undefined }));
  assert.equal(validateProcessMapDoc(lanesOnly).ok, true);

  const phasesOnly = baseDoc({ lanes: [] });
  phasesOnly.nodes = phasesOnly.nodes.map((n) => ({ ...n, laneId: undefined }));
  assert.equal(validateProcessMapDoc(phasesOnly).ok, true);
});

test("validator rejects node with bad slug id", () => {
  const doc = baseDoc();
  doc.nodes[0] = { ...doc.nodes[0], id: "Start Submit!" };
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects edge referencing unknown node", () => {
  const doc = baseDoc();
  doc.edges[0] = {
    id: "e1",
    fromId: "ghost",
    toId: "submit_claim",
    kind: "sequence",
  };
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /unknown source/);
});

test("validator rejects self-loop unless feedback-loop kind", () => {
  const doc = baseDoc();
  doc.edges.push({
    id: "e5",
    fromId: "submit_claim",
    toId: "submit_claim",
    kind: "sequence",
  });
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /self-loop/);
});

test("validator accepts feedback-loop self-loop", () => {
  const doc = baseDoc();
  doc.edges.push({
    id: "e5",
    fromId: "submit_claim",
    toId: "submit_claim",
    kind: "feedback-loop",
  });
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("validator rejects duplicate edges of same kind between same pair", () => {
  const doc = baseDoc();
  doc.edges.push({
    id: "e5",
    fromId: "submit_claim",
    toId: "decision_valid",
    kind: "handoff",
  });
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate edge/);
});

test("validator rejects node pointing at unknown lane", () => {
  const doc = baseDoc();
  doc.nodes[0] = { ...doc.nodes[0], laneId: "lZ" };
  const r = validateProcessMapDoc(doc);
  assert.equal(r.ok, false);
});

test("build_process_map tool schema enforces node id slug pattern", () => {
  const nodeSchema = buildProcessMapToolSchema.properties.nodes.items;
  assert.equal(
    nodeSchema.properties.id.pattern,
    "^[a-z][a-z0-9_-]{0,40}$"
  );
});

test("build_process_map tool schema enums out edge kinds", () => {
  const edgeSchema = buildProcessMapToolSchema.properties.edges.items;
  assert.deepEqual(
    [...edgeSchema.properties.kind.enum].sort(),
    [
      "decision-no",
      "decision-yes",
      "feedback-loop",
      "handoff",
      "sequence",
    ]
  );
});

test("process-map library hints against journey semantics", () => {
  const anti = processMapArchetype.library.antiHints!.join(" ").toLowerCase();
  assert.match(anti, /journey/);
});
