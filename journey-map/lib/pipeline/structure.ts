import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import {
  applyOps,
  toolDescription,
  toolName,
  toolSchema,
  universalSystemPrompt,
  validateMap,
  validateOpShape,
  type UniversalMap,
  type FrameworkConfig,
} from "@/lib/frameworks/universal";
import { renderAtomsForStructuring, type SourceAtoms } from "./extract-atoms";

// ---------------------------------------------------------------------------
// Stage 2 — Framework Structuring
// Takes pre-extracted atoms (from Stage 1) and the framework's config,
// emits ops that build a populated UniversalMap from an empty seed.
// ---------------------------------------------------------------------------

export type StructureResult = {
  summary: string;
  map: UniversalMap;
  opsCount: number;
};

function emptyMap(config: FrameworkConfig): UniversalMap {
  // Start from the framework's seed but clear the cards.
  // Cols and rows are kept (they encode the framework's structure).
  const seed = config.seed;
  return {
    id: "generated",
    title: seed.title,
    meta: {},
    cols: seed.cols.map((c) => ({ ...c })),
    rows: seed.rows.map((r) => ({ ...r })),
    cards: [],
  };
}

const STRUCTURING_BASE_PROMPT = `
You are organizing extracted research atoms into a structured framework map.

The atoms have already been extracted from source material — you are NOT reading documents. Your job is to organize what you've been given into the framework structure.

## Approach

1. **Read all atoms first.** Get the full picture before organizing.
2. **Identify the structure.** Decide what cols (e.g., journey stages, JTBD sections, themes) and rows (e.g., swim lanes, card types) best fit the data. If the framework has fixed cols/rows, use them as-is.
3. **Place atoms into cards.** Each meaningful atom typically becomes one card. Multiple related atoms may sometimes be combined if they describe the same point — but err toward keeping atoms atomic.
4. **Use rich text.** Apply \`**bold**\` for the load-bearing word/phrase and \`==highlight==\` for specific numbers, names, or quoted phrases.
5. **Set hero meta.** Use \`setMapMeta\` to populate framework-specific top-level fields (persona, coreJobStatement, axis labels, etc.).

## Starting state

The map starts with the framework's default cols and rows but ZERO cards. You may:
- For frameworks with \`fixedCols\` or \`fixedRows\`: Use the provided structure as-is. Do not add or remove.
- For other frameworks: Rename, reorder, add, or remove cols/rows as the data demands.

## Op grammar

You have all 14 universal ops available. Common patterns:
- Add a card: \`{ "op": "addCard", "colId": "c1", "rowId": "r1", "text": "..." }\`
- Add a card with priority: \`{ "op": "addCard", "colId": "c1", "rowId": "r0", "text": "...", "meta": { "priority": "high" } }\`
- Set hero meta: \`{ "op": "setMapMeta", "key": "persona", "value": "..." }\`
- Add a new col: \`{ "op": "addCol", "label": "...", "kind": "..." }\`
- Rename existing col: \`{ "op": "renameCol", "colId": "c1", "label": "..." }\`

## Output

Emit a single \`apply_operations\` tool call with:
- \`summary\`: A 1-2 sentence description of what you built and why
- \`ops\`: The ordered list of operations
`.trim();

export async function structureMap(
  atoms: SourceAtoms[],
  config: FrameworkConfig,
  preamble?: string
): Promise<StructureResult> {
  const start = emptyMap(config);

  const systemPrompt = `${universalSystemPrompt}\n\n## Structuring Phase\n\n${STRUCTURING_BASE_PROMPT}\n\n## This Framework\n\n${config.structuringPrompt}`;

  const userText = [
    preamble ?? "",
    `Framework: ${config.label}`,
    `Layout: ${config.layout}`,
    `Vocabulary: cols are "${config.colNoun}", rows are "${config.rowNoun}", cards are "${config.cardNoun}".`,
    config.fixedCols ? `Cols are FIXED — do not add or remove.` : `Cols are flexible — add/remove as needed.`,
    config.fixedRows ? `Rows are FIXED — do not add or remove.` : `Rows are flexible — add/remove as needed.`,
    "",
    `Default cols (you may rename, reorder, or extend):`,
    ...start.cols.map(
      (c, i) =>
        `  ${String.fromCharCode(65 + i)}  id=${c.id}  label=${JSON.stringify(c.label)}  kind=${c.kind ?? "neutral"}`
    ),
    "",
    `Default rows (you may rename, reorder, or extend):`,
    ...start.rows.map(
      (r, i) =>
        `  ${i + 1}  id=${r.id}  label=${JSON.stringify(r.label)}  kind=${r.kind ?? "neutral"}`
    ),
    "",
    renderAtomsForStructuring(atoms),
    "",
    "Now emit the apply_operations tool call to populate the map.",
  ]
    .filter(Boolean)
    .join("\n");

  const anthropic = getAnthropic();
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
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Structuring agent did not return a tool call");
  }
  const input = tool.input as { summary?: string; ops?: unknown };
  if (typeof input.summary !== "string" || !Array.isArray(input.ops)) {
    throw new Error("Structuring agent did not return summary + ops");
  }

  for (let i = 0; i < input.ops.length; i++) {
    if (!validateOpShape(input.ops[i])) {
      throw new Error(`Structuring agent emitted malformed op at index ${i}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applied = applyOps(start, input.ops as any[]);
  if (!applied.ok) {
    throw new Error(
      `Structuring ops failed at index ${applied.failedAtIndex}: ${applied.reason}`
    );
  }

  const validated = validateMap(applied.map);
  if (!validated.ok) {
    throw new Error(`Structured map invalid: ${validated.reason}`);
  }

  return {
    summary: input.summary,
    map: validated.map,
    opsCount: input.ops.length,
  };
}
