// ---------------------------------------------------------------------------
// Process map archetype: a directed graph of nodes + edges, optionally grouped
// into swimlanes (rows = actors) and phases (cols = stages of time). The
// bespoke shape is a flowchart — not a grid of cards with arrows glued on.
// ---------------------------------------------------------------------------

export type NodeKind = "task" | "decision" | "start" | "end";

export type EdgeKind =
  | "sequence"
  | "handoff"
  | "decision-yes"
  | "decision-no"
  | "feedback-loop";

export type Lane = {
  id: string; // l1, l2, ...
  label: string;
  description?: string;
};

export type Phase = {
  id: string; // ph1, ph2, ...
  label: string;
};

export type ProcessNode = {
  /** Slug: ^[a-z][a-z0-9_-]{0,40}$. Referenced by edges. */
  id: string;
  kind: NodeKind;
  label: string;
  laneId?: string;
  phaseId?: string;
  note?: string;
};

export type ProcessEdge = {
  id: string; // e1, e2, ...
  fromId: string;
  toId: string;
  kind: EdgeKind;
  label?: string;
};

export type ProcessMapDoc = {
  id: string;
  title: string;
  subject?: string;
  lanes: Lane[];
  phases: Phase[];
  nodes: ProcessNode[];
  edges: ProcessEdge[];
};

export type ProcessMapSelection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "lane"; id: string }
  | { type: "phase"; id: string }
  | null;

const LANE_ID = /^l\d+$/;
const PHASE_ID = /^ph\d+$/;
const NODE_ID = /^[a-z][a-z0-9_-]{0,40}$/;
const EDGE_ID = /^e\d+$/;

const NODE_KINDS: ReadonlySet<NodeKind> = new Set([
  "task",
  "decision",
  "start",
  "end",
]);
const EDGE_KINDS: ReadonlySet<EdgeKind> = new Set([
  "sequence",
  "handoff",
  "decision-yes",
  "decision-no",
  "feedback-loop",
]);

export function validateProcessMapDoc(
  doc: unknown
): { ok: true; doc: ProcessMapDoc } | { ok: false; reason: string } {
  if (!doc || typeof doc !== "object")
    return { ok: false, reason: "doc is not an object" };
  const d = doc as ProcessMapDoc;
  if (typeof d.id !== "string" || !d.id) return { ok: false, reason: "missing id" };
  if (typeof d.title !== "string" || !d.title)
    return { ok: false, reason: "missing title" };
  if (d.subject !== undefined && typeof d.subject !== "string")
    return { ok: false, reason: "subject must be string when present" };

  if (!Array.isArray(d.lanes)) return { ok: false, reason: "lanes not an array" };
  if (!Array.isArray(d.phases)) return { ok: false, reason: "phases not an array" };
  if (d.lanes.length === 0 && d.phases.length === 0)
    return { ok: false, reason: "at least one of lanes or phases must be non-empty" };

  const laneIds = new Set<string>();
  const laneLabels = new Set<string>();
  for (const l of d.lanes) {
    if (!l || typeof l !== "object")
      return { ok: false, reason: "lane is not an object" };
    if (typeof l.id !== "string" || !LANE_ID.test(l.id))
      return { ok: false, reason: `lane id "${l.id}" must match ^l\\d+$` };
    if (laneIds.has(l.id))
      return { ok: false, reason: `duplicate lane id "${l.id}"` };
    laneIds.add(l.id);
    if (typeof l.label !== "string" || !l.label.trim())
      return { ok: false, reason: `lane ${l.id} missing label` };
    const lk = l.label.trim().toLowerCase();
    if (laneLabels.has(lk))
      return { ok: false, reason: `duplicate lane label "${l.label}"` };
    laneLabels.add(lk);
  }

  const phaseIds = new Set<string>();
  const phaseLabels = new Set<string>();
  for (const p of d.phases) {
    if (!p || typeof p !== "object")
      return { ok: false, reason: "phase is not an object" };
    if (typeof p.id !== "string" || !PHASE_ID.test(p.id))
      return { ok: false, reason: `phase id "${p.id}" must match ^ph\\d+$` };
    if (phaseIds.has(p.id))
      return { ok: false, reason: `duplicate phase id "${p.id}"` };
    phaseIds.add(p.id);
    if (typeof p.label !== "string" || !p.label.trim())
      return { ok: false, reason: `phase ${p.id} missing label` };
    const lk = p.label.trim().toLowerCase();
    if (phaseLabels.has(lk))
      return { ok: false, reason: `duplicate phase label "${p.label}"` };
    phaseLabels.add(lk);
  }

  if (!Array.isArray(d.nodes) || d.nodes.length === 0)
    return { ok: false, reason: "nodes must be a non-empty array" };
  const nodeIds = new Set<string>();
  let startCount = 0;
  let endCount = 0;
  for (const n of d.nodes) {
    if (!n || typeof n !== "object")
      return { ok: false, reason: "node is not an object" };
    if (typeof n.id !== "string" || !NODE_ID.test(n.id))
      return { ok: false, reason: `node id "${n.id}" must be a short snake_case slug` };
    if (nodeIds.has(n.id))
      return { ok: false, reason: `duplicate node id "${n.id}"` };
    nodeIds.add(n.id);
    if (!NODE_KINDS.has(n.kind))
      return { ok: false, reason: `node ${n.id} bad kind "${n.kind}"` };
    if (typeof n.label !== "string" || !n.label.trim())
      return { ok: false, reason: `node ${n.id} missing label` };
    if (n.laneId !== undefined && !laneIds.has(n.laneId))
      return {
        ok: false,
        reason: `node ${n.id} references unknown lane "${n.laneId}"`,
      };
    if (n.phaseId !== undefined && !phaseIds.has(n.phaseId))
      return {
        ok: false,
        reason: `node ${n.id} references unknown phase "${n.phaseId}"`,
      };
    if (n.kind === "start") startCount++;
    if (n.kind === "end") endCount++;
  }
  if (startCount === 0)
    return { ok: false, reason: "process must have at least one start node" };
  if (endCount === 0)
    return { ok: false, reason: "process must have at least one end node" };

  if (!Array.isArray(d.edges))
    return { ok: false, reason: "edges not an array" };
  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  for (const e of d.edges) {
    if (!e || typeof e !== "object")
      return { ok: false, reason: "edge is not an object" };
    if (typeof e.id !== "string" || !EDGE_ID.test(e.id))
      return { ok: false, reason: `edge id "${e.id}" must match ^e\\d+$` };
    if (edgeIds.has(e.id))
      return { ok: false, reason: `duplicate edge id "${e.id}"` };
    edgeIds.add(e.id);
    if (!nodeIds.has(e.fromId))
      return {
        ok: false,
        reason: `edge ${e.id} references unknown source "${e.fromId}"`,
      };
    if (!nodeIds.has(e.toId))
      return {
        ok: false,
        reason: `edge ${e.id} references unknown target "${e.toId}"`,
      };
    if (e.fromId === e.toId && e.kind !== "feedback-loop")
      return {
        ok: false,
        reason: `edge ${e.id} is a self-loop but kind is not feedback-loop`,
      };
    const pairKey = `${e.fromId}→${e.toId}:${e.kind}`;
    if (edgePairs.has(pairKey))
      return {
        ok: false,
        reason: `duplicate edge ${pairKey}`,
      };
    edgePairs.add(pairKey);
    if (!EDGE_KINDS.has(e.kind))
      return { ok: false, reason: `edge ${e.id} bad kind "${e.kind}"` };
  }

  return { ok: true, doc: d };
}

export const BUILD_PROCESS_MAP_TOOL_NAME = "build_process_map";
export const BUILD_PROCESS_MAP_TOOL_DESCRIPTION =
  "Emit a complete process map: swimlanes (actors), phases (stages of time), nodes (tasks / decisions / start / end), and directed edges connecting them.";

export const buildProcessMapToolSchema = {
  type: "object",
  required: ["title", "lanes", "phases", "nodes", "edges"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    subject: { type: "string", maxLength: 200 },
    lanes: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["id", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^l\\d+$" },
          label: { type: "string", minLength: 1, maxLength: 60 },
          description: { type: "string", maxLength: 160 },
        },
      },
    },
    phases: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["id", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^ph\\d+$" },
          label: { type: "string", minLength: 1, maxLength: 60 },
        },
      },
    },
    nodes: {
      type: "array",
      minItems: 2,
      maxItems: 80,
      items: {
        type: "object",
        required: ["id", "kind", "label"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: "^[a-z][a-z0-9_-]{0,40}$",
            description:
              "Short snake_case slug (e.g. intake_submitted, decision_approval). MUST NOT be an auto-assigned k\\d+ format.",
          },
          kind: { type: "string", enum: ["task", "decision", "start", "end"] },
          label: { type: "string", minLength: 1, maxLength: 60 },
          laneId: { type: "string", pattern: "^l\\d+$" },
          phaseId: { type: "string", pattern: "^ph\\d+$" },
          note: { type: "string", maxLength: 280 },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "fromId", "toId", "kind"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^e\\d+$" },
          fromId: { type: "string" },
          toId: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "sequence",
              "handoff",
              "decision-yes",
              "decision-no",
              "feedback-loop",
            ],
          },
          label: { type: "string", maxLength: 60 },
        },
      },
    },
  },
} as const;
