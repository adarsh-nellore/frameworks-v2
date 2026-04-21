import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";
import type {
  ArchetypePipelineInput,
  ArchetypePipelineResult,
} from "@/lib/archetypes/types";
import {
  BUILD_MATRIX_TOOL_DESCRIPTION,
  BUILD_MATRIX_TOOL_NAME,
  buildMatrixToolSchema,
  validateCompetitiveMatrixDoc,
  type CompetitiveMatrixDoc,
} from "./schema";
import { buildMatrixSystemPrompt } from "./prompts";

export async function runCompetitiveMatrixPipeline(
  input: ArchetypePipelineInput
): Promise<ArchetypePipelineResult<CompetitiveMatrixDoc>> {
  const { description, preamble, sources, emit } = input;

  emit({ phase: "synthesizing" });
  const anthropic = getAnthropic();
  const userContent = buildUserContent(description, preamble, sources);

  const params = {
    model: getAgentModel(),
    max_tokens: 20000,
    // 16k thinking so the agent can actually run the 6-step reasoning
    // scaffold (list 15 capability candidates → reject generics → keep only
    // those that separate → pick cell kinds → pick outlier competitors).
    thinking: { type: "enabled", budget_tokens: 16000 },
    system: [
      {
        type: "text",
        text: buildMatrixSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: BUILD_MATRIX_TOOL_NAME,
        description: BUILD_MATRIX_TOOL_DESCRIPTION,
        input_schema: buildMatrixToolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    // tool_choice:"auto" — extended thinking is incompatible with forced tool use.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userContent }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Competitive matrix: agent did not emit tool call");
  }

  const raw = tool.input as {
    title?: string;
    subject?: string;
    competitors?: unknown[];
    capabilities?: unknown[];
    cells?: unknown[];
  };
  const assembled: CompetitiveMatrixDoc = {
    id: `competitive-matrix-${Date.now()}`,
    title: raw.title ?? "Competitive matrix",
    ...(raw.subject ? { subject: raw.subject } : {}),
    competitors: Array.isArray(raw.competitors)
      ? (raw.competitors as CompetitiveMatrixDoc["competitors"])
      : [],
    capabilities: Array.isArray(raw.capabilities)
      ? (raw.capabilities as CompetitiveMatrixDoc["capabilities"])
      : [],
    cells: Array.isArray(raw.cells)
      ? (raw.cells as CompetitiveMatrixDoc["cells"])
      : [],
  };
  const validation = validateCompetitiveMatrixDoc(assembled);
  if (!validation.ok) {
    throw new Error(`Competitive matrix produced invalid doc: ${validation.reason}`);
  }

  const { competitors, capabilities, cells } = validation.doc;
  const summary = `Built "${validation.doc.title}" — ${competitors.length} competitor${competitors.length === 1 ? "" : "s"} × ${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"}, ${cells.length} cell${cells.length === 1 ? "" : "s"}.`;
  return {
    doc: validation.doc,
    summary,
    opsCount: competitors.length + capabilities.length + cells.length,
  };
}

function buildUserContent(
  description: string,
  preamble: string | null,
  sources: IngestedSource[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  const head = [preamble, description.trim()].filter(Boolean).join("\n\n");
  content.push({
    type: "text",
    text: head
      ? `User brief:\n\n${head}\n\nBuild the competitive matrix that best answers this.${sources.length ? " Source material follows:" : ""}`
      : "Build the competitive matrix that fits the sources below.",
  });
  for (const s of sources) {
    if (s.kind === "pdf") {
      content.push({
        type: "text",
        text: `\n--- ${s.name} (PDF, attached) ---`,
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
  return content;
}
