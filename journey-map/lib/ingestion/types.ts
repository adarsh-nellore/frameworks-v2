// Ingestion layer: turns RawInput (paste / file / url) into IngestedSource
// (either plain text or a base64-encoded PDF for Anthropic document blocks).

export type RawInput =
  | { type: "paste"; text: string; name?: string }
  | { type: "file"; file: File; name: string }
  | { type: "url"; url: string };

export type IngestedSource =
  | {
      kind: "text";
      name: string;
      text: string;
      estTokens: number;
    }
  | {
      kind: "pdf";
      name: string;
      pdfBase64: string;
      estTokens: number;
    };

export type IngestionLimits = {
  /** Per-file size cap in bytes. */
  maxFileBytes: number;
  /** Total ingested size cap in bytes (sum of all files + paste). */
  maxTotalBytes: number;
  /** Maximum number of sources per request. */
  maxSources: number;
};

export const DEFAULT_LIMITS: IngestionLimits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxSources: 10,
};

export class IngestionError extends Error {
  constructor(
    message: string,
    public status: 400 | 500 = 400
  ) {
    super(message);
    this.name = "IngestionError";
  }
}
