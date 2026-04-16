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

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "json"] as const;

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
    default:
      throw new IngestionError(
        `Unsupported file type ".${ext}". Allowed: ${SUPPORTED_EXTENSIONS.map((e) => "." + e).join(", ")}`
      );
  }
}
