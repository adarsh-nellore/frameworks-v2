import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";
import type {
  ArchetypePipelineInput,
  ArchetypePipelineResult,
} from "@/lib/archetypes/types";
import {
  BUILD_TABLE_TOOL_DESCRIPTION,
  BUILD_TABLE_TOOL_NAME,
  buildTableToolSchema,
  validateTableDoc,
  type TableDoc,
} from "./schema";
import { buildTableSystemPrompt } from "./prompts";

export async function runTablePipeline(
  input: ArchetypePipelineInput
): Promise<ArchetypePipelineResult<TableDoc>> {
  const { description, preamble, sources, emit } = input;

  emit({ phase: "synthesizing" });
  const anthropic = getAnthropic();
  const userContent = buildUserContent(description, preamble, sources);

  const params = {
    model: getAgentModel(),
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 6000 },
    system: [
      {
        type: "text",
        text: buildTableSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: BUILD_TABLE_TOOL_NAME,
        description: BUILD_TABLE_TOOL_DESCRIPTION,
        input_schema: buildTableToolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: BUILD_TABLE_TOOL_NAME },
    messages: [{ role: "user", content: userContent }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Table archetype: agent did not emit build_table tool call");
  }

  const raw = tool.input as {
    title?: string;
    subtitle?: string;
    columns?: unknown[];
    rows?: unknown[];
  };
  const assembled: TableDoc = {
    id: `table-${Date.now()}`,
    title: raw.title ?? "Untitled table",
    ...(raw.subtitle ? { subtitle: raw.subtitle } : {}),
    columns: Array.isArray(raw.columns)
      ? (raw.columns as TableDoc["columns"])
      : [],
    rows: Array.isArray(raw.rows) ? (raw.rows as TableDoc["rows"]) : [],
  };
  const validation = validateTableDoc(assembled);
  if (!validation.ok) {
    throw new Error(`Table archetype produced invalid doc: ${validation.reason}`);
  }

  const summary = buildSummary(validation.doc);
  const opsCount = validation.doc.columns.length + validation.doc.rows.length;
  return { doc: validation.doc, summary, opsCount };
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
      ? `User brief:\n\n${head}\n\nBuild the table that answers this brief.${sources.length ? " Source material follows:" : ""}`
      : "Build the table that best fits the sources below.",
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

function buildSummary(doc: TableDoc): string {
  const colCount = doc.columns.length;
  const rowCount = doc.rows.length;
  return `Built "${doc.title}" — ${colCount} column${colCount === 1 ? "" : "s"} × ${rowCount} row${rowCount === 1 ? "" : "s"}.`;
}
