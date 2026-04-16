import type { FrameworkConfig } from "../config";
import type { UniversalMap } from "../types";

// ──────────────────────────────────────────────────────────────────────────────
// Catalog — ~20 ready-made frameworks beyond the five in the core configs.
// Each is a thin FrameworkConfig: the renderer is the same config-driven
// FrameworkGrid; only the structure, vocabulary, and structuring prompt change.
//
// Frameworks are kept atomic (UniversalMap cards) so custom operations, ops
// tooling, and the copilot all work identically. Non-linear layouts (diamond,
// venn, tree) will come as new layout values in a later phase.
// ──────────────────────────────────────────────────────────────────────────────

// Tiny helper — builds a quadrant matrix framework with sensible defaults.
function quadrant(opts: {
  id: string;
  label: string;
  title: string;
  xAxisLabel: string;
  xLow: string;
  xHigh: string;
  yAxisLabel: string;
  yLow: string;
  yHigh: string;
  quadrantHints: [string, string, string, string]; // [xLow/yHigh, xHigh/yHigh, xLow/yLow, xHigh/yLow]
  seeds: [string[], string[], string[], string[]]; // cards per quadrant (xLow/yHigh, xHigh/yHigh, xLow/yLow, xHigh/yLow)
  structuringPrompt: string;
  exampleInstructions: string[];
  chatSubtitle?: string;
}): FrameworkConfig {
  const seed: UniversalMap = {
    id: "template",
    title: opts.title,
    meta: {
      xAxisLabel: opts.xAxisLabel,
      xLowLabel: opts.xLow,
      xHighLabel: opts.xHigh,
      yAxisLabel: opts.yAxisLabel,
      yLowLabel: opts.yLow,
      yHighLabel: opts.yHigh,
    },
    cols: [
      { id: "c1", label: opts.xLow, kind: "quadrant_low" },
      { id: "c2", label: opts.xHigh, kind: "quadrant_high" },
    ],
    rows: [
      { id: "r1", label: opts.yHigh, kind: "quadrant_high" },
      { id: "r2", label: opts.yLow, kind: "quadrant_low" },
    ],
    cards: [
      ...opts.seeds[0].map((t, i) => ({ id: `k-a${i}`, colId: "c1", rowId: "r1", text: t, order: i })),
      ...opts.seeds[1].map((t, i) => ({ id: `k-b${i}`, colId: "c2", rowId: "r1", text: t, order: i })),
      ...opts.seeds[2].map((t, i) => ({ id: `k-c${i}`, colId: "c1", rowId: "r2", text: t, order: i })),
      ...opts.seeds[3].map((t, i) => ({ id: `k-d${i}`, colId: "c2", rowId: "r2", text: t, order: i })),
    ],
  };
  return {
    id: opts.id,
    label: opts.label,
    layout: "matrix",
    colNoun: opts.xAxisLabel,
    rowNoun: opts.yAxisLabel,
    cardNoun: "Item",
    fixedCols: true,
    fixedRows: true,
    heroMetaFields: [
      { key: "xAxisLabel", label: "X Axis", placeholder: opts.xAxisLabel },
      { key: "yAxisLabel", label: "Y Axis", placeholder: opts.yAxisLabel },
    ],
    seed,
    exampleInstructions: opts.exampleInstructions,
    chatPlaceholder: `Reshape the ${opts.label.toLowerCase()}…`,
    chatSubtitle: opts.chatSubtitle ?? `Editing items across four quadrants`,
    structuringPrompt: `
You are building a **${opts.label}**.

Default structure: a 2×2 matrix with two axes.
- Col c1 = ${opts.xLow} (${opts.xAxisLabel} axis, low end)
- Col c2 = ${opts.xHigh} (${opts.xAxisLabel} axis, high end)
- Row r1 = ${opts.yHigh} (${opts.yAxisLabel} axis, top)
- Row r2 = ${opts.yLow} (${opts.yAxisLabel} axis, bottom)

Quadrants:
- c1·r1 = ${opts.quadrantHints[0]}
- c2·r1 = ${opts.quadrantHints[1]}
- c1·r2 = ${opts.quadrantHints[2]}
- c2·r2 = ${opts.quadrantHints[3]}

The 2×2 is the canonical form, but users may want to extend it (3×3, add a middle band, split an axis). Honor those requests — the framework's identity is its axes and semantics, not the dimension count.

${opts.structuringPrompt}
    `.trim(),
  };
}

// Tiny helper — builds a kanban framework (vertical stacks, no row labels).
function kanban(opts: {
  id: string;
  label: string;
  title: string;
  cardNoun: string;
  colNoun: string;
  cols: { label: string; kind?: string; seeds: string[] }[];
  structuringPrompt: string;
  exampleInstructions: string[];
  chatSubtitle?: string;
  fixedCols?: boolean;
}): FrameworkConfig {
  const seed: UniversalMap = {
    id: "template",
    title: opts.title,
    meta: {},
    cols: opts.cols.map((c, i) => ({ id: `c${i + 1}`, label: c.label, kind: c.kind })),
    rows: [{ id: "r1", label: "All", kind: "default" }],
    cards: opts.cols.flatMap((c, i) =>
      c.seeds.map((t, j) => ({ id: `k-${i}-${j}`, colId: `c${i + 1}`, rowId: "r1", text: t, order: j }))
    ),
  };
  return {
    id: opts.id,
    label: opts.label,
    layout: "kanban",
    colNoun: opts.colNoun,
    rowNoun: "Card",
    cardNoun: opts.cardNoun,
    fixedCols: opts.fixedCols ?? false,
    seed,
    exampleInstructions: opts.exampleInstructions,
    chatPlaceholder: `Reshape the ${opts.label.toLowerCase()}…`,
    chatSubtitle: opts.chatSubtitle,
    structuringPrompt: `
You are building a **${opts.label}**.

Structure: vertical ${opts.colNoun.toLowerCase()} columns. Rows are ignored (always r1 "All").
Columns: ${opts.cols.map((c, i) => `c${i + 1}=${c.label}`).join(", ")}

${opts.structuringPrompt}
    `.trim(),
  };
}

// Tiny helper — builds a grid framework (rows × cols; journey-map style).
function grid(opts: {
  id: string;
  label: string;
  title: string;
  colNoun: string;
  rowNoun: string;
  cardNoun: string;
  cols: { label: string; kind?: string }[];
  rows: { label: string; kind?: string }[];
  cards: { colIdx: number; rowIdx: number; text: string }[];
  structuringPrompt: string;
  exampleInstructions: string[];
  chatSubtitle?: string;
  fixedCols?: boolean;
  fixedRows?: boolean;
}): FrameworkConfig {
  const seed: UniversalMap = {
    id: "template",
    title: opts.title,
    meta: {},
    cols: opts.cols.map((c, i) => ({ id: `c${i + 1}`, label: c.label, kind: c.kind })),
    rows: opts.rows.map((r, i) => ({ id: `r${i + 1}`, label: r.label, kind: r.kind })),
    cards: opts.cards.map((c, i) => ({
      id: `k${i}`,
      colId: `c${c.colIdx + 1}`,
      rowId: `r${c.rowIdx + 1}`,
      text: c.text,
      order: i,
    })),
  };
  return {
    id: opts.id,
    label: opts.label,
    layout: "grid",
    colNoun: opts.colNoun,
    rowNoun: opts.rowNoun,
    cardNoun: opts.cardNoun,
    fixedCols: opts.fixedCols,
    fixedRows: opts.fixedRows,
    seed,
    exampleInstructions: opts.exampleInstructions,
    chatPlaceholder: `Reshape the ${opts.label.toLowerCase()}…`,
    chatSubtitle: opts.chatSubtitle,
    structuringPrompt: `
You are building a **${opts.label}**.

Structure: ${opts.rowNoun} × ${opts.colNoun} grid.
Columns: ${opts.cols.map((c, i) => `c${i + 1}=${c.label}`).join(", ")}
Rows: ${opts.rows.map((r, i) => `r${i + 1}=${r.label}`).join(", ")}

${opts.structuringPrompt}
    `.trim(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// STRATEGY MATRICES — 2×2 quadrants
// ────────────────────────────────────────────────────────────────────────────

export const bcgMatrixConfig = quadrant({
  id: "bcg-matrix",
  label: "BCG Growth-Share Matrix",
  title: "Portfolio — BCG Matrix",
  xAxisLabel: "Market Share",
  xLow: "Low Share",
  xHigh: "High Share",
  yAxisLabel: "Market Growth",
  yLow: "Low Growth",
  yHigh: "High Growth",
  quadrantHints: ["Question Marks — invest or divest", "Stars — invest to protect", "Dogs — milk or kill", "Cash Cows — harvest"],
  seeds: [
    ["New AI assistant product", "Emerging analytics segment"],
    ["Flagship SaaS platform"],
    ["Legacy on-prem license"],
    ["Mature reporting suite", "Existing enterprise accounts"],
  ],
  structuringPrompt: `Cards = business units or products. Place each by its market share AND market growth. Question Marks need strategic choice, Stars need reinvestment, Cash Cows fund the rest, Dogs should be divested.`,
  exampleInstructions: [
    "Reclassify 'New AI assistant' as a Star if we're gaining share fast",
    "Move 'Legacy on-prem' to Dogs and add a divestment note",
    "Add three more question-mark products from our roadmap",
    "Summarize the Stars quadrant with investment recommendations",
  ],
  chatSubtitle: "Portfolio positioning by share and growth",
});

export const eisenhowerConfig = quadrant({
  id: "eisenhower-matrix",
  label: "Eisenhower Matrix",
  title: "What to do next — Eisenhower Matrix",
  xAxisLabel: "Urgency",
  xLow: "Not Urgent",
  xHigh: "Urgent",
  yAxisLabel: "Importance",
  yLow: "Not Important",
  yHigh: "Important",
  quadrantHints: ["Schedule — plan time for it", "Do — act immediately", "Eliminate — don't bother", "Delegate — someone else's work"],
  seeds: [
    ["Prep Q3 planning doc", "Deep work on architecture RFC"],
    ["Production incident from this morning", "Reply to board member question"],
    ["Mindless inbox triage"],
    ["Approve routine expense reports", "Attend optional standup"],
  ],
  structuringPrompt: `Each card is a task or decision. Place it by urgency × importance. Do the urgent+important first, schedule the not-urgent+important deliberately, delegate urgent+not-important, drop not-urgent+not-important.`,
  exampleInstructions: [
    "Move the 'board member reply' to Schedule — response window is 48 hours",
    "Add this week's open tasks and classify them",
    "Eliminate anything older than 2 weeks from the Do quadrant",
    "Suggest what to delegate from Do to free up my week",
  ],
  chatSubtitle: "Time-management quadrants",
});

export const swotConfig = quadrant({
  id: "swot-analysis",
  label: "SWOT Analysis",
  title: "SWOT Analysis",
  xAxisLabel: "Source",
  xLow: "Internal",
  xHigh: "External",
  yAxisLabel: "Polarity",
  yLow: "Negative",
  yHigh: "Positive",
  quadrantHints: ["Strengths — what we do well", "Opportunities — external tailwinds", "Weaknesses — internal gaps", "Threats — external risks"],
  seeds: [
    ["Strong brand in enterprise segment", "Fastest inference latency in the market"],
    ["Shift to AI-first workflows creates new demand", "Regulations may favor on-prem vendors"],
    ["Ops team is at capacity", "Pricing model is confusing"],
    ["Well-funded competitor entered last quarter", "Customer churn is ticking up"],
  ],
  structuringPrompt: `Cards describe factors. Internal strengths/weaknesses are things WE control. External opportunities/threats are market, regulatory, competitive, or macro forces. Aim for 3–6 cards per quadrant.`,
  exampleInstructions: [
    "Add three competitive threats surfaced in last week's win/loss interviews",
    "Move 'pricing confusion' to Opportunities if we can fix it",
    "Pair each weakness with a mitigating strength",
    "Summarize the top 3 opportunities we should pursue this quarter",
  ],
  chatSubtitle: "Internal vs external, positive vs negative",
});

export const empathyMapConfig = quadrant({
  id: "empathy-map",
  label: "Empathy Map",
  title: "Empathy Map",
  xAxisLabel: "Expression",
  xLow: "Internal",
  xHigh: "External",
  yAxisLabel: "Channel",
  yLow: "Sensory",
  yHigh: "Cognitive",
  quadrantHints: ["Thinks — private beliefs", "Says — things they actually say", "Feels — emotions + reactions", "Does — observable actions"],
  seeds: [
    ["Worries they'll look slow if they ask questions", "Thinks the tool is over-engineered"],
    ["'Can we just get a report, not a dashboard?'", "'We already have Tableau'"],
    ["Frustrated when setup takes 20 minutes", "Proud when team uses their metric"],
    ["Pastes data into spreadsheet", "Forwards screenshots in Slack"],
  ],
  structuringPrompt: `Build a persona's empathy map: what they Think, Say, Feel, Do. Cards should be short, specific, voice-of-customer style quotes or observations.`,
  exampleInstructions: [
    "Add three more 'Says' quotes from the January user interviews",
    "Convert 'Thinks' bullets into real first-person quotes",
    "Identify feelings that would block adoption",
    "Summarize the emotional tension driving this persona",
  ],
  chatSubtitle: "Says, thinks, feels, does",
});

export const stakeholderMatrixConfig = quadrant({
  id: "stakeholder-matrix",
  label: "Stakeholder Power/Interest",
  title: "Stakeholder Matrix",
  xAxisLabel: "Interest",
  xLow: "Low Interest",
  xHigh: "High Interest",
  yAxisLabel: "Power",
  yLow: "Low Power",
  yHigh: "High Power",
  quadrantHints: ["Keep satisfied — minimal comms", "Manage closely — key stakeholders", "Monitor — minimum effort", "Keep informed — high-touch updates"],
  seeds: [
    ["CFO (sponsor of adjacent program)"],
    ["VP Product (sponsor)", "Head of Ops (implementation owner)"],
    ["Finance analyst team"],
    ["Customer Success Lead", "End users in pilot accounts"],
  ],
  structuringPrompt: `Cards are stakeholders (people, groups, or orgs). Plot each by their power to affect the project and interest in its outcome. Use this to drive a communication strategy.`,
  exampleInstructions: [
    "Add all stakeholders named in the kickoff deck",
    "Move 'Customer Success Lead' to Manage Closely — they'll own rollout",
    "Draft a comms plan for each quadrant",
    "Identify which stakeholders are blocking vs enabling",
  ],
  chatSubtitle: "Power × interest for stakeholder engagement",
});

export const riskMatrixConfig = quadrant({
  id: "risk-matrix",
  label: "Risk Matrix",
  title: "Risk Matrix",
  xAxisLabel: "Impact",
  xLow: "Low Impact",
  xHigh: "High Impact",
  yAxisLabel: "Likelihood",
  yLow: "Low Likelihood",
  yHigh: "High Likelihood",
  quadrantHints: ["Watch — low stakes but keep an eye", "Mitigate — active risk management", "Accept — tolerate", "Monitor — contingency plan"],
  seeds: [
    ["Minor dependency version drift"],
    ["Third-party API rate limit under peak load", "Key engineer departure"],
    ["Typo in internal docs"],
    ["Regulator extends timeline by a quarter", "Competitor ships lookalike feature"],
  ],
  structuringPrompt: `Cards are risks — things that could go wrong. Each has a likelihood and an impact. Top-right quadrant demands active mitigation; bottom-left can be acknowledged and accepted.`,
  exampleInstructions: [
    "Add all risks flagged in last week's architecture review",
    "For each Mitigate risk, draft a one-line mitigation owner",
    "Reclassify 'regulator extension' if we have new information",
    "Summarize the top 3 risks the steerco should see",
  ],
  chatSubtitle: "Likelihood × impact",
});

export const ansoffConfig = quadrant({
  id: "ansoff-matrix",
  label: "Ansoff Matrix",
  title: "Growth Strategy — Ansoff Matrix",
  xAxisLabel: "Product",
  xLow: "Existing Product",
  xHigh: "New Product",
  yAxisLabel: "Market",
  yLow: "Existing Market",
  yHigh: "New Market",
  quadrantHints: ["Market Development — new markets, old products", "Diversification — new markets, new products", "Market Penetration — double down", "Product Development — new products for current customers"],
  seeds: [
    ["Expand to EMEA with current SKU"],
    ["Launch AI product for new pharma vertical"],
    ["Upsell seats in top 50 accounts", "Run usage-based pricing experiment"],
    ["Ship analytics add-on for current customers", "Bundle mobile companion app"],
  ],
  structuringPrompt: `Cards are growth initiatives. Classify each by whether the PRODUCT is existing or new and the MARKET is existing or new. Moving up and to the right increases risk.`,
  exampleInstructions: [
    "Reclassify 'usage-based pricing' — is that product or market?",
    "Add three ideas from the growth offsite",
    "Flag the riskiest diversification bets",
    "Suggest a balanced portfolio across the four strategies",
  ],
  chatSubtitle: "Markets × products for growth",
});

export const assumptionMapConfig = quadrant({
  id: "assumption-map",
  label: "Assumption Map",
  title: "Assumption Map",
  xAxisLabel: "Evidence",
  xLow: "Low Evidence",
  xHigh: "High Evidence",
  yAxisLabel: "Importance",
  yLow: "Low Importance",
  yHigh: "High Importance",
  quadrantHints: ["Test — leap of faith, run an experiment", "Rely — well-evidenced and central", "Ignore — neither matters much", "Confirm — already evidenced"],
  seeds: [
    ["Users will pay $X/month for this", "Enterprises tolerate single-sign-on lag"],
    ["Enterprise customers want SOC2 report"],
    ["Design detail of a hover-state"],
    ["Developers prefer CLI over GUI for setup"],
  ],
  structuringPrompt: `Cards are assumptions your plan depends on. Plot by importance × evidence. The top-left is where your experiments should go.`,
  exampleInstructions: [
    "Add all assumptions from the pitch deck",
    "For each 'Test' assumption, suggest a cheap experiment",
    "Move any assumption backed by recent user research to 'Confirm'",
    "Prioritize the next three experiments",
  ],
  chatSubtitle: "Importance × evidence for assumptions",
});

export const wardleyMapConfig = quadrant({
  id: "wardley-lite",
  label: "Wardley Map (lite)",
  title: "Wardley Map (lite)",
  xAxisLabel: "Evolution",
  xLow: "Genesis / Custom",
  xHigh: "Product / Commodity",
  yAxisLabel: "Visibility",
  yLow: "Invisible (infra)",
  yHigh: "Visible (user need)",
  quadrantHints: ["Novel user-facing — differentiator zone", "Commodity user-facing — table stakes", "Novel infra — build vs. buy", "Commodity infra — outsource"],
  seeds: [
    ["Natural-language query over dashboards"],
    ["Export to CSV", "Email alerts"],
    ["Our proprietary inference scheduler"],
    ["Postgres", "Object storage", "CDN"],
  ],
  structuringPrompt: `Cards are components of the user experience or system. Place each by evolution (genesis → product → commodity) and visibility (user-facing vs infrastructure). This is a simplified Wardley-style exercise: use it to spot where to invest, buy, or outsource.`,
  exampleInstructions: [
    "Add all infra components from the architecture doc",
    "Move 'email alerts' to Commodity — it's table stakes now",
    "Identify components that should move left for differentiation",
    "Suggest what we should outsource to free up engineering",
  ],
  chatSubtitle: "Evolution × visibility, simplified",
});

// ────────────────────────────────────────────────────────────────────────────
// DESIGN & BUSINESS CANVASES — grids with fixed sections
// ────────────────────────────────────────────────────────────────────────────

export const businessModelCanvasConfig = grid({
  id: "business-model-canvas",
  label: "Business Model Canvas",
  title: "Business Model Canvas",
  colNoun: "Block",
  rowNoun: "Section",
  cardNoun: "Item",
  fixedCols: true,
  fixedRows: true,
  cols: [
    { label: "Partners", kind: "partners" },
    { label: "Activities + Resources", kind: "activities" },
    { label: "Value Propositions", kind: "value" },
    { label: "Relationships + Channels", kind: "relationships" },
    { label: "Customers", kind: "customers" },
  ],
  rows: [
    { label: "Strategy", kind: "default" },
    { label: "Economics", kind: "economics" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Cloud hyperscaler partnerships" },
    { colIdx: 1, rowIdx: 0, text: "AI model training", },
    { colIdx: 2, rowIdx: 0, text: "10× faster insights with zero setup" },
    { colIdx: 3, rowIdx: 0, text: "Product-led onboarding" },
    { colIdx: 4, rowIdx: 0, text: "Mid-market data teams" },
    { colIdx: 1, rowIdx: 1, text: "Cost structure: inference + data storage" },
    { colIdx: 4, rowIdx: 1, text: "Revenue streams: per-seat SaaS + usage overage" },
  ],
  structuringPrompt: `Nine-block Osterwalder canvas. Strategy row covers the who/what/how. Economics row holds Cost Structure (under Activities+Resources) and Revenue Streams (under Customers).`,
  exampleInstructions: [
    "Fill in Partners with our top 3 technology partners",
    "Refine Value Props to be quantitative outcomes",
    "Add revenue streams for our new usage-based tier",
    "Identify the weakest block to pressure-test",
  ],
  chatSubtitle: "9-block canvas for business model design",
});

export const leanCanvasConfig = grid({
  id: "lean-canvas",
  label: "Lean Canvas",
  title: "Lean Canvas",
  colNoun: "Block",
  rowNoun: "Tier",
  cardNoun: "Item",
  fixedCols: true,
  fixedRows: true,
  cols: [
    { label: "Problem", kind: "problem" },
    { label: "Solution + UVP", kind: "solution" },
    { label: "Advantage + Metrics", kind: "value" },
    { label: "Channels + Segments", kind: "customers" },
  ],
  rows: [
    { label: "Strategy", kind: "default" },
    { label: "Economics", kind: "economics" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Data teams can't trust their own dashboards" },
    { colIdx: 1, rowIdx: 0, text: "Auto-anomaly detection on top of your warehouse" },
    { colIdx: 2, rowIdx: 0, text: "Unique: 5-minute setup, no schema mapping" },
    { colIdx: 3, rowIdx: 0, text: "Early-stage B2B data teams" },
    { colIdx: 0, rowIdx: 1, text: "Cost structure: compute-heavy, per-customer" },
    { colIdx: 3, rowIdx: 1, text: "Revenue: $29/seat/mo, upsell via usage" },
  ],
  structuringPrompt: `Ash Maurya's lean canvas — a leaner business-model canvas for early-stage teams. Emphasize Problem, UVP, Key Metrics, and Unfair Advantage.`,
  exampleInstructions: [
    "Sharpen the Problem to specific pain points",
    "Propose three experiments to validate the Solution block",
    "Define Key Metrics that would tell us this is working",
    "Compare against a competitor's canvas",
  ],
  chatSubtitle: "Lean variant for early-stage teams",
});

export const valuePropositionCanvasConfig = grid({
  id: "value-prop-canvas",
  label: "Value Proposition Canvas",
  title: "Value Proposition Canvas",
  colNoun: "Side",
  rowNoun: "Layer",
  cardNoun: "Item",
  fixedCols: true,
  fixedRows: true,
  cols: [
    { label: "Customer Profile", kind: "customers" },
    { label: "Value Map", kind: "value" },
  ],
  rows: [
    { label: "Jobs / Gain Creators", kind: "default" },
    { label: "Pains / Pain Relievers", kind: "problem" },
    { label: "Gains / Products & Services", kind: "solution" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Monitor team health without manual weekly reports" },
    { colIdx: 1, rowIdx: 0, text: "One-click trend summaries" },
    { colIdx: 0, rowIdx: 1, text: "Weekly status meetings take hours" },
    { colIdx: 1, rowIdx: 1, text: "Async summaries replace status updates" },
    { colIdx: 0, rowIdx: 2, text: "Looks proactive to leadership" },
    { colIdx: 1, rowIdx: 2, text: "Inline exec briefing mode" },
  ],
  structuringPrompt: `Strategyzer Value Proposition canvas. Left side = customer (jobs, pains, gains). Right side = value map (gain creators, pain relievers, products). Pairs on the same row should match.`,
  exampleInstructions: [
    "Pair each customer Pain with a matching Pain Reliever",
    "Drop any product that doesn't match a gain or pain",
    "Add three Jobs from user interviews",
    "Score product-market fit on each row",
  ],
  chatSubtitle: "Customer-value fit by row",
});

export const serviceBlueprintConfig = grid({
  id: "service-blueprint",
  label: "Service Blueprint",
  title: "Service Blueprint",
  colNoun: "Stage",
  rowNoun: "Lane",
  cardNoun: "Moment",
  fixedRows: true,
  cols: [
    { label: "Discovery", kind: "default" },
    { label: "Onboarding", kind: "default" },
    { label: "Daily Use", kind: "default" },
    { label: "Escalation", kind: "default" },
  ],
  rows: [
    { label: "Customer Actions", kind: "actions" },
    { label: "Frontstage", kind: "touchpoints" },
    { label: "Backstage", kind: "backstage" },
    { label: "Support Processes", kind: "support" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Read pricing, compare with alternatives" },
    { colIdx: 1, rowIdx: 0, text: "Invite teammates, import data" },
    { colIdx: 2, rowIdx: 0, text: "Check dashboard, forward to stakeholders" },
    { colIdx: 3, rowIdx: 0, text: "Submit support ticket" },
    { colIdx: 0, rowIdx: 1, text: "Marketing site + pricing page" },
    { colIdx: 1, rowIdx: 1, text: "Onboarding wizard + welcome email" },
    { colIdx: 3, rowIdx: 1, text: "In-app chat widget" },
    { colIdx: 1, rowIdx: 2, text: "CRM enrichment job" },
    { colIdx: 3, rowIdx: 3, text: "Tier-1 → tier-2 escalation runbook" },
  ],
  structuringPrompt: `Service blueprint across stages of a user's journey. Lanes: Customer Actions (what they do), Frontstage (visible to user), Backstage (behind the curtain), Support (enabling processes).`,
  exampleInstructions: [
    "Add an 'Expansion' stage between Daily Use and Escalation",
    "Map the handoff points that currently fail most often",
    "For each Frontstage item, add the Backstage it depends on",
    "Identify support processes with no owner",
  ],
  chatSubtitle: "Stages × service lanes",
});

export const userStoryMapConfig = grid({
  id: "user-story-map",
  label: "User Story Map",
  title: "User Story Map",
  colNoun: "Activity",
  rowNoun: "Release",
  cardNoun: "Story",
  cols: [
    { label: "Sign up", kind: "default" },
    { label: "Set up account", kind: "default" },
    { label: "Run a query", kind: "default" },
    { label: "Share results", kind: "default" },
  ],
  rows: [
    { label: "Walking Skeleton", kind: "priority" },
    { label: "Next release", kind: "default" },
    { label: "Backlog", kind: "default" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Email sign-up" },
    { colIdx: 1, rowIdx: 0, text: "Connect a data source" },
    { colIdx: 2, rowIdx: 0, text: "Run a canned query" },
    { colIdx: 3, rowIdx: 0, text: "Copy result link" },
    { colIdx: 0, rowIdx: 1, text: "SSO sign-up" },
    { colIdx: 2, rowIdx: 1, text: "Save a query" },
    { colIdx: 3, rowIdx: 1, text: "Export to Slack" },
    { colIdx: 2, rowIdx: 2, text: "Natural-language query" },
  ],
  structuringPrompt: `Jeff Patton's user story map. Columns = activities in the user's journey. Rows = releases, with the "walking skeleton" at the top (MVP). Cards = user stories.`,
  exampleInstructions: [
    "Add stories for a 'Collaborate' activity between Share and Backlog",
    "Move any walking-skeleton stories that are actually unscoped to Backlog",
    "Group stories by the user who performs them",
    "Identify the smallest end-to-end slice",
  ],
  chatSubtitle: "Activities × release slices",
});

export const raciConfig = grid({
  id: "raci-matrix",
  label: "RACI Matrix",
  title: "RACI — Q3 Migration",
  colNoun: "Person",
  rowNoun: "Task",
  cardNoun: "Assignment",
  cols: [
    { label: "PM", kind: "default" },
    { label: "Eng Lead", kind: "default" },
    { label: "Designer", kind: "default" },
    { label: "QA", kind: "default" },
  ],
  rows: [
    { label: "Define migration scope", kind: "default" },
    { label: "Design new schema", kind: "default" },
    { label: "Implement migration", kind: "default" },
    { label: "Validate + cutover", kind: "default" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "R", },
    { colIdx: 1, rowIdx: 0, text: "C" },
    { colIdx: 1, rowIdx: 1, text: "A" },
    { colIdx: 2, rowIdx: 1, text: "R" },
    { colIdx: 1, rowIdx: 2, text: "A" },
    { colIdx: 3, rowIdx: 3, text: "R" },
  ],
  structuringPrompt: `RACI: for each task × person, assign exactly one of R (Responsible), A (Accountable), C (Consulted), I (Informed). Each task needs exactly ONE A. Cards should be short single-letter labels.`,
  exampleInstructions: [
    "Ensure every task row has exactly one Accountable",
    "Add stakeholders missing from the columns",
    "Flag tasks where Responsible is missing",
    "Pare down Consulted lists — too many makes tasks slow",
  ],
  chatSubtitle: "Responsibility matrix for tasks × people",
});

export const okrConfig = grid({
  id: "okr-framework",
  label: "OKR Framework",
  title: "Q3 OKRs",
  colNoun: "Objective",
  rowNoun: "Kind",
  cardNoun: "KR",
  fixedRows: true,
  cols: [
    { label: "Land + expand mid-market", kind: "default" },
    { label: "Cut onboarding time", kind: "default" },
    { label: "Harden platform reliability", kind: "default" },
  ],
  rows: [
    { label: "Key Results", kind: "default" },
    { label: "Initiatives", kind: "default" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "Close **30** mid-market logos (stretch: 40)" },
    { colIdx: 0, rowIdx: 0, text: "ACV from mid-market ≥ **$2.5M**" },
    { colIdx: 0, rowIdx: 1, text: "Launch Salesforce co-sell partnership" },
    { colIdx: 1, rowIdx: 0, text: "Median time-to-first-insight ≤ **10 min**" },
    { colIdx: 1, rowIdx: 1, text: "Ship guided-setup v2" },
    { colIdx: 2, rowIdx: 0, text: "**99.95%** query-API availability" },
    { colIdx: 2, rowIdx: 1, text: "Migrate inference fleet to new scheduler" },
  ],
  structuringPrompt: `OKRs: Columns = Objectives (qualitative goals). Rows = Key Results (measurable) and Initiatives (work that drives them). Keep KRs outcome-based, not task-based. Use 2–4 KRs per objective.`,
  exampleInstructions: [
    "Tighten KRs to be measurable and time-bound",
    "Add initiatives for the Reliability objective",
    "Drop any KR that's actually an initiative",
    "Score mid-quarter progress on each KR",
  ],
  chatSubtitle: "Objectives × key results and initiatives",
});

export const riceConfig = grid({
  id: "rice-scoring",
  label: "RICE Scoring",
  title: "RICE Scoring",
  colNoun: "Factor",
  rowNoun: "Feature",
  cardNoun: "Score",
  fixedCols: true,
  cols: [
    { label: "Reach", kind: "default" },
    { label: "Impact", kind: "default" },
    { label: "Confidence", kind: "default" },
    { label: "Effort (w)", kind: "default" },
  ],
  rows: [
    { label: "Natural-language query", kind: "priority" },
    { label: "Slack alerts", kind: "default" },
    { label: "SSO + SCIM", kind: "default" },
    { label: "Mobile companion", kind: "default" },
  ],
  cards: [
    { colIdx: 0, rowIdx: 0, text: "80% of MAU" },
    { colIdx: 1, rowIdx: 0, text: "3× (massive)" },
    { colIdx: 2, rowIdx: 0, text: "60%" },
    { colIdx: 3, rowIdx: 0, text: "12w" },
    { colIdx: 0, rowIdx: 1, text: "45%" },
    { colIdx: 1, rowIdx: 1, text: "1× (medium)" },
    { colIdx: 2, rowIdx: 1, text: "90%" },
    { colIdx: 3, rowIdx: 1, text: "2w" },
    { colIdx: 0, rowIdx: 2, text: "20% of enterprise" },
    { colIdx: 1, rowIdx: 2, text: "2× (high)" },
    { colIdx: 2, rowIdx: 2, text: "80%" },
    { colIdx: 3, rowIdx: 2, text: "6w" },
  ],
  structuringPrompt: `RICE: each feature (row) is scored on Reach, Impact, Confidence, Effort. RICE score = (Reach × Impact × Confidence) / Effort. Cards should be single values (percent, multiplier, weeks).`,
  exampleInstructions: [
    "Compute the RICE score for each feature and rank them",
    "Add features from this quarter's discovery interviews",
    "Move any feature with <50% Confidence into a 'validate first' stage",
    "Sensitivity-check the top feature — what changes if Confidence drops?",
  ],
  chatSubtitle: "Features × R/I/C/E for prioritization",
});

// ────────────────────────────────────────────────────────────────────────────
// KANBAN-LAYOUT — vertical stacks
// ────────────────────────────────────────────────────────────────────────────

export const portersFiveForcesConfig = kanban({
  id: "porters-five-forces",
  label: "Porter's Five Forces",
  title: "Porter's Five Forces",
  cardNoun: "Observation",
  colNoun: "Force",
  fixedCols: true,
  cols: [
    { label: "New Entrants", kind: "threat", seeds: ["Big tech AI platforms entering via bundle", "Cheap open-source alternatives"] },
    { label: "Buyer Power", kind: "negotiation", seeds: ["Procurement routinely demands 30% discount", "Large customers compare quarterly"] },
    { label: "Supplier Power", kind: "negotiation", seeds: ["Inference compute pricing volatile"] },
    { label: "Substitutes", kind: "threat", seeds: ["Teams roll their own in-house dashboards"] },
    { label: "Rivalry", kind: "rivalry", seeds: ["Direct competitor raised $150M series C", "Feature parity is within a quarter"] },
  ],
  structuringPrompt: `Five forces shaping the industry's competitive intensity. Cards = observations or data points under each force. Short, factual.`,
  exampleInstructions: [
    "Add examples from our competitive battlecards",
    "Rate each force as low/medium/high intensity",
    "Identify the force that's shifting fastest",
    "Suggest two moves that would weaken Buyer Power",
  ],
  chatSubtitle: "Five forces of industry competition",
});

export const doubleDiamondConfig = kanban({
  id: "double-diamond",
  label: "Double Diamond",
  title: "Double Diamond",
  cardNoun: "Activity",
  colNoun: "Phase",
  fixedCols: true,
  cols: [
    { label: "Discover", kind: "research", seeds: ["Customer interviews", "Competitive teardown", "Support-ticket trawl"] },
    { label: "Define", kind: "problem", seeds: ["How-might-we statements", "Priority user segments"] },
    { label: "Develop", kind: "ideation", seeds: ["Concept sketches", "Rapid prototypes", "Low-fi user tests"] },
    { label: "Deliver", kind: "solution", seeds: ["Scoped MVP", "Launch checklist"] },
  ],
  structuringPrompt: `UK Design Council Double Diamond: two diamonds — Discover→Define (find the right problem) and Develop→Deliver (find the right solution). Cards are activities or artifacts in each phase. NOTE: current renderer shows a linear 4-column layout; a dedicated diamond visual is a later enhancement.`,
  exampleInstructions: [
    "Add discovery activities scheduled for the research sprint",
    "Tighten Define into two How-Might-We statements",
    "Propose three prototypes for the Develop phase",
    "Identify what's missing before we can Deliver",
  ],
  chatSubtitle: "Discover → Define → Develop → Deliver",
});

export const nowNextLaterConfig = kanban({
  id: "now-next-later",
  label: "Now / Next / Later",
  title: "Now / Next / Later",
  cardNoun: "Bet",
  colNoun: "Horizon",
  fixedCols: true,
  cols: [
    { label: "Now", kind: "priority", seeds: ["Land new pricing model", "Ship schema-diff tool"] },
    { label: "Next", kind: "default", seeds: ["Natural-language query GA", "Publish security whitepaper"] },
    { label: "Later", kind: "default", seeds: ["Mobile companion app", "Partner marketplace"] },
  ],
  structuringPrompt: `Roadmap horizon planning — Now (in flight), Next (queued for the quarter), Later (longer-term bets). Cards are initiatives, not tasks.`,
  exampleInstructions: [
    "Promote one Later item to Next and justify",
    "Break the Now column into DONE vs IN-PROGRESS",
    "Add three items from the product strategy doc",
    "Identify dependencies between Now and Next",
  ],
  chatSubtitle: "Horizon-based roadmapping",
});

export const hypothesisBoardConfig = kanban({
  id: "hypothesis-board",
  label: "Hypothesis Board",
  title: "Hypothesis Board",
  cardNoun: "Hypothesis",
  colNoun: "Status",
  fixedCols: true,
  cols: [
    { label: "Backlog", kind: "default", seeds: ["Users will trust AI-generated summaries"] },
    { label: "Testing", kind: "default", seeds: ["Enterprise will pay 2× for SOC2-native tier"] },
    { label: "Validated", kind: "solution", seeds: ["Data teams prefer daily digest over real-time"] },
    { label: "Invalidated", kind: "problem", seeds: ["Users want a custom dashboard builder"] },
  ],
  structuringPrompt: `Hypothesis-driven discovery board. Each card is a falsifiable hypothesis. It moves right as evidence accumulates. Invalidated hypotheses stay on the board as learning.`,
  exampleInstructions: [
    "Add hypotheses from the current discovery sprint",
    "Tighten any hypothesis that isn't falsifiable",
    "For each Testing hypothesis, note the experiment + deadline",
    "Summarize the last month's learnings from Validated/Invalidated",
  ],
  chatSubtitle: "Hypotheses flowing from backlog → validation",
});

export const scamperConfig = kanban({
  id: "scamper",
  label: "SCAMPER",
  title: "SCAMPER — concept exploration",
  cardNoun: "Idea",
  colNoun: "Lens",
  fixedCols: true,
  cols: [
    { label: "Substitute", seeds: ["Replace the wizard with a chat onboarding"] },
    { label: "Combine", seeds: ["Bundle alerting + exports into a single 'outputs' hub"] },
    { label: "Adapt", seeds: ["Borrow Figma's multiplayer cursor model"] },
    { label: "Modify", seeds: ["Reshape the setup flow into a 60-second tour"] },
    { label: "Put to another use", seeds: ["Use our inference cluster for internal prediction jobs"] },
    { label: "Eliminate", seeds: ["Drop the dashboard template chooser — default to AI pick"] },
    { label: "Reverse", seeds: ["Let users start from a query and build a workspace from it"] },
  ],
  structuringPrompt: `SCAMPER creative ideation lenses: Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse. Each column is a lens; cards are ideas generated through that lens.`,
  exampleInstructions: [
    "Generate three ideas per lens for the onboarding flow",
    "Combine the best Substitute and Combine ideas into a prototype",
    "Flag ideas that would cannibalize existing revenue",
    "Rank the top 5 ideas by a cheap-to-test-first criterion",
  ],
  chatSubtitle: "SCAMPER creative lenses for idea generation",
});

// ────────────────────────────────────────────────────────────────────────────
// FREEFORM — Miro-style canvas with user-positioned cards
// ────────────────────────────────────────────────────────────────────────────

export const freeformCanvasConfig: FrameworkConfig = {
  id: "freeform-canvas",
  label: "Freeform Canvas",
  layout: "freeform",
  colNoun: "Cluster",
  rowNoun: "Category",
  cardNoun: "Note",
  seed: {
    id: "template",
    title: "Freeform Canvas",
    meta: {},
    // A handful of starter clusters so the "+" chips in the top-left give
    // users a sense of how cluster-tagging works on a freeform board.
    cols: [
      { id: "c1", label: "Ideas", kind: "theme" },
      { id: "c2", label: "Questions", kind: "pain_points" },
      { id: "c3", label: "Decisions", kind: "actions" },
    ],
    rows: [{ id: "r1", label: "All", kind: "default" }],
    cards: [
      { id: "k1", colId: "c1", rowId: "r1", text: "Drag cards anywhere. Tag them by cluster for AI context.", order: 0, meta: { x: "160", y: "220" } },
      { id: "k2", colId: "c2", rowId: "r1", text: "Double-click any card to edit.", order: 1, meta: { x: "480", y: "220" } },
      { id: "k3", colId: "c3", rowId: "r1", text: "Click a cluster chip (top-left) to add a card to that group.", order: 2, meta: { x: "800", y: "220" } },
    ],
  },
  exampleInstructions: [
    "Add five Ideas clustered on the left, five Questions on the right",
    "Rename 'Decisions' to 'Next steps'",
    "Merge any duplicate notes across clusters",
    "Group related cards into new clusters",
  ],
  chatPlaceholder: "Reshape the canvas…",
  chatSubtitle: "Free-positioned notes grouped by cluster",
  structuringPrompt: `
You are building a **Freeform Canvas** — a Miro-style board where cards can live anywhere.

Cards each carry optional \`meta.x\` and \`meta.y\` pixel coordinates. If you omit them, the UI will auto-flow the card into a loose grid; that's fine. Cluster cards by \`colId\` — cols act as topical buckets (Ideas, Questions, Decisions, etc.). There is always one row ("All"); keep it.

Focus on generating content; let the user position cards themselves. When asked to "organize" cards, rename or consolidate clusters rather than setting explicit x/y.
  `.trim(),
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog export — single array for easy registration.
// ────────────────────────────────────────────────────────────────────────────

export const catalogConfigs: FrameworkConfig[] = [
  // Matrices
  bcgMatrixConfig,
  eisenhowerConfig,
  swotConfig,
  empathyMapConfig,
  stakeholderMatrixConfig,
  riskMatrixConfig,
  ansoffConfig,
  assumptionMapConfig,
  wardleyMapConfig,
  // Canvases
  businessModelCanvasConfig,
  leanCanvasConfig,
  valuePropositionCanvasConfig,
  serviceBlueprintConfig,
  userStoryMapConfig,
  raciConfig,
  okrConfig,
  riceConfig,
  // Kanbans
  portersFiveForcesConfig,
  doubleDiamondConfig,
  nowNextLaterConfig,
  hypothesisBoardConfig,
  scamperConfig,
  // Freeform
  freeformCanvasConfig,
];
