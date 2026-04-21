import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";
import type {
  ArchetypePipelineInput,
  ArchetypePipelineResult,
} from "@/lib/archetypes/types";
import {
  BUILD_CARTESIAN_TOOL_DESCRIPTION,
  BUILD_CARTESIAN_TOOL_NAME,
  buildCartesianToolSchema,
  validateCartesianDoc,
  type CartesianDoc,
} from "./schema";
import { buildCartesianSystemPrompt } from "./prompts";

export async function runCartesianPipeline(
  input: ArchetypePipelineInput
): Promise<ArchetypePipelineResult<CartesianDoc>> {
  const { description, preamble, sources, emit } = input;

  emit({ phase: "synthesizing" });
  const anthropic = getAnthropic();
  const userContent = buildUserContent(description, preamble, sources);

  const params = {
    model: getAgentModel(),
    max_tokens: 20000,
    // 16k thinking lets the agent reason through the 6-step scaffold in the
    // system prompt (5 candidate axis pairs → reject MBA answer → pick
    // domain-insider axes → pick specialists → place points → label).
    thinking: { type: "enabled", budget_tokens: 16000 },
    system: [
      {
        type: "text",
        text: buildCartesianSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: BUILD_CARTESIAN_TOOL_NAME,
        description: BUILD_CARTESIAN_TOOL_DESCRIPTION,
        input_schema: buildCartesianToolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    // tool_choice:"auto" — Anthropic's extended thinking is incompatible with
    // forced tool use. With a single tool available and a prompt that demands
    // its use, the model still reliably calls it.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userContent }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Cartesian plot: agent did not emit tool call");
  }

  const raw = tool.input as Partial<CartesianDoc>;
  const assembled: CartesianDoc = {
    id: `cartesian-${Date.now()}`,
    title: raw.title ?? "Cartesian plot",
    ...(raw.subject ? { subject: raw.subject } : {}),
    xAxis:
      raw.xAxis ??
      ({ label: "x", min: 0, max: 10 } as CartesianDoc["xAxis"]),
    yAxis:
      raw.yAxis ??
      ({ label: "y", min: 0, max: 10 } as CartesianDoc["yAxis"]),
    ...(raw.quadrants ? { quadrants: raw.quadrants } : {}),
    ...(raw.categories ? { categories: raw.categories } : {}),
    points: Array.isArray(raw.points) ? raw.points : [],
  };
  const validation = validateCartesianDoc(assembled);
  if (!validation.ok) {
    throw new Error(`Cartesian plot produced invalid doc: ${validation.reason}`);
  }

  const d = validation.doc;
  const summary = `Built "${d.title}" on ${d.xAxis.label} × ${d.yAxis.label} with ${d.points.length} point${d.points.length === 1 ? "" : "s"}.`;
  return {
    doc: d,
    summary,
    opsCount:
      d.points.length + (d.quadrants?.length ?? 0) + (d.categories?.length ?? 0),
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
      ? `User brief:\n\n${head}\n\nBuild the cartesian plot that best answers this.${sources.length ? " Source material follows:" : ""}`
      : "Build the cartesian plot that best fits the sources below.",
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
