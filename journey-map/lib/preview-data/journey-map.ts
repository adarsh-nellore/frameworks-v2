import type { EditableCell, EditableEdge, EditableCluster, CustomAction } from "@/components/ui/grid/EditableGrid";

// ──────────────────────────────────────────────────────────────────────────────
// Seed data for /preview/journey-map. Shared between the page and the agent-
// runner script so there's one source of truth.
// ──────────────────────────────────────────────────────────────────────────────

export const JM_FRAMEWORK_NAME = "journey-map";
export const JM_STRUCTURE_HINT = "process-flow" as const;
export const JM_INSTANCE_CONTEXT =
  "Founder opening business banking post-SVB — 6 aspect rows (Goals, Actions, Thoughts, Emotions, Pains, Opportunities) × 7 stages (Awareness → Research → Consideration → Decision → Onboarding → Daily Use → Advocacy).";

export const JM_CONFIG = { cellW: 160, cellH: 78, gap: 14, cols: 22, rows: 18 };

export const JM_ROW_LABELS = [
  "Goals", "", "",
  "Actions", "", "",
  "Thoughts", "", "",
  "Emotions", "", "",
  "Pains", "", "",
  "Opportunities", "", "",
];

export const JM_COL_LABELS = [
  "Awareness", "", "",
  "Research", "", "",
  "Consideration", "", "",
  "Decision", "", "",
  "Onboarding", "", "",
  "Daily Use", "", "",
  "Advocacy", "", "",
];

export const JM_CELLS: EditableCell[] = [
  // ── Aspect 1 · Goals (rows 0–2) ─────────────────────────────────────────
  { id: "g_aware", row: 0, col: 0, text: "Understand banking options post-SVB" },
  { id: "g_research", row: 0, col: 3, text: "Shortlist 3 viable business banks" },
  { id: "g_consid", row: 0, col: 6, text: "Validate fees + runway visibility" },
  { id: "g_decision", row: 0, col: 9, text: "Open account, move seed money in" },
  { id: "g_onboard", row: 0, col: 12, text: "Get cards, integrate payroll + AP" },
  { id: "g_daily", row: 0, col: 15, text: "Run ops reliably, track burn weekly" },
  { id: "g_advocacy", row: 0, col: 18, text: "Refer other founders, stay loyal" },

  // ── Aspect 2 · Actions (rows 3–5) ───────────────────────────────────────
  { id: "a_aware_1", row: 3, col: 0, text: "Ask 3 founder friends" },
  { id: "a_aware_2", row: 4, col: 0, text: "See YC tweet thread" },
  { id: "a_aware_3", row: 5, col: 0, text: "Skim First Round review post" },
  { id: "a_research_1", row: 3, col: 3, text: "Visit Mercury / Brex / Relay / Rho" },
  { id: "a_research_2", row: 4, col: 3, text: "Watch 2 YouTube comparisons" },
  { id: "a_research_3", row: 5, col: 3, text: "Download fee schedule PDFs" },
  { id: "a_consid_1", row: 3, col: 6, text: "Book Brex demo call" },
  { id: "a_consid_2", row: 4, col: 6, text: "DM Mercury sales on LinkedIn" },
  { id: "a_consid_3", row: 5, col: 6, text: "Ask Slack founder group" },
  { id: "a_decision_1", row: 3, col: 9, text: "Apply online at Mercury" },
  { id: "a_decision_2", row: 4, col: 9, text: "Upload C-corp docs + ID" },
  { id: "a_decision_3", row: 5, col: 9, text: "Wire from personal account" },
  { id: "a_onboard_1", row: 3, col: 12, text: "Order team debit cards" },
  { id: "a_onboard_2", row: 4, col: 12, text: "Connect QuickBooks + Rippling" },
  { id: "a_onboard_3", row: 5, col: 12, text: "Set up Bill.com for AP" },
  { id: "a_daily_1", row: 3, col: 15, text: "Pay AWS monthly invoice" },
  { id: "a_daily_2", row: 4, col: 15, text: "Run Gusto payroll (15th + 30th)" },
  { id: "a_daily_3", row: 5, col: 15, text: "Wire to EU vendor" },
  { id: "a_advocacy_1", row: 3, col: 18, text: "Post LinkedIn testimonial" },
  { id: "a_advocacy_2", row: 4, col: 18, text: "Refer via unique link" },
  { id: "a_advocacy_3", row: 5, col: 18, text: "Answer Qs in founder Slack" },

  // ── Aspect 3 · Thoughts (rows 6–8) ──────────────────────────────────────
  { id: "t_aware_1", row: 6, col: 0, text: "'SVB blew up — is $250K FDIC enough?'" },
  { id: "t_aware_2", row: 7, col: 0, text: "'What do other seed startups use?'" },
  { id: "t_research_1", row: 6, col: 3, text: "'Which sweeps to $10M+ FDIC?'" },
  { id: "t_research_2", row: 7, col: 3, text: "'Are these all basically the same?'" },
  { id: "t_consid_1", row: 6, col: 6, text: "'Is Brex really free under $250K?'" },
  { id: "t_consid_2", row: 7, col: 6, text: "'Will Mercury Vault actually work?'" },
  { id: "t_decision_1", row: 6, col: 9, text: "'Am I making the right call?'" },
  { id: "t_decision_2", row: 7, col: 9, text: "'Should I ask legal first?'" },
  { id: "t_onboard_1", row: 6, col: 12, text: "'Why does KYC take 5 days?'" },
  { id: "t_onboard_2", row: 7, col: 12, text: "'Why re-upload my utility bill?'" },
  { id: "t_daily_1", row: 6, col: 15, text: "'Wire fees fine — what about ACH?'" },
  { id: "t_daily_2", row: 7, col: 15, text: "'How do I see reconciled cash fast?'" },
  { id: "t_advocacy_1", row: 6, col: 18, text: "'Is the referral worth the effort?'" },

  // ── Aspect 4 · Emotions (rows 9–11) ─────────────────────────────────────
  { id: "e_aware_1", row: 9, col: 0, text: "Worried" },
  { id: "e_aware_2", row: 10, col: 0, text: "Curious" },
  { id: "e_research_1", row: 9, col: 3, text: "Overwhelmed by marketing fluff" },
  { id: "e_consid_1", row: 9, col: 6, text: "Cautious, skeptical" },
  { id: "e_decision_1", row: 9, col: 9, text: "Committed" },
  { id: "e_decision_2", row: 10, col: 9, text: "Slight anxiety at wire" },
  { id: "e_onboard_1", row: 9, col: 12, text: "Frustrated by paperwork" },
  { id: "e_onboard_2", row: 10, col: 12, text: "Relieved when funds clear" },
  { id: "e_daily_1", row: 9, col: 15, text: "Confident" },
  { id: "e_daily_2", row: 10, col: 15, text: "Mild anxiety at month-end" },
  { id: "e_advocacy_1", row: 9, col: 18, text: "Proud, loyal" },

  // ── Aspect 5 · Pains (rows 12–14) ───────────────────────────────────────
  { id: "p_aware_1", row: 12, col: 0, text: "Don't even know what to search" },
  { id: "p_aware_2", row: 13, col: 0, text: "Generic 'business banking' SERPs" },
  { id: "p_research_1", row: 12, col: 3, text: "All sites look identical / buzzwordy" },
  { id: "p_research_2", row: 13, col: 3, text: "Hidden fees in the fine print" },
  { id: "p_consid_1", row: 12, col: 6, text: "Can't get straight fee answers" },
  { id: "p_consid_2", row: 13, col: 6, text: "'Premium' tiers feel opaque" },
  { id: "p_decision_1", row: 12, col: 9, text: "Application form fails on SSN" },
  { id: "p_decision_2", row: 13, col: 9, text: "No save-draft on long form" },
  { id: "p_onboard_1", row: 12, col: 12, text: "KYC asked for 12 docs incl. lease" },
  { id: "p_onboard_2", row: 13, col: 12, text: "5-day wait for first wire clearing" },
  { id: "p_daily_1", row: 12, col: 15, text: "No real-time incoming-wire alerts" },
  { id: "p_daily_2", row: 13, col: 15, text: "Clunky Xero export format" },
  { id: "p_advocacy_1", row: 12, col: 18, text: "No one-click referral tracking" },

  // ── Aspect 6 · Opportunities (rows 15–17) ───────────────────────────────
  { id: "o_aware_1", row: 15, col: 0, text: "Sponsor YC batch 'banking 101'" },
  { id: "o_aware_2", row: 16, col: 0, text: "'Founder-to-founder' explainer video" },
  { id: "o_research_1", row: 15, col: 3, text: "Objective comparison calculator" },
  { id: "o_research_2", row: 16, col: 3, text: "Clear fee matrix above the fold" },
  { id: "o_consid_1", row: 15, col: 6, text: "Founder concierge Slack channel" },
  { id: "o_consid_2", row: 16, col: 6, text: "Live-chat with real CSM, no bot" },
  { id: "o_decision_1", row: 15, col: 9, text: "Instant AI-verified KYC (standard docs)" },
  { id: "o_decision_2", row: 16, col: 9, text: "Save & resume application" },
  { id: "o_onboard_1", row: 15, col: 12, text: "Pre-wired QB + Rippling + Gusto" },
  { id: "o_onboard_2", row: 16, col: 12, text: "Named onboarding specialist" },
  { id: "o_daily_1", row: 15, col: 15, text: "Live runway + burn card on home" },
  { id: "o_daily_2", row: 16, col: 15, text: "Auto-categorize AP inflows" },
  { id: "o_advocacy_1", row: 15, col: 18, text: "Gold tier: cash + co-marketing" },
  { id: "o_advocacy_2", row: 16, col: 18, text: "Shareable founder dashboard" },

  // ── Added by parallel agents (new opportunities that address orphan thoughts) ──
  { id: "agent-o_aware_3", row: 17, col: 0, text: "SEO-optimized 'post-SVB banking' guide" },
  { id: "agent-o_decision_legal", row: 15, col: 10, text: "Legal checklist + 1-click counsel intro" },
];

export const JM_CLUSTERS: EditableCluster[] = [
  // Emotional arc
  { id: "valley-research-paralysis", label: "Decision paralysis", tone: "warn", cellIds: ["e_research_1", "e_consid_1"] },
  { id: "peak-daily-loyalty", label: "Confidence & loyalty", tone: "success", cellIds: ["e_daily_1", "e_advocacy_1"] },
  // Critical stage — full-column accent around Onboarding
  { id: "critical-stage-onboarding", label: "Onboarding · where first impression becomes reality", tone: "accent", cellIds: ["g_onboard", "a_onboard_1", "a_onboard_2", "a_onboard_3", "t_onboard_1", "t_onboard_2", "e_onboard_1", "e_onboard_2", "p_onboard_1", "p_onboard_2", "o_onboard_1", "o_onboard_2"] },
  // Thought-action gaps
  { id: "gap-decision-legal", label: "Legal anxiety gap", tone: "warn", cellIds: ["t_decision_2", "agent-o_decision_legal"] },
  { id: "gap-advocacy-effort", label: "Referral friction", tone: "warn", cellIds: ["t_advocacy_1", "p_advocacy_1"] },
];

export const JM_EDGES: EditableEdge[] = [
  { id: "je_1", fromId: "a_research_1", toId: "p_research_1", label: "triggers", routing: "orthogonal" },
  { id: "je_2", fromId: "p_research_1", toId: "o_research_1", label: "fixes", routing: "orthogonal" },
  { id: "je_3", fromId: "a_decision_2", toId: "p_decision_1", label: "hits", routing: "orthogonal" },
  { id: "je_4", fromId: "p_decision_1", toId: "o_decision_1", label: "fixes", routing: "orthogonal" },
  { id: "je_5", fromId: "a_onboard_2", toId: "p_onboard_1", label: "blocked by", routing: "orthogonal" },
  { id: "je_6", fromId: "p_onboard_1", toId: "o_onboard_1", label: "fixes", routing: "orthogonal" },
  { id: "je_7", fromId: "a_daily_3", toId: "p_daily_1", label: "annoys", routing: "orthogonal" },
  { id: "je_8", fromId: "p_daily_1", toId: "o_daily_1", label: "fixes", routing: "orthogonal" },

  // ── Added by Connect-pains-to-opportunities agent ──
  { id: "pain-opp-aware-1", fromId: "p_aware_1", toId: "o_aware_1", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-aware-2", fromId: "p_aware_2", toId: "agent-o_aware_3", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-research-2", fromId: "p_research_2", toId: "o_research_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-consid-1", fromId: "p_consid_1", toId: "o_consid_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-consid-2", fromId: "p_consid_2", toId: "o_consid_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-decision-2", fromId: "p_decision_2", toId: "o_decision_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-onboard-2", fromId: "p_onboard_2", toId: "o_onboard_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-daily-2", fromId: "p_daily_2", toId: "o_daily_2", label: "solves", routing: "orthogonal" },
  { id: "pain-opp-advocacy", fromId: "p_advocacy_1", toId: "o_advocacy_2", label: "solves", routing: "orthogonal" },
];

export const JM_ACTIONS: CustomAction[] = [
  {
    key: "jm-pain-to-opp",
    label: "Connect pains to opportunities",
    hint: "Edge every pain to its best-matching opportunity; flag gaps",
    task:
      "For each PAIN cell on the board, identify the OPPORTUNITY cell that most directly addresses it (same stage column, or an adjacent stage). Draw a directed edge from the pain to the opportunity labeled 'solves' or 'addresses'. If a pain has NO matching opportunity, add a new opportunity cell in the Opportunities row for that stage and edge to it. If an opportunity exists with no backing pain, it's solution-in-search-of-problem — mark it so by ADDING an edge label 'orphan' going FROM the opportunity to an empty slot (or just flag it in the critique-driven cells). Do not move existing cells. Preserve aspect rows — cells stay in their row.",
    allowNewEdges: true,
    allowNewCells: true,
  },
  {
    key: "jm-emotional-arc",
    label: "Map the emotional arc",
    hint: "Cluster peaks + valleys across the Emotions row",
    task:
      "Read the EMOTIONS row across all stages. Identify the 2-3 emotional PEAKS (magic moments where the user feels good or relieved) and 2-3 VALLEYS (friction points where the user is frustrated, anxious, overwhelmed). Cluster each peak with 'success' tone and each valley with 'warn' tone. A cluster may span 1-2 adjacent stage columns in the Emotions band. If the arc has a gap (e.g., the emotion cell for a stage is missing), ADD a realistic emotion cell first in the Emotions row (rows 9-11), then include it in the cluster. Clusters should only contain cells from the emotions row.",
    allowClusters: true,
    allowNewCells: true,
  },
  {
    key: "jm-critical-stage",
    label: "Locate the critical stage",
    hint: "Find the make-or-break stage, cluster its full column",
    task:
      "In any customer journey, ONE stage is the make-or-break point where conversion or long-term loyalty is decided. For this founder-opening-banking journey, identify that CRITICAL STAGE by reasoning about the goals, pains, and emotions in each stage. Once identified, create a single 'accent' cluster spanning the full column of that stage (include cells from every aspect row — goals, actions, thoughts, emotions, pains, opportunities). Label the cluster with the stage name + why it's critical (e.g., 'Decision · where trust is committed'). Do not modify other cells.",
    allowClusters: true,
  },
  {
    key: "jm-thought-gaps",
    label: "Find thought-action gaps",
    hint: "Cluster Thoughts that don't translate into Actions or Opportunities",
    task:
      "A thought-action gap is when the user is WONDERING or WORRYING about something (a cell in the Thoughts row) but there's no matching cell in the Actions row (what they DO about it) or the Opportunities row (what the product should offer). For each stage, inspect the Thoughts row and find cells with no downstream Action/Opportunity that addresses the thought. Cluster each gap with 'warn' tone, including the orphan Thought cell + whatever empty intent is nearby. If the gap is SEVERE (the product should clearly offer something and doesn't), ADD the missing opportunity cell in the Opportunities row (rows 15-17) so the cluster has something concrete. Keep existing cells in place.",
    allowClusters: true,
    allowNewCells: true,
  },
];
