import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";
import type {
  ArchetypePipelineInput,
  ArchetypePipelineResult,
} from "@/lib/archetypes/types";
import {
  BUILD_PROCESS_MAP_TOOL_DESCRIPTION,
  BUILD_PROCESS_MAP_TOOL_NAME,
  buildProcessMapToolSchema,
  validateProcessMapDoc,
  type ProcessMapDoc,
} from "./schema";
import { buildProcessMapSystemPrompt } from "./prompts";

export async function runProcessMapPipeline(
  input: ArchetypePipelineInput
): Promise<ArchetypePipelineResult<ProcessMapDoc>> {
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
        text: buildProcessMapSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: BUILD_PROCESS_MAP_TOOL_NAME,
        description: BUILD_PROCESS_MAP_TOOL_DESCRIPTION,
        input_schema: buildProcessMapToolSchema,
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
    throw new Error("Process map: agent did not emit tool call");
  }

  const raw = tool.input as Partial<ProcessMapDoc>;
  const assembled: ProcessMapDoc = {
    id: `process-map-${Date.now()}`,
    title: raw.title ?? "Process map",
    ...(raw.subject ? { subject: raw.subject } : {}),
    lanes: Array.isArray(raw.lanes) ? raw.lanes : [],
    phases: Array.isArray(raw.phases) ? raw.phases : [],
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
  const validation = validateProcessMapDoc(assembled);
  if (!validation.ok) {
    throw new Error(`Process map produced invalid doc: ${validation.reason}`);
  }

  const d = validation.doc;
  const summary = `Built "${d.title}" — ${d.lanes.length} swimlane${d.lanes.length === 1 ? "" : "s"}, ${d.phases.length} phase${d.phases.length === 1 ? "" : "s"}, ${d.nodes.length} node${d.nodes.length === 1 ? "" : "s"}, ${d.edges.length} edge${d.edges.length === 1 ? "" : "s"}.`;
  return {
    doc: d,
    summary,
    opsCount:
      d.lanes.length + d.phases.length + d.nodes.length + d.edges.length,
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
      ? `User brief:\n\n${head}\n\nBuild the process map that best describes this flow.${sources.length ? " Source material follows:" : ""}`
      : "Build the process map that best fits the sources below.",
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
