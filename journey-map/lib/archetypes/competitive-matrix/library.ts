import type { ArchetypeLibrary } from "@/lib/archetypes/types";

export const competitiveMatrixLibrary: ArchetypeLibrary = {
  purpose:
    "A typed competitor × capability grid for sharp head-to-head comparison. Cells are presence / score / text — not free-form cards — so the reader can scan for leaders and laggards across capabilities.",
  selectionHints: [
    "\"compare X vs Y vs Z on ...\" / \"competitor comparison\" / \"feature comparison\"",
    "\"capability matrix\" / \"vendor scorecard\" / \"competitive landscape grid\"",
    "the user names 2+ named competitors and wants them evaluated head-to-head on shared attributes",
    "the user wants presence checkmarks / scores for different features or capabilities across multiple products",
    "\"who has what\" / \"where does X lead\" / \"feature parity\"",
  ],
  exampleIntents: [
    "Compare Notion, Coda, and Airtable on 8 capabilities",
    "Build a feature matrix of enterprise CRMs with security, reporting, integrations, and pricing flexibility",
    "Vendor scorecard for observability tools — Datadog, New Relic, Honeycomb, Grafana Cloud",
    "How do the top 5 data warehouses stack up on governance, pricing model, and SQL dialect support?",
    "Compare cloud providers on managed K8s, blob storage, regional coverage, and support tiers",
  ],
  antiHints: [
    "the user wants points plotted on continuous axes (Gartner quadrant / effort-impact) — that's a cartesian plot",
    "the user wants a persona walking through stages — that's a journey map",
    "the user wants a list / roster / inventory without head-to-head comparison — that's a table",
    "the user describes a directed flow with decisions — that's a process map",
  ],
};
