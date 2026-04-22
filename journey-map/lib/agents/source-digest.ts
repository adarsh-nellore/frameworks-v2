import type { IngestedSource } from "@/lib/ingestion";

// ──────────────────────────────────────────────────────────────────────────────
// source-digest — turn ingested sources into a compact text summary the
// clarifier agent can reference when asking follow-up questions. The digest
// is intentionally small (~1500 tokens worst case) so we can ship it on
// every clarifier turn without blowing the context budget.
//
// Kind-specific treatment:
//   - text that looks like CSV/TSV → column headers + 3 sample rows + row count
//   - plain text (pastes, docx, markdown, url content) → first ~800 chars
//   - pdf → name + size + estTokens (no body; sending base64 to Haiku is
//     too expensive for a pre-step; real synth still gets the full doc)
//   - image → name + mediaType
//
// The `meta.csvs` array is opaque to the model — it's retained client-side
// across clarifier turns so later turns can reference columns without the
// model re-deriving them.
// ──────────────────────────────────────────────────────────────────────────────

export type SourceDigestCsvMeta = {
  name: string;
  delimiter: "," | "\t";
  columns: string[];
  rowCount: number;
};

export type SourceDigest = {
  /** Text blob shown to the clarifier model. */
  text: string;
  meta: {
    csvs: SourceDigestCsvMeta[];
    /** Total counts for quick UI display. */
    sourceCount: number;
  };
};

const MAX_DIGEST_CHARS = 6000; // ~1500 tokens at ~4 chars/token

export function buildSourceDigest(sources: IngestedSource[]): SourceDigest {
  if (sources.length === 0) {
    return { text: "", meta: { csvs: [], sourceCount: 0 } };
  }

  const parts: string[] = ["## Attached sources"];
  const csvs: SourceDigestCsvMeta[] = [];

  for (const s of sources) {
    if (s.kind === "pdf") {
      const sizeKb = Math.round((s.pdfBase64.length * 0.75) / 1024);
      parts.push(`- PDF · "${s.name}" · ~${sizeKb} KB · ~${s.estTokens} tokens`);
      parts.push(`    (PDF content not previewed at this stage; the synth agent will see the full document.)`);
      continue;
    }
    if (s.kind === "image") {
      parts.push(`- Image · "${s.name}" · ${s.mediaType}`);
      continue;
    }
    // kind === "text"
    const text = s.text;
    const csvMeta = sniffCsv(text, s.name);
    if (csvMeta) {
      csvs.push(csvMeta);
      parts.push(`- Tabular · "${s.name}" · ${csvMeta.columns.length} cols × ${csvMeta.rowCount} rows`);
      parts.push(`    Columns: ${csvMeta.columns.join(" · ")}`);
      const samples = sampleRows(text, csvMeta.delimiter, csvMeta.columns.length);
      if (samples.length > 0) {
        parts.push(`    Sample rows:`);
        for (const row of samples) {
          const preview = row.slice(0, 180) + (row.length > 180 ? "…" : "");
          parts.push(`      ${preview}`);
        }
      }
      continue;
    }
    const preview = text.slice(0, 800).replace(/\s+/g, " ").trim();
    const more = text.length > 800 ? ` (… ${text.length - 800} more chars)` : "";
    parts.push(`- Text · "${s.name}" · ${text.length} chars${more}`);
    if (preview.length > 0) {
      parts.push(`    Preview: ${preview}${text.length > 800 ? "…" : ""}`);
    }
  }

  let text = parts.join("\n");
  if (text.length > MAX_DIGEST_CHARS) {
    // Truncate the end; the header + CSV structure should dominate, so tail
    // truncation is usually fine. Still leaves a readable digest.
    text = text.slice(0, MAX_DIGEST_CHARS - 40) + "\n…(digest truncated to fit token budget)";
  }

  return {
    text,
    meta: { csvs, sourceCount: sources.length },
  };
}

// ── CSV sniffing ─────────────────────────────────────────────────────────────

function sniffCsv(text: string, name: string): SourceDigestCsvMeta | null {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (firstLine.length === 0) return null;

  const nameHint = /\.(csv|tsv)$/i.test(name);
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;

  let delimiter: "," | "\t" | null = null;
  if (tabCount >= 3 && tabCount >= commaCount) delimiter = "\t";
  else if (commaCount >= 3) delimiter = ",";
  else if (nameHint && (commaCount > 0 || tabCount > 0)) {
    delimiter = tabCount > commaCount ? "\t" : ",";
  }
  if (!delimiter) return null;

  const columns = parseCsvRow(firstLine, delimiter)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (columns.length < 2) return null;

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return {
    name,
    delimiter,
    columns,
    rowCount: Math.max(0, lines.length - 1),
  };
}

function sampleRows(text: string, delimiter: "," | "\t", _expectedCols: number): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const dataLines = lines.slice(1);
  const picks: string[] = [];
  if (dataLines.length >= 1) picks.push(dataLines[0]);
  if (dataLines.length >= 3) picks.push(dataLines[Math.floor(dataLines.length / 2)]);
  if (dataLines.length >= 2) picks.push(dataLines[dataLines.length - 1]);
  const uniq = Array.from(new Set(picks));
  return uniq.map((l) => {
    const cells = parseCsvRow(l, delimiter).map((c) => c.trim());
    return cells.join(" | ");
  });
}

// Minimal CSV row parser with quoted-field support. Not a full RFC 4180 parser
// but correct for typical real-world CSVs (quotes, escaped quotes, embedded
// commas). Good enough for a digest.
function parseCsvRow(line: string, delimiter: "," | "\t"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}
