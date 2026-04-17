import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import type { IngestedSource } from "@/lib/ingestion";

// ---------------------------------------------------------------------------
// Stage 1 — Universal Extraction
// Reads each source ONCE and emits a flat list of atomic units.
// Atoms are framework-agnostic and can be re-organized into any framework
// (journey map, JTBD canvas, affinity diagram, etc.) without re-reading.
// ---------------------------------------------------------------------------

export type AtomType = "observation" | "quote" | "insight" | "need" | "fact";

export type Atom = {
  type: AtomType;
  text: string;
  /** Optional source attribution (participant role, page number, section, etc.) */
  source?: string;
};

export type SourceAtoms = {
  sourceLabel: string;
  atoms: Atom[];
};

const TOOL_NAME = "extract_atoms";

const TOOL_DESCRIPTION = `Extract every meaningful atomic insight from the source material.
An atom is one of:
- observation — a behavioral fact or pattern observed in the source
- quote       — a verbatim or near-verbatim participant statement (preserve quotation marks)
- insight     — an interpreted "so what" or pattern (goes beyond what was directly observed)
- need        — an expressed or latent need, framed as "need to X"
- fact        — a numeric value, named entity, or specific reference

Be exhaustive. Do not summarize — atomize. One idea per atom. Preserve specificity (numbers, names, quoted language).`;

const TOOL_SCHEMA = {
  type: "object",
  required: ["atoms"],
  additionalProperties: false,
  properties: {
    atoms: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["type", "text"],
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["observation", "quote", "insight", "need", "fact"],
          },
          text: { type: "string", minLength: 1 },
          source: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `
You are a research synthesis specialist. Your job is to read source material (interview transcripts, research notes, persona briefs, competitive intel, anything) and extract every meaningful atomic insight.

## What to extract

Each atom is one of:
- **observation** — a behavioral fact or pattern observed (e.g. "Users open the app 4-5 times per day")
- **quote** — a verbatim or near-verbatim participant statement, in "double quotes"
- **insight** — an interpreted pattern or "so what" — goes beyond observation (e.g. "Users treat the inbox as a to-do list, not a comm channel")
- **need** — an expressed or latent need, framed as "need to X" (e.g. "Need to triage 200+ emails in under 15 minutes")
- **fact** — a numeric value, named entity, or specific reference (e.g. "FDA publishes 300+ guidance docs per year")

## Atomization rules

- **One idea per atom.** Do not combine two distinct points.
- **Preserve specificity.** Keep numbers, names, product references, exact quotes intact.
- **Preserve voice.** For quotes, keep the participant's phrasing. Do not paraphrase.
- **Do not interpret quotes as observations.** A quote is what they said. An observation is what they did. An insight is what it means.
- **Be exhaustive.** A 30-minute interview transcript should yield 30-100+ atoms. A short brief might yield 10. Err on the side of more.
- **Source attribution is encouraged.** If you can identify a participant role, page number, or section, include it in the optional \`source\` field.

## What NOT to do

- Don't write structural summaries ("Section 1 covered…")
- Don't merge two ideas into one atom
- Don't rephrase quotes — preserve them
- Don't skip "obvious" facts — they may be load-bearing in synthesis

Emit your extraction via the \`extract_atoms\` tool.
`.trim();

function buildContent(source: IngestedSource): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  const intro =
    source.kind === "pdf"
      ? `Source label: ${source.name}\n\nRead the attached PDF and emit atoms via the extract_atoms tool.`
      : source.kind === "image"
        ? `Source label: ${source.name}\n\nLook at the attached image and emit atoms via the extract_atoms tool — describe what you observe, any text visible, and any insights implied.`
        : `Source label: ${source.name}\n\nRead the source text below and emit atoms via the extract_atoms tool.`;
  content.push({ type: "text", text: intro });

  if (source.kind === "pdf") {
    // Cache the PDF block — the atom extractor re-runs whenever the user edits
    // a prompt and retriggers generation; caching keeps that cheap.
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: source.pdfBase64,
      },
      cache_control: { type: "ephemeral" },
    });
  } else if (source.kind === "image") {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: source.mediaType,
        data: source.imageBase64,
      },
      cache_control: { type: "ephemeral" },
    });
  } else {
    content.push({
      type: "text",
      text: `\n--- ${source.name} ---\n${source.text}`,
    });
  }
  return content;
}

export async function extractAtomsFromSource(
  source: IngestedSource
): Promise<SourceAtoms> {
  const anthropic = getAnthropic();
  const params = {
    model: getAgentModel(),
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        input_schema: TOOL_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: buildContent(source) }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const msg = await anthropic.messages.create(params);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error(
      `Atom extractor did not return a tool call for "${source.name}"`
    );
  }
  const input = tool.input as { atoms?: unknown };
  if (!Array.isArray(input.atoms)) {
    throw new Error(`Atom extractor returned no atoms for "${source.name}"`);
  }
  const atoms: Atom[] = [];
  for (const a of input.atoms) {
    if (
      !a ||
      typeof a !== "object" ||
      typeof (a as Record<string, unknown>).type !== "string" ||
      typeof (a as Record<string, unknown>).text !== "string"
    ) {
      continue;
    }
    const aObj = a as Record<string, unknown>;
    atoms.push({
      type: aObj.type as AtomType,
      text: aObj.text as string,
      ...(typeof aObj.source === "string" ? { source: aObj.source } : {}),
    });
  }
  if (!atoms.length) {
    throw new Error(`Atom extractor returned no valid atoms for "${source.name}"`);
  }
  return { sourceLabel: source.name, atoms };
}

export function renderAtomsForStructuring(sources: SourceAtoms[]): string {
  const lines: string[] = [];
  lines.push(`Extracted atoms from ${sources.length} source${sources.length === 1 ? "" : "s"}:\n`);
  for (const src of sources) {
    lines.push(`--- ${src.sourceLabel} (${src.atoms.length} atoms) ---`);
    src.atoms.forEach((a, i) => {
      const tag = `[${a.type}]`.padEnd(14);
      const src_attr = a.source ? `  (${a.source})` : "";
      lines.push(`  ${(i + 1).toString().padStart(3, " ")}. ${tag} ${a.text}${src_attr}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}
