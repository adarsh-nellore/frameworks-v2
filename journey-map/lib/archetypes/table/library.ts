import type { ArchetypeLibrary } from "@/lib/archetypes/types";

export const tableLibrary: ArchetypeLibrary = {
  purpose:
    "A typed data table: rows-as-records with a defined column schema. The output a user wants when they ask for a list, roster, inventory, or spreadsheet of Xs.",
  selectionHints: [
    "\"list of X\" / \"inventory of X\" / \"roster of X\" / \"table of X\"",
    "\"spreadsheet\" / \"CSV\" / \"tabular\" / \"dataset\"",
    "the user wants records with defined fields (name, ARR, stage, region, …) — enumeration-style not narrative",
    "the user is about to sort / filter / export — shape is a real table, not cards",
    "\"top N …\", \"our top 20 …\", \"Q1 … by …\"",
  ],
  exampleIntents: [
    "List our top 20 enterprise deals with ARR and stage",
    "Build a roster of 30 mid-market CRMs with pricing, target segment, and integration count",
    "Create an inventory of our open security findings with severity and owner",
    "Table of our customer success managers with portfolio size and renewal rate",
    "Spreadsheet of all Q1 feature launches with ship date and owner",
  ],
  antiHints: [
    "the user describes a persona walking through stages — that's a journey map",
    "the user wants to compare competitors on capability axes with checkmarks/scores — that's a competitive matrix",
    "the user wants points plotted on continuous x/y axes — that's a cartesian plot",
    "the user describes a directed flow with decisions/approvals — that's a process map",
  ],
};
