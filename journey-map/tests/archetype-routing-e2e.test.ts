import { test } from "node:test";
import { strict as assert } from "node:assert";
import { classifyIntent } from "../lib/archetypes/classifier";

// ---------------------------------------------------------------------------
// Opt-in end-to-end routing test. Skipped unless ANTHROPIC_API_KEY is set.
// Runs a fixed corpus of 20 prompts past the real classifier and asserts
// that ≥ 90% are routed to the expected archetype (or to fallback for the
// deliberately-ambiguous cases).
//
// Run with:  ANTHROPIC_API_KEY=sk-... npm test
//
// These tests spend money. Don't land them in CI without a budget gate.
// ---------------------------------------------------------------------------

type Expectation = { prompt: string; expected: string | "fallback" };

const CORPUS: Expectation[] = [
  // journey-map (4)
  { prompt: "Map the onboarding journey for a new SaaS customer", expected: "journey-map" },
  { prompt: "Build a patient-enrollment journey from first symptoms to follow-up", expected: "journey-map" },
  { prompt: "Show the employee experience from offer through day 90", expected: "journey-map" },
  { prompt: "Walk through what a small-business owner does when applying for a loan", expected: "journey-map" },

  // table (4)
  { prompt: "List our top 20 enterprise deals with ARR and stage", expected: "table" },
  { prompt: "Build a roster of 30 mid-market CRMs with pricing and target segment", expected: "table" },
  { prompt: "Create an inventory of our open security findings with severity and owner", expected: "table" },
  { prompt: "Spreadsheet of all Q1 feature launches with ship date and owner", expected: "table" },

  // competitive-matrix (4)
  { prompt: "Compare Notion, Coda, and Airtable on 8 capabilities", expected: "competitive-matrix" },
  { prompt: "Build a feature matrix of enterprise CRMs with security, reporting, integrations, and pricing", expected: "competitive-matrix" },
  { prompt: "Vendor scorecard for observability tools — Datadog, New Relic, Honeycomb, Grafana", expected: "competitive-matrix" },
  { prompt: "How do the top 5 data warehouses stack up on governance, pricing model, and SQL dialect support?", expected: "competitive-matrix" },

  // cartesian (4)
  { prompt: "Plot our Q2 initiatives on effort vs impact with quadrant labels", expected: "cartesian" },
  { prompt: "Build a magic-quadrant-style view of enterprise data platforms", expected: "cartesian" },
  { prompt: "Show our roadmap items on a horizon plot, x = quarter, y = strategic pillar", expected: "cartesian" },
  { prompt: "2x2 of customer segments by willingness-to-pay and switching cost", expected: "cartesian" },

  // process-map (3)
  { prompt: "Draw the claims-review process across three teams — intake, triage, resolution", expected: "process-map" },
  { prompt: "Map our incident-response runbook — detection, escalation, mitigation, postmortem", expected: "process-map" },
  { prompt: "Service blueprint for a returns process — customer, agent, warehouse, finance", expected: "process-map" },

  // deliberately-ambiguous (1) — should fall back
  { prompt: "Help me think about our customer success strategy", expected: "fallback" },
];

const SKIP = !process.env.ANTHROPIC_API_KEY;

test(
  "routing-e2e: ≥ 90% of prompts route to the expected archetype",
  { skip: SKIP ? "ANTHROPIC_API_KEY not set — skipping end-to-end routing test" : false },
  async () => {
    const results: {
      prompt: string;
      expected: string;
      actual: string;
      topScore?: number;
    }[] = [];
    // Run sequentially to avoid rate limits; this test is not on the hot path.
    for (const c of CORPUS) {
      const r = await classifyIntent(c.prompt, 0.7);
      const actual =
        r.kind === "archetype" ? r.archetypeId : "fallback";
      results.push({
        prompt: c.prompt,
        expected: c.expected,
        actual,
        topScore: r.kind === "archetype" ? r.score : r.scores[0]?.score,
      });
    }

    const wrong = results.filter((r) => r.expected !== r.actual);
    const pct = ((CORPUS.length - wrong.length) / CORPUS.length) * 100;
    const verdict = `${CORPUS.length - wrong.length}/${CORPUS.length} correct (${pct.toFixed(0)}%)`;

    if (wrong.length > 0) {
      console.log(`[routing-e2e] ${verdict}. Mismatches:`);
      for (const w of wrong) {
        console.log(
          `  expected=${w.expected.padEnd(18)} actual=${w.actual.padEnd(18)} top=${w.topScore?.toFixed(2) ?? "-"} — "${w.prompt.slice(0, 60)}"`
        );
      }
    } else {
      console.log(`[routing-e2e] ${verdict}. No mismatches.`);
    }

    assert.ok(
      pct >= 90,
      `routing accuracy ${pct.toFixed(0)}% < 90% threshold`
    );
  }
);
