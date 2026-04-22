import type { EditableCell, EditableEdge, EditableCluster, CustomAction } from "@/components/ui/grid/EditableGrid";

// ──────────────────────────────────────────────────────────────────────────────
// Seed data for /preview/service-blueprint.
// Lives in a shared module so the preview page AND the agent-runner script
// can consume the same source of truth.
// ──────────────────────────────────────────────────────────────────────────────

export const SB_FRAMEWORK_NAME = "service-blueprint";
export const SB_STRUCTURE_HINT = "process-flow" as const;
export const SB_INSTANCE_CONTEXT =
  "Telemedicine visit, end-to-end — 5 swimlanes (Physical Evidence → Patient Actions → Frontstage clinician → Backstage clinical ops → Support Processes) × 6 phases (Book → Pre-visit → Connect → Consult → Rx & discharge → Follow-up).";

export const SB_CONFIG = { cellW: 160, cellH: 78, gap: 14, cols: 30, rows: 20 };

export const SB_ROW_LABELS = [
  "Physical Evidence", "", "", "",
  "Patient Actions", "", "", "",
  "Frontstage · clinician", "", "", "",
  "Backstage · clinical ops", "", "", "",
  "Support Processes", "", "",
];

export const SB_COL_LABELS = [
  "Book appointment", "", "", "", "",
  "Pre-visit intake", "", "", "", "",
  "Connect", "", "", "", "",
  "Consult", "", "", "", "",
  "Rx & discharge", "", "", "", "",
  "Follow-up", "", "", "", "",
];

export const SB_CELLS: EditableCell[] = [
  // ── Swimlane 1 · Physical Evidence (rows 0–2) ────────────────────────────
  { id: "pe_book_1", row: 0, col: 0, text: "App home screen" },
  { id: "pe_book_2", row: 1, col: 0, text: "Provider directory list" },
  { id: "pe_book_3", row: 2, col: 0, text: "Price estimate page" },
  { id: "pe_book_4", row: 0, col: 2, text: "Insurance eligibility banner" },
  { id: "pe_book_5", row: 1, col: 2, text: "Booking confirmation email" },
  { id: "pe_pre_1", row: 0, col: 5, text: "Intake form (mobile web)" },
  { id: "pe_pre_2", row: 1, col: 5, text: "ID + insurance card upload" },
  { id: "pe_pre_3", row: 2, col: 5, text: "Med list pre-fill screen" },
  { id: "pe_pre_4", row: 0, col: 7, text: "24h / 1h reminder SMS" },
  { id: "pe_conn_1", row: 0, col: 10, text: "'Join visit' deep link" },
  { id: "pe_conn_2", row: 1, col: 10, text: "Mic + camera test screen" },
  { id: "pe_conn_3", row: 2, col: 10, text: "Virtual waiting room UI" },
  { id: "pe_cons_1", row: 0, col: 15, text: "Live video HUD" },
  { id: "pe_cons_2", row: 1, col: 15, text: "In-visit chat sidebar" },
  { id: "pe_cons_3", row: 2, col: 15, text: "Shared vitals / photos panel" },
  { id: "pe_rx_1", row: 0, col: 20, text: "E-prescription PDF" },
  { id: "pe_rx_2", row: 1, col: 20, text: "After-visit summary email" },
  { id: "pe_rx_3", row: 2, col: 20, text: "Care plan PDF + handouts" },
  { id: "pe_fu_1", row: 0, col: 25, text: "Post-visit survey link" },
  { id: "pe_fu_2", row: 1, col: 25, text: "Rx refill reminder push" },
  { id: "pe_fu_3", row: 2, col: 25, text: "Next-appt suggestion email" },

  // ── Swimlane 2 · Patient Actions (rows 4–6) ──────────────────────────────
  { id: "pa_book_1", row: 4, col: 0, text: "Search 'urgent care nearby'" },
  { id: "pa_book_2", row: 5, col: 0, text: "Filter by insurance in-network" },
  { id: "pa_book_3", row: 6, col: 0, text: "Pick clinician + time slot" },
  { id: "pa_book_4", row: 4, col: 2, text: "Enter card for $0 copay auth" },
  { id: "pa_book_5", row: 5, col: 2, text: "Confirm booking" },
  { id: "pa_pre_1", row: 4, col: 5, text: "Complete symptom questionnaire" },
  { id: "pa_pre_2", row: 5, col: 5, text: "Upload photo of rash / injury" },
  { id: "pa_pre_3", row: 6, col: 5, text: "List current medications" },
  { id: "pa_pre_4", row: 4, col: 7, text: "Test camera + mic at T-10 min" },
  { id: "pa_conn_1", row: 4, col: 10, text: "Click 'Join visit' link" },
  { id: "pa_conn_2", row: 5, col: 10, text: "Grant mic + camera perms" },
  { id: "pa_conn_3", row: 6, col: 10, text: "Wait in virtual room (avg 3 min)" },
  { id: "pa_cons_1", row: 4, col: 15, text: "Describe symptoms verbally" },
  { id: "pa_cons_2", row: 5, col: 15, text: "Show affected area on camera" },
  { id: "pa_cons_3", row: 6, col: 15, text: "Ask clarifying questions" },
  { id: "pa_rx_1", row: 4, col: 20, text: "Confirm preferred pharmacy" },
  { id: "pa_rx_2", row: 5, col: 20, text: "Review care plan on-screen" },
  { id: "pa_rx_3", row: 6, col: 20, text: "Pay final copay balance" },
  { id: "pa_fu_1", row: 4, col: 25, text: "Rate the visit (NPS + comments)" },
  { id: "pa_fu_2", row: 5, col: 25, text: "Tap refill when Rx runs low" },
  { id: "pa_fu_3", row: 6, col: 25, text: "Book follow-up if not better" },

  // ── Swimlane 3 · Frontstage · Clinician / MA (rows 8–10) ─────────────────
  { id: "fs_book_1", row: 8, col: 0, text: "(No live clinician yet)" },
  { id: "fs_book_2", row: 9, col: 0, text: "Provider bio + photo visible" },
  { id: "fs_book_3", row: 10, col: 0, text: "Clinician publishes availability" },
  { id: "fs_pre_1", row: 8, col: 5, text: "Triage nurse reviews intake" },
  { id: "fs_pre_2", row: 9, col: 5, text: "Nurse messages 'see you soon'" },
  { id: "fs_pre_3", row: 10, col: 5, text: "Nurse flags urgent symptoms" },
  { id: "fs_conn_1", row: 8, col: 10, text: "Clinician joins call" },
  { id: "fs_conn_2", row: 9, col: 10, text: "Greets + confirms identity" },
  { id: "fs_conn_3", row: 10, col: 10, text: "Reconfirms recorded-consent" },
  { id: "fs_cons_1", row: 8, col: 15, text: "Ask focused exam questions" },
  { id: "fs_cons_2", row: 9, col: 15, text: "Perform visual exam on cam" },
  { id: "fs_cons_3", row: 10, col: 15, text: "Explain assessment out loud" },
  { id: "fs_cons_4", row: 8, col: 17, text: "Order labs / imaging if needed" },
  { id: "fs_rx_1", row: 8, col: 20, text: "Write Rx in EHR" },
  { id: "fs_rx_2", row: 9, col: 20, text: "Walk through care instructions" },
  { id: "fs_rx_3", row: 10, col: 20, text: "Answer meds/side-effect questions" },
  { id: "fs_fu_1", row: 8, col: 25, text: "Respond to patient messages" },
  { id: "fs_fu_2", row: 9, col: 25, text: "Review lab results when back" },
  { id: "fs_fu_3", row: 10, col: 25, text: "Approve refills / escalations" },

  // ── Swimlane 4 · Backstage · Clinical Ops (rows 12–14) ───────────────────
  { id: "bs_book_1", row: 12, col: 0, text: "Ops: list provider in marketplace" },
  { id: "bs_book_2", row: 13, col: 0, text: "Ops: verify credentials + NPI" },
  { id: "bs_book_3", row: 14, col: 0, text: "Billing: real-time eligibility check" },
  { id: "bs_pre_1", row: 12, col: 5, text: "MA: pre-chart patient in EHR" },
  { id: "bs_pre_2", row: 13, col: 5, text: "Scheduler: confirm & block slot" },
  { id: "bs_pre_3", row: 14, col: 5, text: "Triage engine: risk-stratify" },
  { id: "bs_conn_1", row: 12, col: 10, text: "IT: monitor call quality dashboard" },
  { id: "bs_conn_2", row: 13, col: 10, text: "Ops: bump to in-person if quality fails" },
  { id: "bs_cons_1", row: 12, col: 15, text: "Scribe transcribes visit live" },
  { id: "bs_cons_2", row: 13, col: 15, text: "QA listener spot-checks calls" },
  { id: "bs_cons_3", row: 14, col: 15, text: "Legal: archive recorded consent" },
  { id: "bs_rx_1", row: 12, col: 20, text: "Pharma ops: route e-Rx to chain" },
  { id: "bs_rx_2", row: 13, col: 20, text: "Billing: generate claim" },
  { id: "bs_rx_3", row: 14, col: 20, text: "Coder: assign CPT + ICD-10" },
  { id: "bs_fu_1", row: 12, col: 25, text: "CX: follow up on low-CSAT surveys" },
  { id: "bs_fu_2", row: 13, col: 25, text: "Ops: reach out to no-shows" },
  { id: "bs_fu_3", row: 14, col: 25, text: "Billing: post payment / denial" },

  // ── Swimlane 5 · Support Processes (rows 16–18) ──────────────────────────
  { id: "sp_book_1", row: 16, col: 0, text: "Scheduling engine" },
  { id: "sp_book_2", row: 17, col: 0, text: "Insurance eligibility API" },
  { id: "sp_book_3", row: 18, col: 0, text: "Stripe: card auth hold" },
  { id: "sp_pre_1", row: 16, col: 5, text: "EHR: patient chart service" },
  { id: "sp_pre_2", row: 17, col: 5, text: "Twilio: SMS reminder pipeline" },
  { id: "sp_pre_3", row: 18, col: 5, text: "NLP triage + risk classifier" },
  { id: "sp_conn_1", row: 16, col: 10, text: "WebRTC video infra" },
  { id: "sp_conn_2", row: 17, col: 10, text: "STUN/TURN + geo load balance" },
  { id: "sp_conn_3", row: 18, col: 10, text: "Deep-link + SMS fallback" },
  { id: "sp_cons_1", row: 16, col: 15, text: "EHR: clinical note API" },
  { id: "sp_cons_2", row: 17, col: 15, text: "Computer vision (vitals from cam)" },
  { id: "sp_cons_3", row: 18, col: 15, text: "AI medical scribe" },
  { id: "sp_rx_1", row: 16, col: 20, text: "Surescripts e-Rx gateway" },
  { id: "sp_rx_2", row: 17, col: 20, text: "Stripe: capture final charge" },
  { id: "sp_rx_3", row: 18, col: 20, text: "CPT/ICD coding service" },
  { id: "sp_fu_1", row: 16, col: 25, text: "Survey platform (Delighted)" },
  { id: "sp_fu_2", row: 17, col: 25, text: "Email / push (Braze)" },
  { id: "sp_fu_3", row: 18, col: 25, text: "Analytics + funnel (Amplitude)" },

  // ── Added by parallel agents (moments of truth, handoff fixes, safety net, failure modes) ──
  { id: "agent-pe-conn-first10", row: 0, col: 12, text: "Clinician face + name card (first 10s)" },
  { id: "agent-pa-conn-first10", row: 4, col: 12, text: "See clinician appear on screen" },
  { id: "agent-fs-conn-first10", row: 8, col: 12, text: "Appear on cam: smile, eye contact, intro" },
  { id: "agent-sp-conn-first10", row: 16, col: 12, text: "Video quality + latency SLA" },
  { id: "agent-pe-fu-safety", row: 0, col: 27, text: "Day-3 safety-net call script" },
  { id: "agent-pa-fu-safety", row: 4, col: 27, text: "Receive safety-net check-in call" },
  { id: "agent-fs-fu-safety", row: 8, col: 27, text: "Call patient if symptoms worsen" },
  { id: "agent-bs-fu-safety", row: 12, col: 27, text: "Ops: trigger safety-net protocol" },
  { id: "agent-sp-fu-safety", row: 16, col: 27, text: "Automated safety-net workflow" },
  { id: "agent-bs-pre-4", row: 14, col: 8, text: "Ops: trigger 'no-show' protocol if patient absent" },
  { id: "agent-bs-rx-4", row: 12, col: 22, text: "Ops: monitor pharmacy fill status" },
  { id: "agent-fs-rx-4", row: 9, col: 22, text: "Clinician: check if Rx was filled" },
  { id: "agent-risk-book", row: 17, col: 2, text: "⚠ Eligibility API timeout → booked but uncovered" },
  { id: "agent-risk-pre", row: 14, col: 6, text: "⚠ High-risk symptom flagged but nurse misses alert" },
  { id: "agent-risk-conn", row: 18, col: 12, text: "⚠ WebRTC drops; patient can't reconnect" },
  { id: "agent-risk-cons", row: 13, col: 17, text: "⚠ QA listener absent; clinician skips exam step" },
  { id: "agent-risk-rx", row: 14, col: 22, text: "⚠ Rx routed to wrong pharmacy; patient never picks up" },
  { id: "agent-risk-fu", row: 18, col: 27, text: "⚠ Survey link broken; no feedback collected" },
];

export const SB_CLUSTERS: EditableCluster[] = [
  // Moments of truth (accent)
  { id: "mot-1-booking-trust", label: "MOT: Booking trust", tone: "accent", cellIds: ["pe_book_5", "pa_book_5", "fs_book_2", "sp_book_1"] },
  { id: "mot-2-first-10s", label: "MOT: First impression", tone: "accent", cellIds: ["agent-pe-conn-first10", "agent-pa-conn-first10", "agent-fs-conn-first10", "agent-sp-conn-first10"] },
  { id: "mot-3-tech-reliability", label: "MOT: Tech reliability", tone: "accent", cellIds: ["pe_conn_3", "pa_conn_3", "bs_conn_1", "sp_conn_1"] },
  { id: "mot-4-clinical-clarity", label: "MOT: Clinical clarity", tone: "accent", cellIds: ["pe_cons_3", "pa_cons_3", "fs_cons_3", "sp_cons_3"] },
  { id: "mot-5-safety-net", label: "MOT: Safety net", tone: "accent", cellIds: ["agent-pe-fu-safety", "agent-pa-fu-safety", "agent-fs-fu-safety", "agent-bs-fu-safety", "agent-sp-fu-safety"] },
  // Handoff failures (warn)
  { id: "handoff-video-join", label: "Video join handoff", tone: "warn", cellIds: ["pa_conn_1", "pa_conn_2", "fs_conn_1", "sp_conn_2"] },
  { id: "handoff-intake-triage", label: "Intake → triage", tone: "warn", cellIds: ["pa_pre_1", "pa_pre_2", "fs_pre_1", "fs_pre_3", "bs_pre_3"] },
  { id: "handoff-rx-pharmacy", label: "Rx → pharmacy fill", tone: "warn", cellIds: ["fs_rx_1", "bs_rx_1", "sp_rx_1", "agent-bs-rx-4", "agent-fs-rx-4"] },
  { id: "handoff-no-show", label: "Patient no-show", tone: "warn", cellIds: ["pa_pre_4", "agent-bs-pre-4"] },
];

export const SB_EDGES: EditableEdge[] = [
  { id: "e_conn_join", fromId: "pa_conn_1", toId: "fs_conn_1", label: "joins call", routing: "orthogonal" },
  { id: "e_cons_ask", fromId: "pa_cons_1", toId: "fs_cons_1", label: "symptoms", routing: "orthogonal" },
  { id: "e_intake_pre", fromId: "pa_pre_1", toId: "fs_pre_1", label: "review", routing: "orthogonal" },
  { id: "e_rx_handoff", fromId: "fs_rx_1", toId: "bs_rx_1", label: "e-Rx", routing: "orthogonal" },
  { id: "e_scribe", fromId: "fs_cons_2", toId: "bs_cons_1", label: "transcribe", routing: "orthogonal" },
  { id: "e_sched_sp", fromId: "pa_book_3", toId: "sp_book_1", label: "book", routing: "orthogonal" },
  { id: "e_rx_sp", fromId: "bs_rx_1", toId: "sp_rx_1", label: "transmit", routing: "orthogonal" },
  { id: "e_billing_sp", fromId: "bs_rx_2", toId: "sp_rx_2", label: "charge", routing: "orthogonal" },
  { id: "e_survey_sp", fromId: "bs_fu_1", toId: "sp_fu_1", label: "trigger", routing: "orthogonal" },

  // ── Added by Map-service-chains agent (customer → frontstage → backstage → support) ──
  { id: "chain-book-1", fromId: "pa_book_3", toId: "fs_book_3", label: "select slot", routing: "orthogonal" },
  { id: "chain-book-2", fromId: "fs_book_3", toId: "bs_book_2", label: "verify", routing: "orthogonal" },
  { id: "chain-book-3", fromId: "bs_book_3", toId: "sp_book_2", label: "check", routing: "orthogonal" },
  { id: "chain-pre-1", fromId: "fs_pre_1", toId: "bs_pre_1", label: "pre-chart", routing: "orthogonal" },
  { id: "chain-pre-2", fromId: "bs_pre_1", toId: "sp_pre_1", label: "EHR", routing: "orthogonal" },
  { id: "chain-conn-1", fromId: "fs_conn_1", toId: "bs_conn_1", label: "monitor", routing: "orthogonal" },
  { id: "chain-conn-2", fromId: "bs_conn_1", toId: "sp_conn_1", label: "WebRTC", routing: "orthogonal" },
  { id: "chain-cons-1", fromId: "fs_cons_1", toId: "bs_cons_1", label: "scribe", routing: "orthogonal" },
  { id: "chain-cons-2", fromId: "bs_cons_1", toId: "sp_cons_1", label: "note API", routing: "orthogonal" },
  { id: "chain-rx-1", fromId: "pa_rx_1", toId: "fs_rx_1", label: "pharmacy", routing: "orthogonal" },
  { id: "chain-rx-2", fromId: "bs_rx_1", toId: "sp_rx_1", label: "gateway", routing: "orthogonal" },
  { id: "chain-fu-1", fromId: "pa_fu_1", toId: "fs_fu_1", label: "feedback", routing: "orthogonal" },
  { id: "chain-fu-2", fromId: "fs_fu_1", toId: "bs_fu_1", label: "CX review", routing: "orthogonal" },
  { id: "chain-fu-3", fromId: "bs_fu_1", toId: "sp_fu_1", label: "survey", routing: "orthogonal" },
];

export const SB_ACTIONS: CustomAction[] = [
  {
    key: "sb-moments-of-truth",
    label: "Identify moments of truth",
    hint: "Tag the 3-5 make-or-break moments, add any that are missing",
    task:
      "Identify the 3 to 5 MOMENTS OF TRUTH in this service blueprint — the specific customer-visible interactions where the service's quality is made or broken in the patient's mind. Look across all phases, not just obvious ones. Mark each as an 'accent' cluster spanning the customer-action cell + its corresponding frontstage / support-process cells (so the cluster shows the full vertical moment, not just the customer row). If critical moments are missing from the board (e.g., the FIRST 10 seconds when the clinician appears on video, or the safety-net follow-up call), ADD those cells in the correct swimlane before clustering. Do NOT re-order or re-lane existing cells.",
    allowClusters: true,
    allowNewCells: true,
  },
  {
    key: "sb-service-chains",
    label: "Map service chains",
    hint: "Draw edges that trace each customer moment to its support",
    task:
      "For each phase, trace the full SERVICE CHAIN: customer action → frontstage response → backstage operation → support process. Add directed edges from customer-action cells down through the stack so every phase shows the complete chain of support. Where a chain is BROKEN (e.g., a customer action with no frontstage responder, or a frontstage action with no support process behind it), ADD the missing cell in the correct swimlane — don't just draw edges to nothing. Label the edges terse (1-3 words). Do not move existing cells.",
    allowNewEdges: true,
    allowNewCells: true,
  },
  {
    key: "sb-handoff-failures",
    label: "Find handoff failures",
    hint: "Flag fragile customer/frontstage/backstage/support transitions",
    task:
      "A service blueprint breaks at HANDOFFS: customer→frontstage (first impression), frontstage→backstage (internal comms), backstage→support (system reliability). Examine each phase and identify the 2-4 handoffs most likely to fail in this telemedicine context. Mark each as a 'warn' cluster that spans the cells involved in the fragile handoff (e.g., patient 'Join visit' + clinician 'Clinician joins call' + 'WebRTC video infra'). Where a handoff is incomplete on the board (a customer action with no visible responder, or a frontstage moment with no backing ops cell), ADD the missing cell. Do not move existing cells.",
    allowClusters: true,
    allowNewCells: true,
  },
  {
    key: "sb-failure-modes",
    label: "Stress-test failure modes",
    hint: "Inject realistic failures per phase, place in the right lane",
    task:
      "For each phase, identify the single most likely FAILURE MODE — what goes wrong in the real world (e.g., Connect: video call drops; Rx & discharge: prescription sent to wrong pharmacy; Follow-up: patient ignores survey). Add a new cell per failure mode with id prefixed 'risk-' and text starting with '⚠' describing the failure tersely. Place each risk cell in the swimlane where the failure originates (if it's a support-process glitch, put it in Support Processes; if it's a backstage mistake, put it in Backstage). Group related risk cells as 'warn' clusters (e.g., all Connect-phase failures together). Do not modify or move existing cells.",
    allowNewCells: true,
    allowClusters: true,
  },
];
