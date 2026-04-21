import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";

import {
  generateFromDigestPrompt,
  generateFromSourcePrompt,
} from "./generate-prompt";
import { extractSystemPrompt } from "./extract-prompt";
import {
  digestSchema,
  DIGEST_TOOL_DESCRIPTION,
  DIGEST_TOOL_NAME,
  validateDigest,
  type Digest,
} from "./digest-schema";
import { subjectSystemPrompt } from "./subject-prompt";
import {
  mergeSubjectIds,
  renderSubjectContext,
  subjectSchema,
  SUBJECT_TOOL_DESCRIPTION,
  SUBJECT_TOOL_NAME,
  validateSubjectId,
  type SubjectId,
} from "./subject-schema";
import { critiqueSystemPrompt } from "./critique-prompt";
import {
  CRITIQUE_TOOL_DESCRIPTION,
  CRITIQUE_TOOL_NAME,
  critiqueSchema,
  needsRevision,
  renderCritiqueForRevision,
  validateCritique,
  type CritiqueResult,
} from "./critique-schema";
import { revisionSystemPrompt } from "./revision-prompt";
import { renderUserPayload } from "./payload";
import type { JourneyMap } from "./types";
import { applyOps, validateOpShape, type Op } from "./ops";
import { toolName, toolDescription, toolSchema, validateMap } from "./schema";

import type {
  ArchetypePipelineInput,
  ArchetypePipelineResult,
} from "@/lib/archetypes/types";

// Single-pass threshold: below this, skip the per-source digest step and feed
// raw sources to the synthesis agent directly. Preserves old two-vs-one-pass
// heuristic from the pre-universal bespoke pipeline.
const TOKEN_THRESHOLD_SINGLE_SHOT = 60_000;

export async function runJourneyMapPipeline(
  input: ArchetypePipelineInput
): Promise<ArchetypePipelineResult<JourneyMap>> {
  const { description, preamble, sources, emit } = input;
  if (sources.length === 0) {
    throw new Error("Journey-map archetype requires at least one source");
  }

  const hints = extractHints(description, preamble);
  const emptyMap: JourneyMap = {
    id: `gen-${Date.now()}`,
    title: hints.title ?? "Untitled Journey",
    persona: hints.persona ?? "",
    stages: [],
    rows: [],
    cells: [],
  };
  const builtPreamble = buildPreamble(hints.title, hints.persona);

  const totalTokens = sources.reduce((s, x) => s + x.estTokens, 0);
  const useTwoPass =
    sources.length > 1 || totalTokens > TOKEN_THRESHOLD_SINGLE_SHOT;
  const fidelityMode = hints.fidelityMode;

  // 1. Subject-ID per source
  emit({
    phase: "subject_id",
    current: 1,
    total: sources.length,
    sourceLabel: sources[0].name,
  });
  const subjectIds = await Promise.all(
    sources.map((s, i) =>
      runSubjectId(s).then((id) => {
        if (i + 1 < sources.length) {
          emit({
            phase: "subject_id",
            current: i + 2,
            total: sources.length,
            sourceLabel: sources[i + 1]?.name ?? "",
          });
        }
        return id;
      })
    )
  );
  const mergedSubject = mergeSubjectIds(subjectIds);

  // 2. Extraction (two-pass only)
  let digests: Digest[] | null = null;
  if (useTwoPass) {
    emit({
      phase: "extracting",
      current: 1,
      total: sources.length,
      sourceLabel: sources[0].name,
    });
    digests = await Promise.all(
      sources.map((s, i) =>
        runExtraction(s, subjectIds[i]).then((d) => {
          if (i + 1 < sources.length) {
            emit({
              phase: "extracting",
              current: i + 2,
              total: sources.length,
              sourceLabel: sources[i + 1]?.name ?? "",
            });
          }
          return d;
        })
      )
    );
  }

  // 3. Synthesis
  emit({ phase: "synthesizing" });
  const synthesis = await runSynthesis(
    builtPreamble,
    mergedSubject,
    sources,
    digests
  );
  const applied = applyOps(emptyMap, synthesis.ops);
  if (!applied.ok) {
    throw new Error(
      `Synthesis op sequence failed at index ${applied.failedAtIndex}: ${applied.reason}`
    );
  }
  const preValidation = validateMap(applied.map);
  if (!preValidation.ok) {
    throw new Error(`Generated map invalid: ${preValidation.reason}`);
  }
  let finalMap: JourneyMap = preValidation.map;
  let finalSummary = synthesis.summary;
  let opsCount = synthesis.ops.length;

  // 4. Critique + revision (optional)
  if (fidelityMode) {
    emit({ phase: "critiquing" });
    const critique = await runCritique(
      finalMap,
      mergedSubject,
      sources,
      digests
    );
    emit({ phase: "critiquing", fidelity_score: critique.fidelity_score });

    if (needsRevision(critique)) {
      emit({ phase: "revising", reason: critique.summary });
      const revision = await runRevision(
        finalMap,
        mergedSubject,
        critique,
        sources,
        digests
      );
      const revApplied = applyOps(finalMap, revision.ops);
      if (revApplied.ok) {
        const revValidation = validateMap(revApplied.map);
        if (revValidation.ok) {
          finalMap = revValidation.map;
          finalSummary = revision.summary || finalSummary;
          opsCount += revision.ops.length;
        }
      } else {
        console.error(
          `[journey-map pipeline] revision ops failed at ${revApplied.failedAtIndex}: ${revApplied.reason}`
        );
      }
    }
  }

  return { doc: finalMap, summary: finalSummary, opsCount };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

type DescriptionHints = {
  title: string | null;
  persona: string | null;
  fidelityMode: boolean;
};

// Description/preamble carry optional "Title hint: X" / "Persona hint: Y" lines
// produced upstream. Pull them out so the renderer and subject prompt get
// grounded hints even when the user didn't send a structured body.
function extractHints(
  description: string,
  preamble: string | null
): DescriptionHints {
  const text = [description, preamble ?? ""].filter(Boolean).join("\n");
  const titleMatch = text.match(/Title hint:\s*(.+)/i);
  const personaMatch = text.match(/Persona hint:\s*(.+)/i);
  return {
    title: titleMatch?.[1]?.trim() || null,
    persona: personaMatch?.[1]?.trim() || null,
    fidelityMode: true,
  };
}

function buildPreamble(
  title: string | null,
  persona: string | null
): string {
  const hintLines: string[] = [];
  if (title) hintLines.push(`Map title hint: ${title}`);
  if (persona) hintLines.push(`Persona hint: ${persona}`);
  const hintBlock = hintLines.length ? `${hintLines.join("\n")}\n\n` : "";
  return `${hintBlock}Map state: EMPTY (no stages, no rows, no cells)
ID sequence: first addStage → s1, s2, … | first addRow → r1, r2, …
Cells: createCell {rowId, stageId, text} — cell ids assigned automatically.
Ops apply left-to-right. Reference s1 in createCell immediately after addStage that creates s1.
Only addStage, addRow, createCell are valid for this empty-map build.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSourceContentBlocks(source: IngestedSource, prefix: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [{ type: "text", text: prefix }];
  if (source.kind === "pdf") {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: source.pdfBase64,
      },
    });
  } else if (source.kind === "text") {
    content.push({
      type: "text",
      text: `\n--- ${source.name} ---\n${source.text}`,
    });
  }
  return content;
}

async function runSubjectId(source: IngestedSource): Promise<SubjectId> {
  const anthropic = getAnthropic();
  const content = buildSourceContentBlocks(
    source,
    `Source label: ${source.name}\n\nRead the source ${source.kind === "pdf" ? "PDF (attached below)" : "text below"} and emit a subject identification via the identify_subject tool.`
  );
  const params = {
    model: getAgentModel(),
    max_tokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: [
      {
        type: "text",
        text: subjectSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: SUBJECT_TOOL_NAME,
        description: SUBJECT_TOOL_DESCRIPTION,
        input_schema: subjectSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error(
      `Subject-id agent did not return a tool call for "${source.name}"`
    );
  }
  const validation = validateSubjectId(tool.input);
  if (!validation.ok) {
    throw new Error(
      `Subject-id agent returned invalid output for "${source.name}": ${validation.reason}`
    );
  }
  return validation.subject;
}

async function runExtraction(
  source: IngestedSource,
  subject: SubjectId
): Promise<Digest> {
  const anthropic = getAnthropic();
  const subjectBlock = renderSubjectContext(subject);
  const content = buildSourceContentBlocks(
    source,
    `${subjectBlock}\n\nSource label: ${source.name}\n\nRead the source ${source.kind === "pdf" ? "PDF (attached below)" : "text below"} and emit a digest via the emit_digest tool. Anchor your extraction to the Subject context above — extract for the SUBJECT'S journey, not the source's surface narrative.`
  );

  const params = {
    model: getAgentModel(),
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: [
      {
        type: "text",
        text: extractSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: DIGEST_TOOL_NAME,
        description: DIGEST_TOOL_DESCRIPTION,
        input_schema: digestSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error(
      `Extraction agent did not return a tool call for "${source.name}"`
    );
  }
  const validation = validateDigest(tool.input);
  if (!validation.ok) {
    throw new Error(
      `Extraction agent returned invalid digest for "${source.name}": ${validation.reason}`
    );
  }
  return validation.digest;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSynthesisContent(
  preamble: string,
  subject: SubjectId,
  sources: IngestedSource[],
  digests: Digest[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  const subjectBlock = renderSubjectContext(subject);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    {
      type: "text",
      text: `${subjectBlock}\n\n${preamble}\n\n${digests ? "Research digests follow:" : "Source material follows:"}`,
    },
  ];
  if (digests) {
    const block = digests
      .map(
        (d) =>
          `\n--- Digest: ${d.source_label} ---\n${JSON.stringify(d, null, 2)}`
      )
      .join("\n");
    content.push({ type: "text", text: block });
  } else {
    for (const s of sources) {
      if (s.kind === "pdf") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} (PDF, attached as document) ---`,
        });
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: s.pdfBase64,
          },
        });
      } else if (s.kind === "text") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} ---\n${s.text}`,
        });
      }
    }
  }
  return content;
}

type SynthesisResult = { summary: string; ops: Op[] };

async function runSynthesis(
  preamble: string,
  subject: SubjectId,
  sources: IngestedSource[],
  digests: Digest[] | null
): Promise<SynthesisResult> {
  const anthropic = getAnthropic();
  const systemPrompt = digests
    ? generateFromDigestPrompt
    : generateFromSourcePrompt;
  const content = buildSynthesisContent(preamble, subject, sources, digests);

  const params = {
    model: getAgentModel(),
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 8000 },
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: toolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Synthesis agent did not return a tool call");
  }
  const toolInput = tool.input as { summary?: string; ops?: unknown };
  if (typeof toolInput.summary !== "string" || !Array.isArray(toolInput.ops)) {
    throw new Error("Synthesis agent tool input missing summary or ops array");
  }
  const ops: Op[] = [];
  for (let i = 0; i < toolInput.ops.length; i++) {
    const o = toolInput.ops[i];
    if (!validateOpShape(o)) {
      throw new Error(
        `Synthesis agent emitted malformed op at index ${i}: ${JSON.stringify(o)}`
      );
    }
    ops.push(o as Op);
  }
  return { summary: toolInput.summary, ops };
}

async function runCritique(
  preliminaryMap: JourneyMap,
  subject: SubjectId,
  sources: IngestedSource[],
  digests: Digest[] | null
): Promise<CritiqueResult> {
  const anthropic = getAnthropic();
  const subjectBlock = renderSubjectContext(subject);
  const mapDsl = renderUserPayload(
    preliminaryMap,
    "Review this map for fidelity to the subject and source. Emit critique via critique_map."
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    {
      type: "text",
      text: `${subjectBlock}\n\nGenerated map (DSL):\n\n${mapDsl}\n\n${digests ? "Source digests follow:" : "Original source material follows:"}`,
    },
  ];
  if (digests) {
    content.push({
      type: "text",
      text: digests
        .map(
          (d) =>
            `\n--- Digest: ${d.source_label} ---\n${JSON.stringify(d, null, 2)}`
        )
        .join("\n"),
    });
  } else {
    for (const s of sources) {
      if (s.kind === "pdf") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} (PDF) ---`,
        });
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: s.pdfBase64,
          },
        });
      } else if (s.kind === "text") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} ---\n${s.text}`,
        });
      }
    }
  }

  const params = {
    model: getAgentModel(),
    max_tokens: 6000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: [
      {
        type: "text",
        text: critiqueSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: CRITIQUE_TOOL_NAME,
        description: CRITIQUE_TOOL_DESCRIPTION,
        input_schema: critiqueSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Critique agent did not return a tool call");
  }
  const validation = validateCritique(tool.input);
  if (!validation.ok) {
    throw new Error(`Critique agent returned invalid critique: ${validation.reason}`);
  }
  return validation.critique;
}

async function runRevision(
  preliminaryMap: JourneyMap,
  subject: SubjectId,
  critique: CritiqueResult,
  sources: IngestedSource[],
  digests: Digest[] | null
): Promise<SynthesisResult> {
  const anthropic = getAnthropic();
  const subjectBlock = renderSubjectContext(subject);
  const mapDsl = renderUserPayload(
    preliminaryMap,
    "Revise per the critique below. Emit ops via apply_operations."
  );
  const critiqueBlock = renderCritiqueForRevision(critique);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    {
      type: "text",
      text: `${subjectBlock}\n\nPreliminary map (DSL):\n\n${mapDsl}\n\n${critiqueBlock}\n\n${digests ? "Source digests follow:" : "Original source material follows:"}`,
    },
  ];
  if (digests) {
    content.push({
      type: "text",
      text: digests
        .map(
          (d) =>
            `\n--- Digest: ${d.source_label} ---\n${JSON.stringify(d, null, 2)}`
        )
        .join("\n"),
    });
  } else {
    for (const s of sources) {
      if (s.kind === "pdf") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} (PDF) ---`,
        });
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: s.pdfBase64,
          },
        });
      } else if (s.kind === "text") {
        content.push({
          type: "text",
          text: `\n--- ${s.name} ---\n${s.text}`,
        });
      }
    }
  }

  const params = {
    model: getAgentModel(),
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 6000 },
    system: [
      {
        type: "text",
        text: revisionSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: toolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Revision agent did not return a tool call");
  }
  const toolInput = tool.input as { summary?: string; ops?: unknown };
  if (typeof toolInput.summary !== "string" || !Array.isArray(toolInput.ops)) {
    throw new Error("Revision agent tool input missing summary or ops array");
  }
  const ops: Op[] = [];
  for (let i = 0; i < toolInput.ops.length; i++) {
    const o = toolInput.ops[i];
    if (!validateOpShape(o)) {
      throw new Error(
        `Revision agent emitted malformed op at index ${i}: ${JSON.stringify(o)}`
      );
    }
    ops.push(o as Op);
  }
  return { summary: toolInput.summary, ops };
}
