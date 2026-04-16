import { getFramework } from "@/lib/frameworks";
import {
  ingestSources,
  IngestionError,
  type RawInput,
} from "@/lib/ingestion";
import {
  encodeSseFrame,
  type GenerateDebug,
  type GenerateEvent,
} from "@/lib/pipeline/events";
import { extractAtomsFromSource, type SourceAtoms } from "@/lib/pipeline/extract-atoms";
import { structureMap } from "@/lib/pipeline/structure";

export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Two-stage universal generation pipeline:
//   1. Ingest sources
//   2. Extract atoms (per source, parallel) — Stage 1, framework-agnostic
//   3. Structure into UniversalMap using the framework's structuring prompt
// ---------------------------------------------------------------------------

type ParsedRequest = {
  frameworkId: string;
  preamble: string | null;
  fidelityMode: boolean;
  inputs: RawInput[];
};

async function parseRequest(req: Request): Promise<ParsedRequest> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const frameworkId = (fd.get("frameworkId") as string | null) ?? "";
    const title = (fd.get("title") as string | null) ?? null;
    const persona = (fd.get("persona") as string | null) ?? null;
    const fidelityRaw = (fd.get("fidelityMode") as string | null) ?? "true";
    const fidelityMode = fidelityRaw !== "false" && fidelityRaw !== "0";

    const inputs: RawInput[] = [];

    const text = fd.get("text") as string | null;
    if (text && text.trim()) {
      inputs.push({ type: "paste", text, name: "Pasted notes" });
    }
    for (const [key, value] of fd.entries()) {
      if (
        value instanceof File &&
        value.size > 0 &&
        (key === "file" || /^file_\d+$/.test(key))
      ) {
        inputs.push({ type: "file", file: value, name: value.name });
      }
    }
    for (const [key, value] of fd.entries()) {
      if (
        typeof value === "string" &&
        value.trim() &&
        (key === "url" || /^url_\d+$/.test(key))
      ) {
        inputs.push({ type: "url", url: value.trim() });
      }
    }

    const hints: string[] = [];
    if (title?.trim()) hints.push(`Title hint: ${title.trim()}`);
    if (persona?.trim()) hints.push(`Persona hint: ${persona.trim()}`);

    return {
      frameworkId,
      preamble: hints.length ? hints.join("\n") : null,
      fidelityMode,
      inputs,
    };
  }

  const body = (await req.json()) as {
    frameworkId?: string;
    text?: string;
    title?: string;
    persona?: string;
    urls?: string[];
    fidelityMode?: boolean;
  };
  const inputs: RawInput[] = [];
  if (body.text && body.text.trim()) {
    inputs.push({ type: "paste", text: body.text });
  }
  if (Array.isArray(body.urls)) {
    for (const u of body.urls) {
      if (typeof u === "string" && u.trim())
        inputs.push({ type: "url", url: u });
    }
  }
  const hints: string[] = [];
  if (body.title?.trim()) hints.push(`Title hint: ${body.title.trim()}`);
  if (body.persona?.trim()) hints.push(`Persona hint: ${body.persona.trim()}`);
  return {
    frameworkId: body.frameworkId ?? "",
    preamble: hints.length ? hints.join("\n") : null,
    fidelityMode: body.fidelityMode !== false,
    inputs,
  };
}

export async function POST(req: Request) {
  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!parsed.frameworkId) {
    return new Response(JSON.stringify({ error: "Missing frameworkId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!parsed.inputs.length) {
    return new Response(
      JSON.stringify({ error: "Provide at least one source (paste, file, or URL)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  let framework;
  try {
    framework = getFramework(parsed.frameworkId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown framework";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: GenerateEvent) {
        controller.enqueue(encoder.encode(encodeSseFrame(event)));
      }

      try {
        // ── Ingestion ─────────────────────────────────────────────────────────
        const sources = await ingestSources(parsed.inputs);
        if (!sources.length) {
          throw new Error("No usable sources after ingestion");
        }
        emit({ phase: "ingesting", sourcesCount: sources.length });

        // ── Stage 1: Universal Atom Extraction (parallel per source) ──────────
        const atomResults: SourceAtoms[] = [];
        for (let i = 0; i < sources.length; i++) {
          emit({
            phase: "extracting",
            current: i + 1,
            total: sources.length,
            sourceLabel: sources[i].name,
          });
        }
        const extractionPromises = sources.map((s) => extractAtomsFromSource(s));
        const settled = await Promise.allSettled(extractionPromises);
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          if (r.status === "fulfilled") {
            atomResults.push(r.value);
          } else {
            console.error(
              `[generate] extraction failed for ${sources[i].name}:`,
              r.reason
            );
          }
        }
        if (atomResults.length === 0) {
          throw new Error("All atom extractions failed");
        }

        const totalAtoms = atomResults.reduce((s, x) => s + x.atoms.length, 0);

        // ── Stage 2: Structuring ──────────────────────────────────────────────
        emit({ phase: "synthesizing" });
        const result = await structureMap(
          atomResults,
          framework.config,
          parsed.preamble ?? undefined
        );

        const debug: GenerateDebug = {
          mode: "two-pass",
          sourcesCount: sources.length,
          digestsCount: totalAtoms,
          opsCount: result.opsCount,
          fidelityMode: parsed.fidelityMode,
          critiqueRan: false,
          revisionRan: false,
        };

        emit({
          phase: "result",
          summary: result.summary,
          map: result.map,
          debug,
        });
      } catch (e) {
        let message: string;
        if (e instanceof IngestionError) message = e.message;
        else if (e instanceof Error) message = e.message;
        else message = "Unknown error";
        console.error("[generate] failed:", e);
        emit({ phase: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
