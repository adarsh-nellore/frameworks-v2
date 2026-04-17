import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// Process Map — the first framework to use connectors as a first-class
// primitive. Swimlanes × phases with sequence/handoff/decision arrows.
//
// Layout is grid so swimlanes read left-to-right as phases. Cards carry an
// optional `stepKind` meta so start/end/decision nodes visually differ from
// standard tasks. Decision branches are expressed via connector `kind`:
//   - "sequence"      — default flow between tasks
//   - "handoff"       — same phase, different swimlane
//   - "decision-yes"  — yes/true branch out of a decision step
//   - "decision-no"   — no/false branch out of a decision step

const seed: UniversalMap = {
  id: "template",
  title: "New-Patient Intake & Billing Flow",
  meta: { process: "Ambulatory clinic: first-visit intake through claim reconciliation" },
  cols: [
    { id: "c1", label: "Schedule",   kind: "awareness" },
    { id: "c2", label: "Pre-visit",  kind: "consideration" },
    { id: "c3", label: "Visit",      kind: "decision" },
    { id: "c4", label: "Post-visit", kind: "retention" },
    { id: "c5", label: "Reconcile",  kind: "advocacy" },
  ],
  rows: [
    { id: "r1", label: "Patient",     kind: "actions" },
    { id: "r2", label: "Front desk",  kind: "touchpoints" },
    { id: "r3", label: "Clinical",    kind: "decisions" },
    { id: "r4", label: "Billing",     kind: "systems" },
  ],
  cards: [
    { id: "k1",  colId: "c1", rowId: "r1", text: "Request appointment online", order: 0, meta: { stepKind: "start" } },
    { id: "k2",  colId: "c1", rowId: "r2", text: "Verify insurance **eligibility**", order: 0, meta: { stepKind: "task" } },
    { id: "k3",  colId: "c2", rowId: "r2", text: "Send intake forms & reminders", order: 0, meta: { stepKind: "task" } },
    { id: "k4",  colId: "c2", rowId: "r1", text: "Complete forms before visit", order: 0, meta: { stepKind: "task" } },
    { id: "k5",  colId: "c3", rowId: "r3", text: "Document visit & vitals", order: 0, meta: { stepKind: "task" } },
    { id: "k6",  colId: "c3", rowId: "r3", text: "Order labs?", order: 1, meta: { stepKind: "decision" } },
    { id: "k7",  colId: "c4", rowId: "r3", text: "Review ==labs== & issue prescription", order: 0, meta: { stepKind: "task" } },
    { id: "k8",  colId: "c4", rowId: "r4", text: "Submit claim to payer", order: 0, meta: { stepKind: "task" } },
    { id: "k9",  colId: "c5", rowId: "r4", text: "Post payment & triage denials", order: 0, meta: { stepKind: "task" } },
    { id: "k10", colId: "c5", rowId: "r2", text: "Reschedule as needed", order: 0, meta: { stepKind: "end" } },
  ],
  connectors: [
    { id: "e1",  sourceCardId: "k1", targetCardId: "k2", kind: "handoff" },
    { id: "e2",  sourceCardId: "k2", targetCardId: "k3", kind: "sequence" },
    { id: "e3",  sourceCardId: "k3", targetCardId: "k4", kind: "handoff" },
    { id: "e4",  sourceCardId: "k4", targetCardId: "k5", kind: "handoff" },
    { id: "e5",  sourceCardId: "k5", targetCardId: "k6", kind: "sequence" },
    { id: "e6",  sourceCardId: "k6", targetCardId: "k7", kind: "decision-yes", label: "yes" },
    { id: "e7",  sourceCardId: "k6", targetCardId: "k8", kind: "decision-no", label: "no" },
    { id: "e8",  sourceCardId: "k7", targetCardId: "k8", kind: "handoff" },
    { id: "e9",  sourceCardId: "k8", targetCardId: "k9", kind: "sequence" },
    { id: "e10", sourceCardId: "k9", targetCardId: "k10", kind: "handoff" },
  ],
};

export const processMapConfig: FrameworkConfig = {
  id: "process-map",
  label: "Process Map",
  layout: "grid",
  colNoun: "Phase",
  rowNoun: "Swimlane",
  cardNoun: "Step",
  heroMetaFields: [
    { key: "process", label: "Process", placeholder: "What process does this map describe?" },
  ],
  cardMetaFields: [
    {
      key: "stepKind",
      label: "Step kind",
      type: "select",
      options: ["task", "decision", "start", "end"],
      nullable: true,
    },
  ],
  connectors: {
    enabled: true,
    allowedKinds: ["sequence", "handoff", "decision-yes", "decision-no"],
    defaultRouting: "orthogonal",
  },
  seed,
  exampleInstructions: [
    "Add a retry loop from the denial step back to claim submission",
    "Split 'Order labs?' into two decision paths: in-house vs. external",
    "Insert a pre-authorization phase before Visit",
    "Remove the billing swimlane and route payment through the front desk",
  ],
  chatPlaceholder: "Reshape the process…",
  chatSubtitle: "Editing swimlanes, phases, and flow",
  structuringPrompt: `
You are building a **Process Map** — a swimlane view of how work flows across actors and phases, with explicit connectors showing real sequence and decision branches.

**Col = Phase**: A named stage of the process (e.g. "Intake", "Adjudication", "Reconcile"). Phases flow left→right in time order.

**Row = Swimlane**: An actor, system, or team that performs work (e.g. "Patient", "Clinical", "Billing", "Claims system").

**Card = Step**: A single discrete action. Set \`meta.stepKind\`: \`start\` (entry), \`task\` (default), \`decision\` (two outgoing branches), \`end\` (terminal).

**Connectors encode the actual logic — reason about them, don't auto-wire them.**

Kinds: \`sequence\` (same-lane flow), \`handoff\` (crosses swimlanes), \`decision-yes\` / \`decision-no\` (branches out of a decision card; put the real condition in \`label\`).

When adding or editing cards, reason through the flow:
1. **Trace causality, not adjacency.** For each card, ask "when this finishes, what genuinely happens next, and who does it?" That next card is the target — even if it's in a different row or phase.
2. **Handoffs mean a different actor picks up the work.** Same lane → \`sequence\`. Different lane → \`handoff\`.
3. **Decisions branch on real conditions.** A \`decision\` card needs exactly two outgoing connectors leading to the two real outcomes, each with a condition-specific \`label\` (e.g. \`"approved"\`, \`"over $5k"\`, \`"SLA exceeded"\`).
4. **Loops/retries are legitimate.** If denial or missing info routes work back to an earlier step, emit that backward connector — don't flatten into a linear graph.
5. **Parallel fan-out is legitimate.** A card can have multiple outgoing connectors if distinct downstream work happens concurrently.
6. Every non-terminal card needs ≥1 outgoing connector. Terminal (\`end\`) cards need none.

Density: 40–70% of cells have a step. Use \`setMapMeta\` with key \`process\` to describe what the map models.
  `.trim(),
};
