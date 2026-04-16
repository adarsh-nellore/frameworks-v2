import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// JTBD Canvas: sections are cols, single virtual row "r0".
// Cards stack within each section col.
const seed: UniversalMap = {
  id: "template",
  title: "Regulatory Affairs Daily Workflow",
  meta: {
    jobPerformer: "Early-career regulatory affairs professionals at small-to-mid-sized pharma companies",
    coreJobStatement:
      "When I'm responsible for keeping our submissions current, I want a reliable way to identify which FDA guidance changes affect my work, so I can act on them before they cause delays or compliance gaps.",
  },
  cols: [
    { id: "c1", label: "Functional Jobs",    kind: "functional_jobs" },
    { id: "c2", label: "Emotional Jobs",     kind: "emotional_jobs" },
    { id: "c3", label: "Social Jobs",        kind: "social_jobs" },
    { id: "c4", label: "Desired Outcomes",   kind: "desired_outcomes" },
    { id: "c5", label: "Current Solutions",  kind: "current_solutions" },
    { id: "c6", label: "Pain Points",        kind: "pain_points" },
    { id: "c7", label: "Context & Triggers", kind: "context_triggers" },
    { id: "c8", label: "Hiring Criteria",    kind: "hiring_criteria" },
    { id: "c9", label: "Firing Criteria",    kind: "firing_criteria" },
  ],
  // Single virtual row — all cards share it
  rows: [{ id: "r0", label: "", kind: "default" }],
  cards: [
    { id: "k1",  colId: "c1", rowId: "r0", text: "Track new and revised FDA **guidance documents** weekly", order: 0 },
    { id: "k2",  colId: "c1", rowId: "r0", text: "Map each change to active and pending submissions", order: 1 },
    { id: "k3",  colId: "c1", rowId: "r0", text: "Brief the project team on relevant updates", order: 2 },

    { id: "k4",  colId: "c2", rowId: "r0", text: "Feel **confident** I haven't missed anything important", order: 0, meta: { priority: "high" } },
    { id: "k5",  colId: "c2", rowId: "r0", text: "Reduce the anxiety of unknown compliance gaps", order: 1 },

    { id: "k6",  colId: "c3", rowId: "r0", text: "Be seen as the team's reliable regulatory expert", order: 0 },
    { id: "k7",  colId: "c3", rowId: "r0", text: "Avoid being the person who **missed** something", order: 1 },

    { id: "k8",  colId: "c4", rowId: "r0", text: "Minimize time from FDA publication to my awareness", order: 0, meta: { priority: "high" } },
    { id: "k9",  colId: "c4", rowId: "r0", text: "Maximize signal-to-noise across ==300+== guidance docs/year", order: 1, meta: { priority: "high" } },
    { id: "k10", colId: "c4", rowId: "r0", text: "Reduce manual triage effort to under ==15 min/day==", order: 2, meta: { priority: "medium" } },

    { id: "k11", colId: "c5", rowId: "r0", text: "FDA email subscriptions (high noise, low precision)", order: 0 },
    { id: "k12", colId: "c5", rowId: "r0", text: "RAPS news feeds and webinars", order: 1 },
    { id: "k13", colId: "c5", rowId: "r0", text: "Manual weekly check of FDA.gov/regulatory-information", order: 2 },

    { id: "k14", colId: "c6", rowId: "r0", text: "Email floods with **irrelevant** alerts I have to scan", order: 0 },
    { id: "k15", colId: "c6", rowId: "r0", text: "No connection between guidance and my actual products", order: 1, meta: { priority: "high" } },
    { id: "k16", colId: "c6", rowId: "r0", text: "Discover relevant changes ==weeks late== from secondary sources", order: 2 },

    { id: "k17", colId: "c7", rowId: "r0", text: "Daily morning ritual before standups", order: 0 },
    { id: "k18", colId: "c7", rowId: "r0", text: "Right before regulatory team meetings", order: 1 },
    { id: "k19", colId: "c7", rowId: "r0", text: "When a submission is in active review at FDA", order: 2 },

    { id: "k20", colId: "c8", rowId: "r0", text: "Filters by product code and therapeutic area", order: 0 },
    { id: "k21", colId: "c8", rowId: "r0", text: "Connects guidance to my submissions automatically", order: 1 },

    { id: "k22", colId: "c9", rowId: "r0", text: "Too many false positives — I stop trusting the alerts", order: 0 },
    { id: "k23", colId: "c9", rowId: "r0", text: "Misses guidance that affected my work", order: 1 },
  ],
};

export const jtbdCanvasConfig: FrameworkConfig = {
  id: "jtbd-canvas",
  label: "JTBD Canvas",
  layout: "kanban",
  colNoun: "Section",
  rowNoun: "Row",
  cardNoun: "Card",
  heroMetaFields: [
    { key: "jobPerformer",      label: "Job Performer",       placeholder: "Who is trying to get this job done?" },
    { key: "coreJobStatement",  label: "Core Job Statement",  placeholder: "When I… I want to… So I can…" },
  ],
  cardMetaFields: [
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: ["high", "medium", "low"],
      nullable: true,
    },
  ],
  seed,
  exampleInstructions: [
    "Add a 'Metrics' section with success criteria cards",
    "Promote all high-priority desired outcomes to the top",
    "Split 'Functional Jobs' into 'Core Jobs' and 'Related Jobs'",
    "Add a 'Workarounds' section between Current Solutions and Pain Points",
  ],
  chatPlaceholder: "Refine the jobs canvas…",
  chatSubtitle: "Editing functional, emotional, and social jobs",
  structuringPrompt: `
You are building a **Jobs-to-be-Done (JTBD) Canvas** — a structured artifact that captures what a job performer is trying to accomplish and the forces driving and blocking their behavior.

**Col = Section**: A named category of insight. Classic section kinds:
- functional_jobs    — the practical tasks they need to do
- emotional_jobs     — how they want to feel while doing it
- social_jobs        — how they want to be perceived by others
- desired_outcomes   — measurable criteria for success ("Minimize time from X to Y")
- current_solutions  — what they use today (products, workarounds, habits)
- pain_points        — where current solutions fail them
- context_triggers   — when/where the job becomes active
- hiring_criteria    — what would make them switch to a new solution
- firing_criteria    — what would make them abandon a solution

The agent may invent new section kinds (e.g. "metrics", "workarounds") as snake_case strings.

**Row**: This framework uses a single virtual row. All cards share \`rowId: "r0"\`. Do not add rows.

**Card density**: Sections typically hold 2–6 cards each. More is fine for pain_points and desired_outcomes.

**Card meta**: Use \`setCardMeta\` with key \`priority\` and value \`"high"\`, \`"medium"\`, or \`"low"\` (or \`null\` to remove).

**Hero meta**: Use \`setMapMeta\` with keys \`jobPerformer\` and \`coreJobStatement\`.
The core job statement should follow: "When [situation], I want to [motivation], so I can [expected outcome]."
  `.trim(),
};
