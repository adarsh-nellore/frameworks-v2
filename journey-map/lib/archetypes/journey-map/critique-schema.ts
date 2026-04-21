// Tool schema for the critique agent. The agent reviews a generated map
// against its source and the agreed subject, scores fidelity 0-10, and
// flags specific issues with severity. The orchestrator decides whether to
// trigger a revision pass based on the verdict + score + critical issues.

export const CRITIQUE_TOOL_NAME = "critique_map";
export const CRITIQUE_TOOL_DESCRIPTION =
  "Emit a structured critique of the generated journey map. Score fidelity 0-10 and list specific issues with severity. Do not rewrite — only flag.";

export const ISSUE_TYPES = [
  "wrong_subject",
  "missing_scope",
  "missing_phase",
  "redundant_phase",
  "vague_cells",
  "wrong_lane_kinds",
  "drifted_content",
] as const;

export const SEVERITIES = ["critical", "major", "minor"] as const;
export const VERDICTS = ["pass", "needs_revision", "fail"] as const;

export const critiqueSchema = {
  type: "object",
  properties: {
    fidelity_score: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Overall fidelity score. 10 = perfect; 7 = passing (covers breadth, specific cells, right subject); 5 = needs revision (drift or gaps); <3 = fundamentally wrong.",
    },
    verdict: {
      type: "string",
      enum: VERDICTS as unknown as string[],
      description:
        "pass: no revision needed. needs_revision: targeted fixes will salvage. fail: substantial rebuild required (e.g. wrong subject).",
    },
    issues: {
      type: "array",
      description:
        "Specific issues found in the map. Each issue includes a type, severity, what's wrong, and a suggested fix in natural language. Empty array if the map is perfect.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ISSUE_TYPES as unknown as string[],
            description:
              "wrong_subject: built journey of the wrong thing (e.g. interview meta instead of interviewee's work). missing_scope: map too small for source density. missing_phase: a clear phase from the source isn't represented. redundant_phase: phases that should merge. vague_cells: generic labels instead of source-specific content. wrong_lane_kinds: kinds chosen don't match what the source actually has signal on. drifted_content: cell text not traceable to source.",
          },
          severity: {
            type: "string",
            enum: SEVERITIES as unknown as string[],
            description:
              "critical: blocks usability or fundamentally misrepresents subject. major: significantly weakens the artifact. minor: polish-level.",
          },
          detail: {
            type: "string",
            description:
              "Specific description of the issue. Reference cell coords, stage labels, or row labels where applicable.",
          },
          suggested_fix: {
            type: "string",
            description:
              "Natural-language description of what to do. The revision agent will translate this into ops.",
          },
        },
        required: ["type", "severity", "detail", "suggested_fix"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "string",
      description:
        "1-2 sentence verdict for humans. E.g. 'Map captures the regulatory workflow well but misses the ROW guidance pain point and underuses available phase scope.'",
    },
  },
  required: ["fidelity_score", "verdict", "issues", "summary"],
  additionalProperties: false,
} as const;

export type IssueType = (typeof ISSUE_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Verdict = (typeof VERDICTS)[number];

export type CritiqueIssue = {
  type: IssueType;
  severity: Severity;
  detail: string;
  suggested_fix: string;
};

export type CritiqueResult = {
  fidelity_score: number;
  verdict: Verdict;
  issues: CritiqueIssue[];
  summary: string;
};

export function validateCritique(
  u: unknown
): { ok: true; critique: CritiqueResult } | { ok: false; reason: string } {
  if (typeof u !== "object" || u === null) {
    return { ok: false, reason: "critique must be an object" };
  }
  const o = u as Record<string, unknown>;
  if (
    typeof o.fidelity_score !== "number" ||
    o.fidelity_score < 0 ||
    o.fidelity_score > 10
  ) {
    return { ok: false, reason: "fidelity_score must be integer 0-10" };
  }
  if (
    typeof o.verdict !== "string" ||
    !VERDICTS.includes(o.verdict as Verdict)
  ) {
    return { ok: false, reason: "invalid verdict" };
  }
  if (!Array.isArray(o.issues)) {
    return { ok: false, reason: "issues must be an array" };
  }
  for (let i = 0; i < o.issues.length; i++) {
    const issue = o.issues[i] as Record<string, unknown>;
    if (
      typeof issue?.type !== "string" ||
      !ISSUE_TYPES.includes(issue.type as IssueType)
    ) {
      return { ok: false, reason: `issues[${i}].type invalid` };
    }
    if (
      typeof issue.severity !== "string" ||
      !SEVERITIES.includes(issue.severity as Severity)
    ) {
      return { ok: false, reason: `issues[${i}].severity invalid` };
    }
    if (typeof issue.detail !== "string") {
      return { ok: false, reason: `issues[${i}].detail must be string` };
    }
    if (typeof issue.suggested_fix !== "string") {
      return { ok: false, reason: `issues[${i}].suggested_fix must be string` };
    }
  }
  if (typeof o.summary !== "string") {
    return { ok: false, reason: "summary must be string" };
  }
  return { ok: true, critique: o as unknown as CritiqueResult };
}

/** Decide whether revision is needed. */
export function needsRevision(c: CritiqueResult): boolean {
  if (c.verdict !== "pass") return true;
  if (c.fidelity_score < 7) return true;
  if (c.issues.some((i) => i.severity === "critical")) return true;
  return false;
}

/** Render critique as a compact natural-language block for the revision agent. */
export function renderCritiqueForRevision(c: CritiqueResult): string {
  const header = `Critique result: ${c.verdict.toUpperCase()} (fidelity ${c.fidelity_score}/10) — ${c.summary}`;
  if (c.issues.length === 0) {
    return `${header}\n\nNo specific issues to fix.`;
  }
  const issuesByPriority = [...c.issues].sort((a, b) => {
    const rank = (s: Severity) =>
      s === "critical" ? 0 : s === "major" ? 1 : 2;
    return rank(a.severity) - rank(b.severity);
  });
  const lines = issuesByPriority.map((iss, i) => {
    return [
      `${i + 1}. [${iss.severity.toUpperCase()} · ${iss.type}]`,
      `   issue:    ${iss.detail}`,
      `   fix:      ${iss.suggested_fix}`,
    ].join("\n");
  });
  return `${header}\n\nIssues to address (in priority order):\n${lines.join("\n\n")}`;
}
