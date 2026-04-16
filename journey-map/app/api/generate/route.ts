import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import { getFramework } from "@/lib/frameworks";
import {
  ingestSources,
  IngestionError,
  type IngestedSource,
  type RawInput,
} from "@/lib/ingestion";
import {
  generateFromDigestPrompt,
  generateFromSourcePrompt,
} from "@/lib/frameworks/journey-map/generate-prompt";
import { extractSystemPrompt } from "@/lib/frameworks/journey-map/extract-prompt";
import {
  digestSchema,
  DIGEST_TOOL_DESCRIPTION,
  DIGEST_TOOL_NAME,
  validateDigest,
  type Digest,
} from "@/lib/frameworks/journey-map/digest-schema";
import { subjectSystemPrompt } from "@/lib/frameworks/journey-map/subject-prompt";
import {
  mergeSubjectIds,
  renderSubjectContext,
  subjectSchema,
  SUBJECT_TOOL_DESCRIPTION,
  SUBJECT_TOOL_NAME,
  validateSubjectId,
  type SubjectId,
} from "@/lib/frameworks/journey-map/subject-schema";
import { critiqueSystemPrompt } from "@/lib/frameworks/journey-map/critique-prompt";
import {
  CRITIQUE_TOOL_DESCRIPTION,
  CRITIQUE_TOOL_NAME,
  critiqueSchema,
  needsRevision,
  renderCritiqueForRevision,
  validateCritique,
  type CritiqueResult,
} from "@/lib/frameworks/journey-map/critique-schema";
import { revisionSystemPrompt } from "@/lib/frameworks/journey-map/revision-prompt";
import { renderUserPayload } from "@/lib/frameworks/journey-map/payload";
import type { JourneyMap } from "@/lib/frameworks/journey-map/types";
import {
  encodeSseFrame,
  type GenerateDebug,
  type GenerateEvent,
} from "@/lib/frameworks/journey-map/generate-events";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOKEN_THRESHOLD_SINGLE_SHOT = 60_000;

type ParsedRequest = {
  frameworkId: string;
  title: string | null;
  persona: string | null;
  fidelityMode: boolean;
  inputs: RawInput[];
};

async function parseRequest(req: Request): Promise<ParsedRequest> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const frameworkId = (fd.get("frameworkId") as string | null) ?? "";
    const title = (fd.get("title") as string | null) ?? null;
    const persona = (fd.get("persona") as string | null) ?? null;
    const fidelityRaw = (fd.get("fidelityMode") as string | null) ?? "true";
    const fidelityMode = fidelityRaw !== "false" && fidelityRaw !== "0";

    const inputs: RawInput[] = [];

    const text = fd.get("text") as string | null;
    if (text && text.trim()) {
      inputs.push({ type: "paste", text, name: "Pasted notes" });
    }

    for (const [key, value] of fd.entries()) {
      if (
        value instanceof File &&
        value.size > 0 &&
        (key === "file" || /^file_\d+$/.test(key))
      ) {
        inputs.push({ type: "file", file: value, name: value.name });
      }
    }

    for (const [key, value] of fd.entries()) {
      if (
        typeof value === "string" &&
        value.trim() &&
        (key === "url" || /^url_\d+$/.test(key))
      ) {
        inputs.push({ type: "url", url: value.trim() });
      }
    }

    return { frameworkId, title, persona, fidelityMode, inputs };
  }

  const body = (await req.json()) as {
    frameworkId?: string;
    text?: string;
    title?: string;
    persona?: string;
    urls?: string[];
    fidelityMode?: boolean;
  };
  const inputs: RawInput[] = [];
  if (body.text && body.text.trim()) {
    inputs.push({ type: "paste", text: body.text });
  }
  if (Array.isArray(body.urls)) {
    for (const u of body.urls) {
      if (typeof u === "string" && u.trim())
        inputs.push({ type: "url", url: u });
    }
  }
  return {
    frameworkId: body.frameworkId ?? "",
    title: body.title ?? null,
    persona: body.persona ?? null,
    fidelityMode: body.fidelityMode !== false,
    inputs,
  };
}

function buildPreamble(title: string | null, persona: string | null): string {
  const hints: string[] = [];
  if (title?.trim()) hints.push(`Map title hint: ${title.trim()}`);
  if (persona?.trim()) hints.push(`Persona hint: ${persona.trim()}`);
  const hintBlock = hints.length ? hints.join("\n") + "\n\n" : "";
  return `${hintBlock}Map state: EMPTY (no stages, no rows, no cells)
ID sequence: first addStage → s1, s2, … | first addRow → r1, r2, …
Cells: createCell {rowId, stageId, text} — cell ids assigned automatically.
Ops apply left-to-right. Reference s1 in createCell immediately after addStage that creates s1.
Only addStage, addRow, createCell are valid for this empty-map build.`;
}

// Build the user content (a content-block array) for an agent call that needs
// to read a single source as either text or document block.
function buildSourceContentBlocks(
  source: IngestedSource,
  prefix: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
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
  } else {
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
      } else {
        content.push({
          type: "text",
          text: `\n--- ${s.name} ---\n${s.text}`,
        });
      }
    }
  }
  return content;
}

type SynthesisResult = {
  summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: any[];
};

async function runSynthesis(
  preamble: string,
  subject: SubjectId,
  sources: IngestedSource[],
  digests: Digest[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  framework: any
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
        name: framework.toolName,
        description: framework.toolDescription,
        input_schema: framework.toolSchema,
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
  const input = tool.input as { summary?: string; ops?: unknown };
  if (typeof input.summary !== "string" || !Array.isArray(input.ops)) {
    throw new Error("Synthesis agent tool input missing summary or ops array");
  }
  for (let i = 0; i < input.ops.length; i++) {
    if (!framework.validateOpShape(input.ops[i])) {
      throw new Error(
        `Synthesis agent emitted malformed op at index ${i}: ${JSON.stringify(input.ops[i])}`
      );
    }
  }
  return { summary: input.summary, ops: input.ops };
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
      } else {
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
  digests: Digest[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  framework: any
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
      } else {
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
        name: framework.toolName,
        description: framework.toolDescription,
        input_schema: framework.toolSchema,
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
  const input = tool.input as { summary?: string; ops?: unknown };
  if (typeof input.summary !== "string" || !Array.isArray(input.ops)) {
    throw new Error("Revision agent tool input missing summary or ops array");
  }
  for (let i = 0; i < input.ops.length; i++) {
    if (!framework.validateOpShape(input.ops[i])) {
      throw new Error(
        `Revision agent emitted malformed op at index ${i}: ${JSON.stringify(input.ops[i])}`
      );
    }
  }
  return { summary: input.summary, ops: input.ops };
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering if anything sits in front
    },
  });
}

function singleErrorStream(message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          encodeSseFrame({ phase: "error", message })
        )
      );
      controller.close();
    },
  });
  return sseResponse(stream);
}

export async function POST(req: Request) {
  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(req);
  } catch (e) {
    return singleErrorStream(`Invalid request: ${(e as Error).message}`);
  }

  const { frameworkId, title, persona, fidelityMode, inputs } = parsed;
  if (!frameworkId) {
    return singleErrorStream("frameworkId required");
  }

  let framework;
  try {
    framework = getFramework(frameworkId);
  } catch (e) {
    return singleErrorStream(
      e instanceof Error ? e.message : "Unknown framework"
    );
  }

  let sources: IngestedSource[];
  try {
    sources = await ingestSources(inputs);
  } catch (e) {
    if (e instanceof IngestionError) {
      return singleErrorStream(e.message);
    }
    return singleErrorStream(`Ingestion failed: ${(e as Error).message}`);
  }

  const totalTokens = sources.reduce((s, x) => s + x.estTokens, 0);
  const useTwoPass =
    sources.length > 1 || totalTokens > TOKEN_THRESHOLD_SINGLE_SHOT;

  const preamble = buildPreamble(title, persona);
  const emptyMap: JourneyMap = {
    id: `gen-${Date.now()}`,
    title: title?.trim() || "Untitled Journey",
    persona: persona?.trim() || "",
    stages: [],
    rows: [],
    cells: [],
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: GenerateEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSseFrame(event)));
        } catch {
          // Stream may be closed if client disconnected — best effort.
        }
      };

      try {
        send({ phase: "ingesting", sourcesCount: sources.length });

        // 1. Subject-ID per source, in parallel. Emit progress as each starts.
        send({
          phase: "subject_id",
          current: 1,
          total: sources.length,
          sourceLabel: sources[0].name,
        });
        const subjectIds = await Promise.all(
          sources.map((s, i) =>
            runSubjectId(s).then((id) => {
              if (i + 1 < sources.length) {
                send({
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

        // 2. Extraction per source (only in two-pass), in parallel.
        let digests: Digest[] | null = null;
        if (useTwoPass) {
          send({
            phase: "extracting",
            current: 1,
            total: sources.length,
            sourceLabel: sources[0].name,
          });
          digests = await Promise.all(
            sources.map((s, i) =>
              runExtraction(s, subjectIds[i]).then((d) => {
                if (i + 1 < sources.length) {
                  send({
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

        // 3. Synthesis.
        send({ phase: "synthesizing" });
        const synthesisResult = await runSynthesis(
          preamble,
          mergedSubject,
          sources,
          digests,
          framework
        );
        const applied = framework.applyOps(emptyMap, synthesisResult.ops);
        if (!applied.ok) {
          throw new Error(
            `Synthesis op sequence failed at index ${applied.failedAtIndex}: ${applied.reason}`
          );
        }
        const validation = framework.validateMap(applied.map);
        if (!validation.ok) {
          throw new Error(`Generated map invalid: ${validation.reason}`);
        }
        let finalMap: JourneyMap = validation.map;
        let finalSummary = synthesisResult.summary;
        let critiqueResult: CritiqueResult | null = null;
        let revisionRan = false;
        let revisionOpsCount: number | undefined;

        // 4. Critique (optional).
        if (fidelityMode) {
          send({ phase: "critiquing" });
          critiqueResult = await runCritique(
            finalMap,
            mergedSubject,
            sources,
            digests
          );
          // Echo the score so the client can show it.
          send({
            phase: "critiquing",
            fidelity_score: critiqueResult.fidelity_score,
          });

          if (needsRevision(critiqueResult)) {
            send({ phase: "revising", reason: critiqueResult.summary });
            const revisionResult = await runRevision(
              finalMap,
              mergedSubject,
              critiqueResult,
              sources,
              digests,
              framework
            );
            const revApplied = framework.applyOps(finalMap, revisionResult.ops);
            if (!revApplied.ok) {
              // If revision fails, fall back to the preliminary map rather than
              // erroring — partial progress is better than nothing.
              console.error(
                `[generate] revision failed at index ${revApplied.failedAtIndex}: ${revApplied.reason}`
              );
            } else {
              const revValidation = framework.validateMap(revApplied.map);
              if (revValidation.ok) {
                finalMap = revValidation.map;
                finalSummary = revisionResult.summary || finalSummary;
                revisionRan = true;
                revisionOpsCount = revisionResult.ops.length;
              }
            }
          }
        }

        const debug: GenerateDebug = {
          mode: useTwoPass ? "two-pass" : "single-shot",
          sourcesCount: sources.length,
          opsCount: synthesisResult.ops.length,
          fidelityMode,
          critiqueRan: critiqueResult !== null,
          revisionRan,
          ...(digests ? { digestsCount: digests.length } : {}),
          ...(critiqueResult
            ? { fidelityScore: critiqueResult.fidelity_score }
            : {}),
          ...(revisionOpsCount !== undefined ? { revisionOpsCount } : {}),
        };

        send({
          phase: "result",
          summary: finalSummary,
          map: finalMap,
          debug,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[generate] pipeline error:", message);
        send({ phase: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return sseResponse(stream);
}
