import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// Competitive Map: competitors are cols, evaluation criteria are rows.
// One card per (competitor, criterion) cell — dense grid, not sparse.
// "isSubject" meta on a col marks it as "our" company.
const seed: UniversalMap = {
  id: "template",
  title: "US Regulatory Intelligence Market",
  meta: {
    xAxisLabel: "Specialization",
    yAxisLabel: "Intelligence Depth",
  },
  cols: [
    { id: "c1", label: "Mahogany",   kind: "subject" },   // our company
    { id: "c2", label: "Citeline",   kind: "competitor" },
    { id: "c3", label: "Veeva Vault",kind: "competitor" },
    { id: "c4", label: "Cortellis",  kind: "competitor" },
    { id: "c5", label: "RegulatoryEdge", kind: "competitor" },
  ],
  rows: [
    { id: "r1", label: "Target Market",        kind: "criterion" },
    { id: "r2", label: "Primary Data Source",  kind: "criterion" },
    { id: "r3", label: "Intelligence Depth",   kind: "criterion" },
    { id: "r4", label: "Specialization Focus", kind: "criterion" },
    { id: "r5", label: "AI / Automation",      kind: "criterion" },
    { id: "r6", label: "Key Weakness",         kind: "criterion" },
  ],
  cards: [
    // Mahogany
    { id: "k1",  colId: "c1", rowId: "r1", text: "Small–mid pharma, biotech, medical device", order: 0 },
    { id: "k2",  colId: "c1", rowId: "r2", text: "FDA, EMA, and global agency primary sources", order: 0 },
    { id: "k3",  colId: "c1", rowId: "r3", text: "**Product-level** guidance mapping and impact analysis", order: 0 },
    { id: "k4",  colId: "c1", rowId: "r4", text: "Regulatory intelligence — deep, not broad", order: 0 },
    { id: "k5",  colId: "c1", rowId: "r5", text: "AI-driven relevance scoring by product code", order: 0 },
    { id: "k6",  colId: "c1", rowId: "r6", text: "Early market — limited brand awareness", order: 0 },
    // Citeline
    { id: "k7",  colId: "c2", rowId: "r1", text: "Large pharma, CROs", order: 0 },
    { id: "k8",  colId: "c2", rowId: "r2", text: "Clinical trial databases + curated regulatory news", order: 0 },
    { id: "k9",  colId: "c2", rowId: "r3", text: "Broad pipeline and approval tracking", order: 0 },
    { id: "k10", colId: "c2", rowId: "r4", text: "Clinical intelligence — regulatory is secondary", order: 0 },
    { id: "k11", colId: "c2", rowId: "r5", text: "Search and filtering; limited automation", order: 0 },
    { id: "k12", colId: "c2", rowId: "r6", text: "==High noise== — not guidance-specific", order: 0 },
    // Veeva Vault
    { id: "k13", colId: "c3", rowId: "r1", text: "Enterprise pharma (100+ products)", order: 0 },
    { id: "k14", colId: "c3", rowId: "r2", text: "Internal submission documents", order: 0 },
    { id: "k15", colId: "c3", rowId: "r3", text: "Document management and submission workflow", order: 0 },
    { id: "k16", colId: "c3", rowId: "r4", text: "Regulatory operations — not intelligence", order: 0 },
    { id: "k17", colId: "c3", rowId: "r5", text: "Workflow automation; no external monitoring", order: 0 },
    { id: "k18", colId: "c3", rowId: "r6", text: "No external guidance **monitoring** capability", order: 0 },
    // Cortellis
    { id: "k19", colId: "c4", rowId: "r1", text: "Large pharma, business development teams", order: 0 },
    { id: "k20", colId: "c4", rowId: "r2", text: "Patents, deals, approvals, clinical pipelines", order: 0 },
    { id: "k21", colId: "c4", rowId: "r3", text: "Competitive intelligence and M&A landscape", order: 0 },
    { id: "k22", colId: "c4", rowId: "r4", text: "Strategic intelligence — not submission-level", order: 0 },
    { id: "k23", colId: "c4", rowId: "r5", text: "Analytics dashboards; no AI relevance scoring", order: 0 },
    { id: "k24", colId: "c4", rowId: "r6", text: "Expensive; overkill for RA professionals", order: 0 },
    // RegulatoryEdge
    { id: "k25", colId: "c5", rowId: "r1", text: "Mid-size pharma regulatory teams", order: 0 },
    { id: "k26", colId: "c5", rowId: "r2", text: "Curated regulatory news and newsletters", order: 0 },
    { id: "k27", colId: "c5", rowId: "r3", text: "News digest — limited structured analysis", order: 0 },
    { id: "k28", colId: "c5", rowId: "r4", text: "Regulatory news — surface level coverage", order: 0 },
    { id: "k29", colId: "c5", rowId: "r5", text: "Minimal — human-curated editorial", order: 0 },
    { id: "k30", colId: "c5", rowId: "r6", text: "No product-level relevance; generic alerts", order: 0 },
  ],
};

export const competitiveMapConfig: FrameworkConfig = {
  id: "competitive-map",
  label: "Competitive Map",
  layout: "matrix",
  colNoun: "Competitor",
  rowNoun: "Criterion",
  cardNoun: "Assessment",
  heroMetaFields: [
    { key: "xAxisLabel", label: "Positioning Axis 1", placeholder: "e.g. Specialization" },
    { key: "yAxisLabel", label: "Positioning Axis 2", placeholder: "e.g. Intelligence Depth" },
  ],
  seed,
  exampleInstructions: [
    "Add a new competitor column for 'Veeva Regulatory Compass'",
    "Add an 'Integrations' criterion row and assess all competitors",
    "Update Mahogany's AI/Automation assessment to reflect the new v2 capabilities",
    "Add a 'Pricing Model' row comparing all competitors",
  ],
  chatPlaceholder: "Edit the competitive landscape…",
  chatSubtitle: "Editing competitors and evaluation criteria",
  structuringPrompt: `
You are building a **Competitive Positioning Map** — a grid that compares competitors across evaluation criteria.

**Col = Competitor**: Each column is one company or product being compared. Use \`kind: "subject"\` for "our" company (the one being positioned) and \`kind: "competitor"\` for rivals.

**Row = Criterion**: Each row is an evaluation dimension (e.g. "Target Market", "AI Capabilities", "Key Weakness", "Pricing Model"). Add as many criteria as needed to tell a complete positioning story.

**Card = Assessment**: One card per (competitor, criterion) cell — a short, factual description of how that competitor performs on that criterion. This is a dense grid; aim to fill every cell.

**Assessment quality**:
- Be specific and factual, not vague ("Market leader in X" not "Good at X")
- Use ==highlight== for specific numbers, names, or product features
- Use **bold** for the most load-bearing characteristic
- Keep each assessment to 8–20 words

**Subject company**: Mark "our" company col with \`kind: "subject"\`. This is rendered with a distinct accent in the UI.

**Adding competitors**: Use \`addCol\` with \`kind: "competitor"\` or \`kind: "subject"\`.
**Adding criteria**: Use \`addRow\` with \`kind: "criterion"\`.
  `.trim(),
};
