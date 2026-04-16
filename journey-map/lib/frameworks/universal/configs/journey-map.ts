import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// Journey map seed translated to UniversalMap.
// Cols = stages (left→right), rows = swim lanes (top→bottom).
// Cards are sparse — ~60% fill is intentional.
const seed: UniversalMap = {
  id: "template",
  title: "SaaS Trial-to-Value Journey",
  meta: { persona: "Operations Manager at a mid-sized SaaS company" },
  cols: [
    { id: "c1", label: "Awareness",      kind: "awareness" },
    { id: "c2", label: "Consideration",  kind: "consideration" },
    { id: "c3", label: "Decision",       kind: "decision" },
    { id: "c4", label: "Onboarding",     kind: "onboarding" },
    { id: "c5", label: "Retention",      kind: "retention" },
    { id: "c6", label: "Advocacy",       kind: "advocacy" },
  ],
  rows: [
    { id: "r1", label: "Actions",      kind: "actions" },
    { id: "r2", label: "Touchpoints",  kind: "touchpoints" },
    { id: "r3", label: "Thoughts",     kind: "thoughts" },
    { id: "r4", label: "Emotions",     kind: "emotions" },
    { id: "r5", label: "Pain Points",  kind: "pain_points" },
    { id: "r6", label: "Opportunities",kind: "opportunities" },
  ],
  cards: [
    // Actions
    { id: "k1",  colId: "c1", rowId: "r1", text: "Reads a peer comparison article", order: 0 },
    { id: "k2",  colId: "c2", rowId: "r1", text: "Skims pricing and **feature** pages", order: 0 },
    { id: "k3",  colId: "c3", rowId: "r1", text: "Starts a ==free trial==", order: 0 },
    { id: "k4",  colId: "c4", rowId: "r1", text: "Invites two teammates", order: 0 },
    { id: "k5",  colId: "c5", rowId: "r1", text: "Renews annually", order: 0 },
    { id: "k6",  colId: "c6", rowId: "r1", text: "Posts a case study on LinkedIn", order: 0 },
    // Touchpoints
    { id: "k7",  colId: "c1", rowId: "r2", text: "Search, LinkedIn, peer Slack groups", order: 0 },
    { id: "k8",  colId: "c2", rowId: "r2", text: "Marketing site, sales demo", order: 0 },
    { id: "k9",  colId: "c3", rowId: "r2", text: "Web app, welcome email", order: 0 },
    { id: "k10", colId: "c5", rowId: "r2", text: "In-app notifications, QBRs", order: 0 },
    { id: "k11", colId: "c6", rowId: "r2", text: "Community forum, referral link", order: 0 },
    // Thoughts
    { id: "k12", colId: "c1", rowId: "r3", text: "\"Is this better than what we have?\"", order: 0 },
    { id: "k13", colId: "c2", rowId: "r3", text: "\"Will this scale to our team?\"", order: 0 },
    { id: "k14", colId: "c4", rowId: "r3", text: "\"Where do I even start?\"", order: 0 },
    { id: "k15", colId: "c6", rowId: "r3", text: "\"My team would love this\"", order: 0 },
    // Emotions
    { id: "k16", colId: "c1", rowId: "r4", text: "Curious", order: 0 },
    { id: "k17", colId: "c3", rowId: "r4", text: "Cautiously optimistic", order: 0 },
    { id: "k18", colId: "c4", rowId: "r4", text: "Overwhelmed", order: 0 },
    { id: "k19", colId: "c5", rowId: "r4", text: "Confident", order: 0 },
    { id: "k20", colId: "c6", rowId: "r4", text: "Proud", order: 0 },
    // Pain Points
    { id: "k21", colId: "c2", rowId: "r5", text: "Pricing page hides team tiers", order: 0 },
    { id: "k22", colId: "c4", rowId: "r5", text: "==Setup== feels heavy for a trial", order: 0 },
    { id: "k23", colId: "c5", rowId: "r5", text: "Unclear which metrics matter", order: 0 },
    // Opportunities
    { id: "k24", colId: "c2", rowId: "r6", text: "Side-by-side competitor breakdown", order: 0 },
    { id: "k25", colId: "c4", rowId: "r6", text: "**Guided** setup with sample data", order: 0 },
    { id: "k26", colId: "c5", rowId: "r6", text: "Health score dashboards", order: 0 },
    { id: "k27", colId: "c6", rowId: "r6", text: "Referral rewards and badges", order: 0 },
  ],
};

export const journeyMapConfig: FrameworkConfig = {
  id: "journey-map",
  label: "Customer Journey Map",
  layout: "grid",
  colNoun: "Stage",
  rowNoun: "Lane",
  cardNoun: "Card",
  heroMetaFields: [
    { key: "persona", label: "Persona", placeholder: "Who is this journey for?" },
  ],
  seed,
  exampleInstructions: [
    "Add a 'Post-Purchase' stage between Decision and Onboarding",
    "Replace the Emotions row with a 'Satisfaction Score' row",
    "Fill in all the pain points across every stage",
    "Rewrite the Advocacy stage to reflect a B2B referral program",
  ],
  chatPlaceholder: "Reshape the journey…",
  chatSubtitle: "Editing stages, lanes, and moments",
  structuringPrompt: `
You are building a **Customer Journey Map** — a timeline of how a specific persona moves through an experience, from first awareness to long-term advocacy.

**Col = Stage**: A named phase of the journey (e.g. "Awareness", "Onboarding"). Add as many as the story requires. Stages flow left→right chronologically.

**Row = Swim Lane**: A typed lens on the experience. Classic kinds:
- actions       — what the user does
- touchpoints   — channels and surfaces they interact with
- thoughts      — what they're thinking (often a direct quote or inner monologue)
- emotions      — how they feel (a single word or short phrase)
- pain_points   — friction, gaps, and frustrations
- opportunities — design interventions that would help

The agent may invent new row kinds (e.g. "metrics", "stakeholders", "systems") as snake_case strings.

**Card density**: Sparse is correct. Aim for ~50–70% fill. Empty cells are not a failure — they signal "nothing notable here."

**Meta fields**: Use \`setMapMeta\` with key \`persona\` to set the journey persona.
  `.trim(),
};
