import type { IngestedSource } from "@/lib/ingestion";

// ---------------------------------------------------------------------------
// Build Anthropic content blocks from ingested sources.
//
// Used by /api/framework-describe (synthesizeConfig + populate) and the shared
// executeArrange helper, so PDFs stay as `document` blocks, images as `image`
// blocks, and text is framed with headings — full fidelity to the agent, not
// a flattened char-truncated string.
//
// Applies `cache_control: { type: "ephemeral" }` on the final source block so
// Anthropic caches the (usually large) source payload across successive calls
// that share the same attachments. Safe under the 4-breakpoint-per-request
// budget since the caller typically has system + tools already marked.
// ---------------------------------------------------------------------------

/** Hard cap for embedded text blocks. PDFs / images are passed in full —
 *  only raw text gets truncated to protect the context budget from a user
 *  pasting a 500k-char log. */
const MAX_TEXT_CHARS = 60_000;

export type ContentBlock = Record<string, unknown>;

export function buildSourceContentBlocks(
  sources: IngestedSource[] | undefined
): ContentBlock[] {
  if (!sources || sources.length === 0) return [];

  const blocks: ContentBlock[] = [
    {
      type: "text",
      text: `You have ${sources.length} source${sources.length === 1 ? "" : "s"} to reason through, labeled and attached below.`,
    },
  ];

  for (const src of sources) {
    if (src.kind === "pdf") {
      blocks.push({
        type: "text",
        text: `--- ${src.name} (PDF) ---`,
      });
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: src.pdfBase64,
        },
      });
    } else if (src.kind === "image") {
      blocks.push({
        type: "text",
        text: `--- ${src.name} (image) ---`,
      });
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: src.mediaType,
          data: src.imageBase64,
        },
      });
    } else {
      const text = src.text.length > MAX_TEXT_CHARS
        ? src.text.slice(0, MAX_TEXT_CHARS) + "\n[…truncated…]"
        : src.text;
      blocks.push({
        type: "text",
        text: `--- ${src.name} ---\n${text}`,
      });
    }
  }

  // Stamp cache_control on the last block so the whole source prefix gets
  // cached — re-prompts that reuse the same attachments hit the cache.
  if (blocks.length > 0) {
    blocks[blocks.length - 1] = {
      ...blocks[blocks.length - 1],
      cache_control: { type: "ephemeral" },
    };
  }

  return blocks;
}
