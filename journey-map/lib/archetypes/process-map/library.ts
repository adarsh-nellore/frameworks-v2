import type { ArchetypeLibrary } from "@/lib/archetypes/types";

export const processMapLibrary: ArchetypeLibrary = {
  purpose:
    "A directed graph modelling a real process: nodes are steps (tasks, decisions, start, end), edges carry ordering + handoffs, optional swimlanes group by actor, optional phases group by stage of time.",
  selectionHints: [
    "\"process\" / \"process map\" / \"flow\" / \"flowchart\" / \"workflow\" / \"pipeline\" / \"service blueprint\"",
    "\"handoff\" / \"sequence\" / \"approval flow\" / \"escalation\" / \"runbook\" / \"playbook\"",
    "\"state machine\" / \"state diagram\" / \"decision tree\" / \"BPMN\"",
    "language like \"when X, do Y\" / \"if approved, route to Z\" / \"step 1 then step 2\" / \"on failure, retry\"",
    "the user describes multiple actors passing work between each other over a sequence of steps",
    "\"claims flow\" / \"intake flow\" / \"onboarding flow\" / \"deployment pipeline\" / \"incident response flow\"",
  ],
  exampleIntents: [
    "Draw the claims-review process across three teams — intake, triage, resolution",
    "Build the flowchart for our customer onboarding with approval branches",
    "Map our incident-response runbook — detection, escalation, mitigation, postmortem",
    "Show the approval pipeline for enterprise deals — SE, sales ops, legal, CFO",
    "Service blueprint for a returns process — customer, agent, warehouse, finance",
  ],
  antiHints: [
    "the user wants a narrative experience of a persona across stages (thoughts, emotions) — that's a journey map",
    "the user wants a list / roster / inventory with typed columns — that's a table",
    "the user wants head-to-head competitor comparison — that's a competitive matrix",
    "the user wants points plotted on continuous axes — that's a cartesian plot",
  ],
};
