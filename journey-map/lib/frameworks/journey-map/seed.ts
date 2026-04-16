import type { Cell, JourneyMap, RowKind } from "./types";

const stages = [
  { id: "s1", label: "Awareness" },
  { id: "s2", label: "Consideration" },
  { id: "s3", label: "Decision" },
  { id: "s4", label: "Onboarding" },
  { id: "s5", label: "Retention" },
  { id: "s6", label: "Advocacy" },
];

const rows: Array<{ id: string; label: string; kind: RowKind }> = [
  { id: "r1", label: "Actions", kind: "actions" },
  { id: "r2", label: "Touchpoints", kind: "touchpoints" },
  { id: "r3", label: "Thoughts", kind: "thoughts" },
  { id: "r4", label: "Emotions", kind: "emotions" },
  { id: "r5", label: "Pain Points", kind: "pain_points" },
  { id: "r6", label: "Opportunities", kind: "opportunities" },
];

// Richer starter — not every position is filled, but the canvas reads as
// populated immediately. Leaves room for the agent or user to fill gaps.
const starter: Array<[string, string, string]> = [
  // Actions
  ["r1", "s1", "Reads a peer comparison article"],
  ["r1", "s2", "Skims pricing and **feature** pages"],
  ["r1", "s3", "Starts a ==free trial=="],
  ["r1", "s4", "Invites two teammates"],
  ["r1", "s5", "Renews annually"],
  ["r1", "s6", "Posts a case study on LinkedIn"],

  // Touchpoints
  ["r2", "s1", "Search, LinkedIn, peer Slack groups"],
  ["r2", "s2", "Marketing site, sales demo"],
  ["r2", "s3", "Web app, welcome email"],
  ["r2", "s5", "In-app notifications, QBRs"],
  ["r2", "s6", "Community forum, referral link"],

  // Thoughts
  ["r3", "s1", "\"Is this better than what we have?\""],
  ["r3", "s2", "\"Will this scale to our team?\""],
  ["r3", "s4", "\"Where do I even start?\""],
  ["r3", "s6", "\"My team would love this\""],

  // Emotions
  ["r4", "s1", "Curious"],
  ["r4", "s3", "Cautiously optimistic"],
  ["r4", "s4", "Overwhelmed"],
  ["r4", "s5", "Confident"],
  ["r4", "s6", "Proud"],

  // Pain points
  ["r5", "s2", "Pricing page hides team tiers"],
  ["r5", "s4", "==Setup== feels heavy for a trial"],
  ["r5", "s5", "Unclear which metrics matter"],

  // Opportunities
  ["r6", "s2", "Side-by-side competitor breakdown"],
  ["r6", "s4", "**Guided** setup with sample data"],
  ["r6", "s5", "Health score dashboards"],
  ["r6", "s6", "Referral rewards and badges"],
];

const cells: Cell[] = starter.map(([rowId, stageId, text], i) => ({
  id: `c${i + 1}`,
  rowId,
  stageId,
  text,
}));

export const seed: JourneyMap = {
  id: "template",
  title: "SaaS Trial-to-Value Journey",
  persona: "Operations Manager at a mid-sized SaaS company",
  stages,
  rows,
  cells,
};
