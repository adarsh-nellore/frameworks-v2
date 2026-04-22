"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EditableGrid, type EditableCell } from "@/components/ui/grid/EditableGrid";

// ──────────────────────────────────────────────────────────────────────────────
// /preview/strategy-board — one big editable framework at 30×30.
//
// Content: a realistic Q3/Q4 planning workspace for an AI coding assistant
// company. ~100 cells scattered across 19 thematic regions (users, pains,
// competitors, tech stack, metrics, GTM, risks, compliance, capital, goals,
// questions) — the kind of scattered mixed-content board a real exec / PM
// would stare at. No initial structure beyond regional placement; the agent
// actions should earn their keep on content this messy.
// ──────────────────────────────────────────────────────────────────────────────

const STRATEGY_CELLS: EditableCell[] = [
  // ── Users & personas ─────────────────────────────────────────────────────
  { id: "u01", row: 0, col: 0, text: "Solo indie dev — Fiverr/freelance" },
  { id: "u02", row: 1, col: 0, text: "Sr engineer @ mid-stage SaaS" },
  { id: "u03", row: 2, col: 0, text: "Engineering manager (30 reports)" },
  { id: "u04", row: 3, col: 0, text: "FAANG staff eng — reputation sensitive" },
  { id: "u05", row: 4, col: 0, text: "Bootcamp grad, < 2yr experience" },
  { id: "u06", row: 0, col: 2, text: "Platform / DevEx team lead" },
  { id: "u07", row: 1, col: 2, text: "Security architect — audit focus" },
  { id: "u08", row: 2, col: 2, text: "VP Eng — measuring team velocity" },
  { id: "u09", row: 3, col: 2, text: "Open-source maintainer" },
  { id: "u10", row: 4, col: 2, text: "Junior dev ramping onto unfamiliar code" },

  // ── User pains ────────────────────────────────────────────────────────────
  { id: "p01", row: 0, col: 4, text: "Pain: 2M+ LoC codebase breaks context" },
  { id: "p02", row: 1, col: 4, text: "Pain: hallucinated imports land in prod" },
  { id: "p03", row: 2, col: 4, text: "Pain: 15s latency kills flow state" },
  { id: "p04", row: 3, col: 4, text: "Pain: can't audit 'what did AI write?'" },
  { id: "p05", row: 4, col: 4, text: "Pain: juniors can't spot wrong answers" },
  { id: "p06", row: 0, col: 6, text: "Pain: $30/seat/mo breaks SMB budgets" },
  { id: "p07", row: 1, col: 6, text: "Pain: code leaks to training datasets" },
  { id: "p08", row: 2, col: 6, text: "Pain: no team-level productivity metrics" },
  { id: "p09", row: 3, col: 6, text: "Pain: copyleft poisoning fear in OSS" },
  { id: "p10", row: 4, col: 6, text: "Pain: fragmented IDE-plugin ecosystem" },

  // ── Competitive landscape ────────────────────────────────────────────────
  { id: "c01", row: 0, col: 9, text: "Cursor — strongest UX, tightest loop" },
  { id: "c02", row: 1, col: 9, text: "Cursor weak: enterprise auth + audit" },
  { id: "c03", row: 2, col: 9, text: "GH Copilot — ubiquity, IDE integration" },
  { id: "c04", row: 3, col: 9, text: "Copilot weak: reasoning, agent mode" },
  { id: "c05", row: 4, col: 9, text: "Codeium — free tier, on-prem option" },
  { id: "c06", row: 0, col: 11, text: "Cline — OSS agent, MCP standard" },
  { id: "c07", row: 1, col: 11, text: "Claude Code — terminal, tool-native" },
  { id: "c08", row: 2, col: 11, text: "Replit Agent — browser-native fullstack" },
  { id: "c09", row: 3, col: 11, text: "Cody (Sourcegraph) — code-search DNA" },
  { id: "c10", row: 4, col: 11, text: "Devin — autonomous SWE, high variance" },
  { id: "c11", row: 0, col: 13, text: "We win: agent reliability + audit trail" },
  { id: "c12", row: 1, col: 13, text: "We lose: raw IDE polish, onboarding" },
  { id: "c13", row: 2, col: 13, text: "Moat: Anthropic access + RL eval loop" },

  // ── Market & trends ──────────────────────────────────────────────────────
  { id: "m01", row: 0, col: 16, text: "TAM: $4B code AI by 2027" },
  { id: "m02", row: 1, col: 16, text: "73% of devs use AI tools weekly (2026)" },
  { id: "m03", row: 2, col: 16, text: "Enterprise AI spend +140% YoY" },
  { id: "m04", row: 3, col: 16, text: "40% of ent deals lost on compliance" },
  { id: "m05", row: 4, col: 16, text: "Agent mode = 2026 wedge" },
  { id: "m06", row: 0, col: 18, text: "Segment: Enterprise >500 eng (focus)" },
  { id: "m07", row: 1, col: 18, text: "Segment: SMB 20-100 eng (PLG)" },
  { id: "m08", row: 2, col: 18, text: "Segment: Indie ($0 acquisition cost)" },
  { id: "m09", row: 3, col: 18, text: "Geo: NA 62% · EU 24% · APAC 11%" },

  // ── Growth experiments ───────────────────────────────────────────────────
  { id: "g01", row: 0, col: 21, text: "Exp: GitHub Action 'PR review' (viral)" },
  { id: "g02", row: 1, col: 21, text: "Exp: student plan $5/mo with .edu" },
  { id: "g03", row: 2, col: 21, text: "Exp: usage-based team pricing" },
  { id: "g04", row: 3, col: 21, text: "Exp: free tier for 100+ ★ contributors" },
  { id: "g05", row: 0, col: 24, text: "Exp: YouTube creator partner program" },
  { id: "g06", row: 1, col: 24, text: "Exp: 'prove-the-lift' 2-week trial" },
  { id: "g07", row: 2, col: 24, text: "Exp: re:Invent conference booth" },
  { id: "g08", row: 3, col: 24, text: "Exp: dev newsletter sponsorships" },

  // ── Product features & bets ──────────────────────────────────────────────
  { id: "f01", row: 7, col: 0, text: "✓ Tab completion (GA Q1)" },
  { id: "f02", row: 8, col: 0, text: "✓ Inline refactor chat (GA Q1)" },
  { id: "f03", row: 9, col: 0, text: "✓ Multi-file edit (GA Q2)" },
  { id: "f04", row: 10, col: 0, text: "✓ Repo-level RAG (GA Q2)" },
  { id: "f05", row: 11, col: 0, text: "✓ Team workspace (GA Q2)" },
  { id: "f06", row: 7, col: 3, text: "⚡ Agent mode — opens PRs (beta)" },
  { id: "f07", row: 8, col: 3, text: "⚡ Audit trail export (in dev)" },
  { id: "f08", row: 9, col: 3, text: "⚡ Local model option (alpha)" },
  { id: "f09", row: 10, col: 3, text: "⚡ Custom reward model (research)" },
  { id: "f10", row: 11, col: 3, text: "⚡ PR review copilot (scoping)" },
  { id: "f11", row: 7, col: 6, text: "🎯 Bet: Enterprise RAG-over-monorepo" },
  { id: "f12", row: 8, col: 6, text: "🎯 Bet: Vim/Neovim plugin (H2)" },
  { id: "f13", row: 9, col: 6, text: "🎯 Bet: Staging sandbox execution" },
  { id: "f14", row: 10, col: 6, text: "❌ Dropped: Voice coding" },
  { id: "f15", row: 11, col: 6, text: "❌ Dropped: Code benchmark arena" },

  // ── Technical architecture ───────────────────────────────────────────────
  { id: "t01", row: 7, col: 9, text: "Primary model: Claude Opus 4.7" },
  { id: "t02", row: 8, col: 9, text: "Fallback: GPT-5 (~1% of traffic)" },
  { id: "t03", row: 9, col: 9, text: "Local: 8B open model (Q4 preview)" },
  { id: "t04", row: 10, col: 9, text: "Context: 1M beta · 200K GA" },
  { id: "t05", row: 11, col: 9, text: "Latency p50: 1.8s · p95: 4.2s" },
  { id: "t06", row: 7, col: 11, text: "RAG: git + docs + Jira + Linear" },
  { id: "t07", row: 8, col: 11, text: "Embeddings: Voyage-code-3" },
  { id: "t08", row: 9, col: 11, text: "Vector DB: Turbopuffer (migrated Q2)" },
  { id: "t09", row: 10, col: 11, text: "Eval: 2.4K test cases, daily CI" },
  { id: "t10", row: 11, col: 11, text: "Infra cost: $0.12/DAU (-30% Q2→Q3)" },
  { id: "t11", row: 7, col: 14, text: "Surface: VSCode extension (flagship)" },
  { id: "t12", row: 8, col: 14, text: "Surface: JetBrains plugin (v2 Q3)" },
  { id: "t13", row: 9, col: 14, text: "Surface: CLI (Claude Code style)" },
  { id: "t14", row: 10, col: 14, text: "Surface: REST API for CI/CD" },
  { id: "t15", row: 11, col: 14, text: "Data residency: US + EU shards" },

  // ── Pricing ───────────────────────────────────────────────────────────────
  { id: "pr01", row: 7, col: 17, text: "Free: 50 messages/mo" },
  { id: "pr02", row: 8, col: 17, text: "Pro: $20/mo unlimited" },
  { id: "pr03", row: 9, col: 17, text: "Team: $30/seat/mo (5+ seats)" },
  { id: "pr04", row: 10, col: 17, text: "Enterprise: $40-80/seat custom" },
  { id: "pr05", row: 11, col: 17, text: "Gov: FedRAMP tier (roadmap)" },
  { id: "pr06", row: 7, col: 20, text: "Add-on: Audit pack $10/seat" },
  { id: "pr07", row: 8, col: 20, text: "Add-on: Compliance pack ($ TBD)" },
  { id: "pr08", row: 9, col: 20, text: "Exp: self-hosted ent+ option" },

  // ── Core metrics ─────────────────────────────────────────────────────────
  { id: "k01", row: 7, col: 23, text: "MRR: $2.1M (Q2 end)" },
  { id: "k02", row: 8, col: 23, text: "Growth: +18% MoM (3-mo avg)" },
  { id: "k03", row: 9, col: 23, text: "NRR: ent 128% · SMB 93%" },
  { id: "k04", row: 10, col: 23, text: "CAC: $2.1K SMB · $38K ent" },
  { id: "k05", row: 11, col: 23, text: "Free→paid: 4.8% (target 8%)" },
  { id: "k06", row: 7, col: 26, text: "Churn: 4.2% SMB · 0.8% ent" },
  { id: "k07", row: 8, col: 26, text: "DAU/MAU: 0.41" },
  { id: "k08", row: 9, col: 26, text: "ARR/FTE: $40K (target $60K)" },
  { id: "k09", row: 10, col: 26, text: "Gross margin: 72% (target 80%)" },
  { id: "k10", row: 11, col: 26, text: "Payback: 14mo SMB · 9mo ent" },

  // ── Go-to-market ─────────────────────────────────────────────────────────
  { id: "s01", row: 14, col: 0, text: "ICP: Series B-D SaaS, 50-500 devs" },
  { id: "s02", row: 15, col: 0, text: "Beachhead: platform / DevEx teams" },
  { id: "s03", row: 16, col: 0, text: "Motion: PLG → sales-assist at 20 seats" },
  { id: "s04", row: 17, col: 0, text: "Sales cycle: 47 days avg (POC-heavy)" },
  { id: "s05", row: 14, col: 3, text: "Top win: Zendesk $480K ACV (3yr)" },
  { id: "s06", row: 15, col: 3, text: "Top loss: Shopify → Cursor (UX)" },
  { id: "s07", row: 16, col: 3, text: "Pipeline Q3: $14M weighted" },
  { id: "s08", row: 17, col: 3, text: "Team: 4 AE · 2 SE · 1 VP · 3 SDR" },
  { id: "s09", row: 14, col: 6, text: "Objection: model on their infra" },
  { id: "s10", row: 15, col: 6, text: "Objection: vs Copilot bundle" },
  { id: "s11", row: 16, col: 6, text: "Win rate: 31% (up from 19% Q1)" },

  // ── Content & community ──────────────────────────────────────────────────
  { id: "cm01", row: 14, col: 9, text: "Blog: 2×/week · 8K subscribers" },
  { id: "cm02", row: 15, col: 9, text: "Weekly demo video (avg 12K views)" },
  { id: "cm03", row: 16, col: 9, text: "Podcast guest rotation (biweekly)" },
  { id: "cm04", row: 17, col: 9, text: "Docs-as-landing SEO (top-3 refactor)" },
  { id: "cm05", row: 14, col: 12, text: "Discord: 4.2K · 7% DAU" },
  { id: "cm06", row: 15, col: 12, text: "GitHub stars: 2.1K (core repo)" },
  { id: "cm07", row: 16, col: 12, text: "HN front page 3× in Q2" },
  { id: "cm08", row: 17, col: 12, text: "Dev meetups seeded in 12 cities" },

  // ── Partnerships ─────────────────────────────────────────────────────────
  { id: "pt01", row: 14, col: 16, text: "GitHub: marketplace official" },
  { id: "pt02", row: 15, col: 16, text: "Datadog: logs→refactor demo" },
  { id: "pt03", row: 16, col: 16, text: "Replit: bundled free tier" },
  { id: "pt04", row: 17, col: 16, text: "AWS Marketplace (signing, Q3)" },
  { id: "pt05", row: 14, col: 19, text: "Anthropic: feature-flag access" },
  { id: "pt06", row: 15, col: 19, text: "Snowflake: data-warehouse connector" },
  { id: "pt07", row: 16, col: 19, text: "Linear: bidirectional sync" },

  // ── Hiring & team ────────────────────────────────────────────────────────
  { id: "h01", row: 14, col: 23, text: "Total HC: 52 (was 38 Q1)" },
  { id: "h02", row: 15, col: 23, text: "Mix: 32 eng · 12 GTM · 8 ops" },
  { id: "h03", row: 16, col: 23, text: "Open: VP Eng · 2 sr eng · 3 SE" },
  { id: "h04", row: 17, col: 23, text: "Plan: +15 in H2 (budget approved)" },
  { id: "h05", row: 14, col: 26, text: "Exec gap: VP Eng (6mo open)" },
  { id: "h06", row: 15, col: 26, text: "Talent competitors: Cursor, Anthropic" },
  { id: "h07", row: 16, col: 26, text: "Attrition: 4% YTD (industry 12%)" },

  // ── Risks ────────────────────────────────────────────────────────────────
  { id: "r01", row: 19, col: 0, text: "⚠ Cursor raised $1B, aggressive hiring" },
  { id: "r02", row: 20, col: 0, text: "⚠ MS bundles Copilot into M365" },
  { id: "r03", row: 21, col: 0, text: "⚠ EU AI Act audit reqs Feb 2026" },
  { id: "r04", row: 22, col: 0, text: "⚠ Foundation-model cost inflation" },
  { id: "r05", row: 23, col: 0, text: "⚠ OSS commoditizes core agent loop" },
  { id: "r06", row: 19, col: 3, text: "⚠ Anthropic ships Cursor-like product" },
  { id: "r07", row: 20, col: 3, text: "⚠ Security incident → kills ent deals" },
  { id: "r08", row: 21, col: 3, text: "⚠ CTO-elect poached to FAANG" },
  { id: "r09", row: 22, col: 3, text: "⚠ PLG ceiling: SMB churn > expansion" },
  { id: "r10", row: 23, col: 3, text: "⚠ Agent liability (wrong prod change)" },

  // ── Compliance & regulatory ──────────────────────────────────────────────
  { id: "cp01", row: 19, col: 6, text: "SOC2 Type II — audit starts Nov" },
  { id: "cp02", row: 20, col: 6, text: "ISO 27001 — Q1 next year target" },
  { id: "cp03", row: 21, col: 6, text: "EU AI Act classification pending" },
  { id: "cp04", row: 22, col: 6, text: "GDPR: DPA templated, 80% resolved" },
  { id: "cp05", row: 23, col: 6, text: "FedRAMP Moderate: $4M+ effort" },
  { id: "cp06", row: 19, col: 9, text: "Legal: OSS license audit clean" },
  { id: "cp07", row: 20, col: 9, text: "Model cards published quarterly" },
  { id: "cp08", row: 21, col: 9, text: "Contract: no customer code in training" },

  // ── Capital / finance ────────────────────────────────────────────────────
  { id: "cap01", row: 19, col: 12, text: "Cash: $38M (Q2 close)" },
  { id: "cap02", row: 20, col: 12, text: "Burn: $1.9M/mo gross" },
  { id: "cap03", row: 21, col: 12, text: "Runway: 20 months" },
  { id: "cap04", row: 22, col: 12, text: "Last round: Series A $22M (Sequoia)" },
  { id: "cap05", row: 23, col: 12, text: "Plan: Series B H1 ($80M)" },
  { id: "cap06", row: 19, col: 15, text: "Target valuation: $600M" },
  { id: "cap07", row: 20, col: 15, text: "Dilution cap: 15% Series B" },
  { id: "cap08", row: 21, col: 15, text: "Secondary offer on table" },

  // ── Q3 goals ─────────────────────────────────────────────────────────────
  { id: "q3_01", row: 26, col: 0, text: "Q3: Hit $3.2M MRR" },
  { id: "q3_02", row: 27, col: 0, text: "Q3: Land 3 Fortune 500 logos" },
  { id: "q3_03", row: 28, col: 0, text: "Q3: Ship agent mode to GA" },
  { id: "q3_04", row: 26, col: 3, text: "Q3: Close VP Eng hire" },
  { id: "q3_05", row: 27, col: 3, text: "Q3: p50 latency ≤ 1.2s" },
  { id: "q3_06", row: 28, col: 3, text: "Q3: Launch EU shard" },
  { id: "q3_07", row: 26, col: 6, text: "Q3: AWS Marketplace live" },
  { id: "q3_08", row: 27, col: 6, text: "Q3: Free→paid ≥ 6%" },
  { id: "q3_09", row: 28, col: 6, text: "Q3: Ship JetBrains v2" },

  // ── Q4 goals ─────────────────────────────────────────────────────────────
  { id: "q4_01", row: 26, col: 10, text: "Q4: $4.5M MRR" },
  { id: "q4_02", row: 27, col: 10, text: "Q4: 10 F500 logos, avg $1M ACV" },
  { id: "q4_03", row: 28, col: 10, text: "Q4: SOC2 Type II certified" },
  { id: "q4_04", row: 26, col: 13, text: "Q4: Series B TS signed" },
  { id: "q4_05", row: 27, col: 13, text: "Q4: Self-hosted GA (ent)" },
  { id: "q4_06", row: 28, col: 13, text: "Q4: NRR enterprise ≥ 135%" },
  { id: "q4_07", row: 26, col: 16, text: "Q4: Dev community 10K members" },
  { id: "q4_08", row: 27, col: 16, text: "Q4: PR review copilot GA" },
  { id: "q4_09", row: 28, col: 16, text: "Q4: CLI v2 (Claude Code style)" },

  // ── Open strategic questions ─────────────────────────────────────────────
  { id: "oq01", row: 25, col: 21, text: "Q: Sunset free tier or keep for TOFU?" },
  { id: "oq02", row: 26, col: 21, text: "Q: Build/buy/partner for sec-review?" },
  { id: "oq03", row: 27, col: 21, text: "Q: Enter Chinese market?" },
  { id: "oq04", row: 28, col: 21, text: "Q: Commit to MCP standard publicly?" },
  { id: "oq05", row: 29, col: 21, text: "Q: Open-source agent framework?" },
  { id: "oq06", row: 25, col: 24, text: "Q: Raise now or wait 6mo?" },
  { id: "oq07", row: 26, col: 24, text: "Q: Bet on 1M context or stay 200K?" },
  { id: "oq08", row: 27, col: 24, text: "Q: Hire CTO or promote internally?" },
  { id: "oq09", row: 28, col: 24, text: "Q: Acquire a DevOps tool?" },
  { id: "oq10", row: 29, col: 24, text: "Q: How to handle the Microsoft wedge?" },
  { id: "oq11", row: 25, col: 27, text: "Q: Double-down agents or co-pilot?" },
  { id: "oq12", row: 26, col: 27, text: "Q: Open-source model swap needed?" },
];

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;

export default function StrategyBoardPreview() {
  const [scale, setScale] = useState(0.38);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(40);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el!.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const delta = -e.deltaY * 0.0015;
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * (1 + delta)));
          const ratio = next / prev;
          setTx((ptx) => ox - ratio * (ox - ptx));
          setTy((pty) => oy - ratio * (oy - pty));
          return next;
        });
      } else {
        e.preventDefault();
        setTx((v) => v - e.deltaX);
        setTy((v) => v - e.deltaY);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-eg-interactive]")) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const s = dragState.current;
    if (!s) return;
    setTx(s.startTx + (e.clientX - s.startX));
    setTy(s.startTy + (e.clientY - s.startY));
  }
  function onPointerUp(e: ReactPointerEvent) {
    dragState.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "0") { setScale(0.38); setTx(40); setTy(40); }
      else if (e.key === "=" || e.key === "+") setScale((s) => Math.min(MAX_SCALE, s * 1.15));
      else if (e.key === "-" || e.key === "_") setScale((s) => Math.max(MIN_SCALE, s / 1.15));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="fixed inset-0 bg-surface overflow-hidden select-none">
      <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur rounded-lg ring-1 ring-border-soft px-4 py-3 max-w-md" data-eg-interactive>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Preview · strategy board · 30 × 30
        </div>
        <h1 className="text-base font-semibold text-ink-primary mt-0.5">
          Q3/Q4 planning — AI coding assistant company
        </h1>
        <p className="text-[11px] text-ink-muted mt-1">
          ~{STRATEGY_CELLS.length} cells across 19 thematic regions. Zoom in to read, pan to explore. Agent actions apply to the whole board — try <em>Form clusters</em>, <em>Group by theme</em>, <em>Prioritize</em>, <em>Add related ideas</em>. ⌘/Ctrl+scroll to zoom · 0 resets.
        </p>
      </div>

      <div className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur rounded-md ring-1 ring-border-soft px-2 py-1" data-eg-interactive>
        <span className="text-[11px] font-mono tabular-nums text-ink-secondary">
          {Math.round(scale * 100)}%
        </span>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          <div className="p-8" data-eg-interactive>
            <EditableGrid
              initialCells={STRATEGY_CELLS}
              initialConfig={{ cellW: 150, cellH: 70, gap: 16, cols: 30, rows: 30 }}
              structureHint="brainstorm-dump"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
