import type { ArchetypeLibrary } from "@/lib/archetypes/types";

export const cartesianLibrary: ArchetypeLibrary = {
  purpose:
    "A 2D plot where entities are positioned on continuous x and y axes. Powers prioritization (effort × impact), competitive landscapes (magic-quadrant style), roadmaps (time × strategic pillar), and any framework where spatial position is load-bearing.",
  selectionHints: [
    "\"plot on axes\" / \"2x2\" / \"quadrant\" / \"priority matrix\" / \"effort vs impact\" / \"impact vs feasibility\"",
    "\"magic quadrant\" / \"competitive landscape\" / \"positioning map\"",
    "\"roadmap\" / \"horizon plot\" / \"timeline with categories\" / \"quarterly plot\"",
    "the user names two continuous dimensions and wants entities placed by their values on each",
    "\"time sinks\", \"quick wins\", \"big bets\", \"fill-ins\" — the canonical prioritization-quadrant vocabulary",
    "\"leaders\", \"challengers\", \"visionaries\", \"niche players\" — the canonical Gartner vocabulary",
  ],
  exampleIntents: [
    "Plot our Q2 initiatives on effort vs impact with quadrant labels",
    "Build a magic-quadrant-style view of enterprise data platforms — completeness of vision vs ability to execute",
    "Show our roadmap items on a horizon plot, x = quarter, y = strategic pillar",
    "Position our competitors on price vs feature depth",
    "2x2 of customer segments by willingness-to-pay and switching cost",
  ],
  antiHints: [
    "the user wants feature-by-feature head-to-head comparison with checkmarks or scores — that's a competitive matrix",
    "the user wants a typed list / spreadsheet — that's a table",
    "the user wants a persona walking through stages — that's a journey map",
    "the user wants a directed flow with decisions and handoffs — that's a process map",
  ],
};
