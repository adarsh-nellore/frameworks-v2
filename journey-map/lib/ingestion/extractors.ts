import mammoth from "mammoth";
import { IngestionError, type IngestedSource } from "./types";

// Char-based token estimate. Good enough for routing decisions.
function estTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// PDFs go straight to Anthropic as document blocks. Estimate tokens roughly
// from byte size since we don't parse the content here.
function estPdfTokens(byteSize: number): number {
  return Math.ceil(byteSize / 3000);
}

export function extensionOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export const SUPPORTED_EXTENSIONS = [
  "pdf", "docx", "txt", "md", "json", "css", "html", "htm",
  // Tabular data: CSV / TSV. Useful for UX researchers dropping in survey
  // exports, interview tag tallies, Airtable/Notion CSVs, etc. We pass them
  // through as plain text — Claude can interpret the columns from the header
  // row, and the structuring prompt tells it how to build a framework on top.
  "csv", "tsv",
  // Images feed Anthropic vision. Mockups, whiteboard photos, screenshots, etc.
  "png", "jpg", "jpeg", "webp", "gif",
] as const;

/** Anthropic's supported vision MIME types, keyed by file extension. */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function estImageTokens(): number {
  // Anthropic guidance: ~1.15–1.6k tokens per typical image after resize.
  // Use a conservative fixed estimate — we size images before upload.
  return 1500;
}

export async function extractPdf(file: File): Promise<IngestedSource> {
  const buf = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buf.toString("base64");
  return {
    kind: "pdf",
    name: file.name,
    pdfBase64,
    estTokens: estPdfTokens(buf.length),
  };
}

export async function extractImage(file: File): Promise<IngestedSource> {
  const ext = extensionOf(file.name);
  const mediaType = IMAGE_MIME_BY_EXT[ext];
  if (!mediaType) {
    throw new IngestionError(
      `Unsupported image type ".${ext}". Allowed: ${Object.keys(IMAGE_MIME_BY_EXT).map((e) => "." + e).join(", ")}`
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return {
    kind: "image",
    name: file.name,
    imageBase64: buf.toString("base64"),
    mediaType,
    estTokens: estImageTokens(),
  };
}

export async function extractDocx(file: File): Promise<IngestedSource> {
  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value;
  } catch (e) {
    throw new IngestionError(
      `Failed to read DOCX "${file.name}": ${(e as Error).message}`
    );
  }
  return {
    kind: "text",
    name: file.name,
    text,
    estTokens: estTextTokens(text),
  };
}

export async function extractText(file: File): Promise<IngestedSource> {
  const text = await file.text();
  return {
    kind: "text",
    name: file.name,
    text,
    estTokens: estTextTokens(text),
  };
}

export async function extractJson(file: File): Promise<IngestedSource> {
  const raw = await file.text();
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Not valid JSON — fall back to raw text.
    pretty = raw;
  }
  return {
    kind: "text",
    name: file.name,
    text: pretty,
    estTokens: estTextTokens(pretty),
  };
}

export async function extractCss(file: File): Promise<IngestedSource> {
  const text = await file.text();
  return {
    kind: "text",
    name: file.name,
    text,
    estTokens: estTextTokens(text),
  };
}

/**
 * Extract design-relevant content from an HTML file: `<style>` blocks,
 * inline `style=""` attributes, and `<link>` stylesheet references.
 * The rest of the markup (divs, headings, paragraphs) is dropped to keep
 * the payload small — a 474 KB showcase page typically collapses to ~10 KB.
 */
export async function extractHtml(file: File): Promise<IngestedSource> {
  const raw = await file.text();
  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(raw))) styleBlocks.push(m[1]);

  const inlineStyles: string[] = [];
  const inlineRegex = /style=("[^"]*"|'[^']*')/gi;
  while ((m = inlineRegex.exec(raw))) inlineStyles.push(m[1].slice(1, -1));

  const externalSheets: string[] = [];
  const linkRegex =
    /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  while ((m = linkRegex.exec(raw))) {
    externalSheets.push(`/* external sheet: ${m[1]} */`);
  }

  const text = [
    ...externalSheets,
    ...styleBlocks.map((b) => `/* <style> block */\n${b.trim()}`),
    inlineStyles.length
      ? `/* inline styles */\n${inlineStyles.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Fallback: if no CSS was found, pass the raw HTML (capped to 30 KB).
  const final = text.trim() || raw.slice(0, 30_000);
  return {
    kind: "text",
    name: file.name,
    text: final,
    estTokens: estTextTokens(final),
  };
}

/** Fetch a URL through Jina Reader to get clean markdown. */
export async function extractUrl(url: string): Promise<IngestedSource> {
  if (!/^https?:\/\//i.test(url)) {
    throw new IngestionError(`URL must start with http(s): ${url}`);
  }
  const jinaUrl = `https://r.jina.ai/${url}`;
  let res: Response;
  try {
    res = await fetch(jinaUrl, {
      headers: { Accept: "text/markdown" },
    });
  } catch (e) {
    throw new IngestionError(
      `Could not reach Jina Reader for ${url}: ${(e as Error).message}`,
      500
    );
  }
  if (!res.ok) {
    throw new IngestionError(
      `Jina Reader returned ${res.status} for ${url}`,
      500
    );
  }
  const text = await res.text();
  return {
    kind: "text",
    name: url,
    text,
    estTokens: estTextTokens(text),
  };
}

export function makePasteSource(
  text: string,
  name = "Pasted notes"
): IngestedSource {
  return {
    kind: "text",
    name,
    text,
    estTokens: estTextTokens(text),
  };
}

export async function extractFile(file: File): Promise<IngestedSource> {
  const ext = extensionOf(file.name);
  switch (ext) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "txt":
    case "md":
      return extractText(file);
    case "json":
      return extractJson(file);
    case "csv":
    case "tsv":
      return extractText(file);
    case "css":
      return extractCss(file);
    case "html":
    case "htm":
      return extractHtml(file);
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
      return extractImage(file);
    default:
      throw new IngestionError(
        `Unsupported file type ".${ext}". Allowed: ${SUPPORTED_EXTENSIONS.map((e) => "." + e).join(", ")}`
      );
  }
}
