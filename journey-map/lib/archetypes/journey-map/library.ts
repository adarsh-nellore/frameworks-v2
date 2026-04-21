import type { ArchetypeLibrary } from "@/lib/archetypes/types";

export const journeyMapLibrary: ArchetypeLibrary = {
  purpose:
    "Map a persona's end-to-end experience moving through a sequence of stages, capturing what they do, see, think, feel, struggle with, and where we can intervene.",
  selectionHints: [
    "customer journey / user journey / patient journey / employee journey / buyer journey",
    "experience map / journey map / end-to-end journey",
    "the user asks to walk through what someone goes through across a sequence of phases",
    "persona-driven narrative across stages with emotional and behavioral rows",
    "onboarding / activation / enrollment flow framed as an experience, not a directed graph",
  ],
  exampleIntents: [
    "Map the onboarding journey for a new SaaS customer",
    "Build a patient-enrollment journey from first symptoms to follow-up",
    "Show the employee experience from offer through day 90",
    "Build a journey map for a buyer evaluating enterprise CRMs",
    "Walk through what a small-business owner does when applying for a loan",
  ],
  antiHints: [
    "the user describes arrows / flow / process-map semantics (\"when X, do Y; approve or deny\") — route to process-map archetype instead",
    "the user asks for a competitor comparison matrix — route to competitive-matrix",
    "the user asks for a sortable data table of records — route to table",
    "the user wants points plotted on continuous x/y axes (effort vs impact, etc.) — route to cartesian-plot",
  ],
};
