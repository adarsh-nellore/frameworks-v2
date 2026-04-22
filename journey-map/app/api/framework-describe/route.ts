import { NextResponse } from "next/server";
import { ingestSources, IngestionError, type RawInput, type IngestedSource } from "@/lib/ingestion";
import { synthesizeFramework } from "@/lib/frameworks/synthesize";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// /api/framework-describe
//
// Single purpose: take a short natural-language description + optional sources,
// return a ready-to-render universal FrameworkConfig with its seed populated.
// The synthesis logic lives in lib/frameworks/synthesize.ts and is shared with
// /api/generate's auto mode.
// ──────────────────────────────────────────────────────────────────────────────

type DescribeRes =
  | {
      ok: true;
      mode: "universal";
      config: FrameworkConfig;
      populatedMap: UniversalMap;
      populationSummary?: string;
      warnings?: string[];
    }
  | { ok: false; error: string };

export async function POST(req: Request): Promise<Response> {
  // ── Parse (support both JSON and FormData) ─────────────────────────────────
  let description = "";
  let existingIds: string[] = [];
  let rawInputs: RawInput[] = [];

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      description = String(fd.get("description") ?? "").trim();
      const existingRaw = fd.get("existingIds");
      if (typeof existingRaw === "string" && existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed)) existingIds = parsed.filter((x): x is string => typeof x === "string");
        } catch { /* ignore */ }
      }
      for (const [key, value] of fd.entries()) {
        if (key.startsWith("file_") && value instanceof File) {
          rawInputs.push({ type: "file", file: value, name: value.name });
        } else if (key.startsWith("url_") && typeof value === "string" && value.trim()) {
          rawInputs.push({ type: "url", url: value.trim() });
        }
      }
    } else {
      const body = (await req.json()) as { description?: string; existingIds?: string[] };
      description = (body.description ?? "").trim();
      existingIds = Array.isArray(body.existingIds) ? body.existingIds : [];
    }
  } catch {
    return respond({ ok: false, error: "Invalid request body" }, 400);
  }

  if (description.length < 3 || description.length > 500) {
    return respond(
      { ok: false, error: "description must be between 3 and 500 characters" },
      400
    );
  }

  // ── Optional: fetch + extract sources ──────────────────────────────────────
  let sources: IngestedSource[] = [];
  const ingestWarnings: string[] = [];
  if (rawInputs.length > 0) {
    try {
      sources = await ingestSources(rawInputs);
    } catch (e) {
      const msg = e instanceof IngestionError ? e.message : (e as Error).message;
      ingestWarnings.push(`Could not ingest sources: ${msg}`);
    }
  }

  // ── Synthesize + populate ──────────────────────────────────────────────────
  try {
    const result = await synthesizeFramework({
      description,
      sources,
      existingIds,
    });
    const warnings = [...ingestWarnings, ...result.warnings];
    return respond(
      {
        ok: true,
        mode: "universal",
        config: result.config,
        populatedMap: result.populatedMap,
        ...(result.populationSummary ? { populationSummary: result.populationSummary } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      200
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return respond({ ok: false, error: msg }, 502);
  }
}

function respond(body: DescribeRes, status: number): Response {
  return NextResponse.json(body, { status });
}
