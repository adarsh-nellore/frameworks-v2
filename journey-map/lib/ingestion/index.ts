import {
  DEFAULT_LIMITS,
  IngestionError,
  type IngestedSource,
  type IngestionLimits,
  type RawInput,
} from "./types";
import { extractFile, extractUrl, makePasteSource } from "./extractors";

export {
  IngestionError,
  DEFAULT_LIMITS,
  type IngestedSource,
  type RawInput,
  type IngestionLimits,
};
export { SUPPORTED_EXTENSIONS, extensionOf } from "./extractors";

/**
 * Ingest a list of raw inputs into normalized sources ready for the agent.
 * Enforces size limits before reading large files into memory where possible
 * (file size is checked via `File.size` first; URLs and paste are bounded by
 * the request body limit).
 */
export async function ingestSources(
  inputs: RawInput[],
  limits: IngestionLimits = DEFAULT_LIMITS
): Promise<IngestedSource[]> {
  if (inputs.length === 0) {
    throw new IngestionError("Provide at least one source (paste, file, or URL).");
  }
  if (inputs.length > limits.maxSources) {
    throw new IngestionError(
      `Too many sources (${inputs.length}). Max ${limits.maxSources}.`
    );
  }

  // Pre-check file sizes (cheap) before doing any IO.
  let runningTotal = 0;
  for (const input of inputs) {
    if (input.type === "file") {
      if (input.file.size > limits.maxFileBytes) {
        throw new IngestionError(
          `File "${input.file.name}" too large (${formatBytes(input.file.size)}). Max ${formatBytes(limits.maxFileBytes)}.`
        );
      }
      runningTotal += input.file.size;
    } else if (input.type === "paste") {
      runningTotal += input.text.length;
    }
  }
  if (runningTotal > limits.maxTotalBytes) {
    throw new IngestionError(
      `Total source size (${formatBytes(runningTotal)}) exceeds limit (${formatBytes(limits.maxTotalBytes)}).`
    );
  }

  const out: IngestedSource[] = [];
  for (const input of inputs) {
    if (input.type === "paste") {
      const text = input.text.trim();
      if (!text) continue;
      out.push(makePasteSource(text, input.name ?? "Pasted notes"));
    } else if (input.type === "file") {
      out.push(await extractFile(input.file));
    } else if (input.type === "url") {
      out.push(await extractUrl(input.url));
    }
  }

  if (out.length === 0) {
    throw new IngestionError("All sources were empty.");
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
