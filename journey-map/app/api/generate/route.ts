import { getFramework } from "@/lib/frameworks";
import {
  ingestSources,
  IngestionError,
  type IngestedSource,
  type RawInput,
} from "@/lib/ingestion";
import {
  encodeSseFrame,
  type GenerateDebug,
  type GenerateEvent,
} from "@/lib/pipeline/events";
import { extractAtomsFromSource, type SourceAtoms } from "@/lib/pipeline/extract-atoms";
import { structureMap } from "@/lib/pipeline/structure";
import { executeArrange } from "@/lib/frameworks/arrange-execute";
import { applyOps } from "@/lib/frameworks/universal";
import { synthesizeFramework } from "@/lib/frameworks/synthesize";
import {
  shouldInterpret,
  interpretPrompt,
  formatInterpreterNotes,
} from "@/lib/agents/prompt-interpreter";
import { runShapePlanner, renderShapePlanBlock } from "@/lib/agents/shape-planner";
import { buildSourceDigest } from "@/lib/agents/source-digest";
import {
  validateContract,
  type ShapeContract,
} from "@/lib/frameworks/shape-contract";

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
  /** Pre-computed shape contract from /api/preview/clarify. When present,
   *  the route skips the shape-planner step entirely. */
  prefetchedContract?: ShapeContract;
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

    const contractRaw = (fd.get("contract") as string | null) ?? null;
    const prefetchedContract = parsePrefetchedContract(contractRaw);

    return {
      frameworkId,
      preamble: hints.length ? hints.join("\n") : null,
      fidelityMode,
      inputs,
      prefetchedContract,
    };
  }

  const body = (await req.json()) as {
    frameworkId?: string;
    text?: string;
    title?: string;
    persona?: string;
    urls?: string[];
    fidelityMode?: boolean;
    contract?: unknown;
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
    prefetchedContract: body.contract
      ? parsePrefetchedContract(body.contract)
      : undefined,
  };
}

/** Validate an incoming contract payload (string-encoded JSON from FormData
 *  or already-parsed object from JSON body) and return a typed ShapeContract
 *  if it conforms. Bad payloads are silently dropped — the route falls back
 *  to running its own shape-planner call. */
function parsePrefetchedContract(raw: unknown): ShapeContract | undefined {
  if (!raw) return undefined;
  let candidate: unknown = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  const v = validateContract(candidate);
  if (!v.ok) {
    console.warn(`[generate] prefetched contract invalid (${v.reason}) — replanning`);
    return undefined;
  }
  return v.contract;
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

  if (!parsed.inputs.length) {
    return new Response(
      JSON.stringify({ error: "Provide at least one source (paste, file, or URL)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Route selection:
  //   - Explicit frameworkId: run the source-aware universal pipeline on that
  //     pre-existing config (topic-populate OR atom-extract → structure).
  //   - "auto" or missing: synthesize a brand-new FrameworkConfig from the
  //     description + sources, then emit it as the result. The synthesis
  //     helper handles populate internally.
  const autoMode =
    !parsed.frameworkId || parsed.frameworkId === "auto";

  let framework: ReturnType<typeof getFramework> | null = null;
  if (!autoMode) {
    try {
      framework = getFramework(parsed.frameworkId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown framework";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
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

        // ── Auto mode: synthesize a new FrameworkConfig from the description
        // + sources, then return it (populate happens inside synthesizeFramework
        // via executeArrange with the sources in scope). The client registers
        // the returned config via registerDynamicFramework so the board becomes
        // editable by the universal op/arrange pipeline.
        if (autoMode) {
          emit({ phase: "synthesizing" });
          const baseDescription = await buildDescriptionForSynthesis(parsed, sources);

          // Shape planner: the SINGLE upstream decision point for board
          // shape. Emits a typed ShapeContract that every downstream stage
          // honors. The rendered contract block is injected into the
          // description so the synth + populate agents see it as an
          // authoritative header; the typed object is also threaded through
          // so the populate retry can compute a contract-aware diff signal.
          // Fails soft — if the planner returns null, we skip augmentation.
          //
          // De-dupe: when the client already ran the planner via
          // /api/preview/clarify and threaded the contract through, reuse it
          // here instead of recomputing. Saves ~20–25s of round-trip time.
          let description = baseDescription;
          let contract: ShapeContract | undefined = parsed.prefetchedContract;
          if (contract) {
            description = `${baseDescription}\n\n${renderShapePlanBlock(contract)}`;
            console.log(
              `[generate] reusing prefetched contract from clarify (variant=${contract.variant}, ${contract.axes.cols.length}c×${contract.axes.rows.length}r)`
            );
          } else {
            try {
              const digest = buildSourceDigest(sources);
              contract = (await runShapePlanner({
                description: baseDescription,
                sourcesSummary: digest.text,
              })) ?? undefined;
              if (contract) {
                description = `${baseDescription}\n\n${renderShapePlanBlock(contract)}`;
              }
            } catch (e) {
              console.warn("[generate] shape-planner step errored — continuing without plan:", e);
            }
          }

          // Per-scope progress hooks so the UI can show "filling X of Y" as
          // parallel workers complete. Only fires when synthesizeFramework
          // takes the parallel-populate branch.
          let scopeTotal = 0;
          let scopeDone = 0;
          const synth = await synthesizeFramework({
            description,
            sources,
            existingIds: [],
            contract,
            onScopeStart: (_scope, total) => {
              scopeTotal = total;
              emit({ phase: "populating", done: scopeDone, total: scopeTotal });
            },
            onScopeDone: (scope, _opsCount) => {
              scopeDone++;
              emit({
                phase: "populating",
                done: scopeDone,
                total: scopeTotal,
                lastLabel: scope.label,
              });
            },
          });
          emit({
            phase: "result",
            summary:
              synth.populationSummary ??
              `Generated "${synth.config.label}"`,
            map: synth.populatedMap,
            config: synth.config,
            debug: {
              mode: "two-pass",
              sourcesCount: sources.length,
              opsCount: synth.opsCount,
              fidelityMode: parsed.fidelityMode,
              critiqueRan: false,
              revisionRan: false,
            },
          });
          controller.close();
          return;
        }

        if (!framework) {
          // Defensive — non-auto path must have resolved a framework above.
          throw new Error("No framework resolved for generation");
        }

        // Topic-prompt fast path: when the only input is a short paste — e.g.
        // the user typed "Kaiser Permanente" and picked a framework — there's
        // no research material to atomize, and atom extraction will rightly
        // decline to emit a tool call. Populate the framework's seed directly
        // via executeArrange instead, so the user always gets a populated
        // board from a topic prompt. Files, URLs, and longer pastes still go
        // through the atom-extraction path below.
        if (isTopicPrompt(sources)) {
          emit({ phase: "synthesizing" });
          const topic = (sources[0] as { text: string }).text.trim();
          const topicResult = await runTopicPopulate(framework.config, topic, parsed.preamble);
          emit({
            phase: "result",
            summary: topicResult.summary,
            map: topicResult.map,
            debug: {
              mode: "two-pass",
              sourcesCount: 1,
              digestsCount: 0,
              opsCount: topicResult.opsCount,
              fidelityMode: parsed.fidelityMode,
              critiqueRan: false,
              revisionRan: false,
            },
          });
          controller.close();
          return;
        }

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
        // If atom extraction yielded nothing from every source, fall back to
        // the topic-populate path so the user still gets a usable board
        // instead of a hard error.
        if (atomResults.length === 0) {
          console.warn("[generate] atom extraction returned nothing — falling back to topic populate");
          emit({ phase: "synthesizing" });
          const topicish = sourcesAsTopic(sources);
          const topicResult = await runTopicPopulate(
            framework.config,
            topicish,
            parsed.preamble
          );
          emit({
            phase: "result",
            summary: topicResult.summary,
            map: topicResult.map,
            debug: {
              mode: "two-pass",
              sourcesCount: sources.length,
              digestsCount: 0,
              opsCount: topicResult.opsCount,
              fidelityMode: parsed.fidelityMode,
              critiqueRan: false,
              revisionRan: false,
            },
          });
          controller.close();
          return;
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

// ─────────────────────────────────────────────────────────────────────────────
// Topic-prompt support
// ─────────────────────────────────────────────────────────────────────────────

/** Build a single natural-language description of user intent for the
 *  synthesis agent. Prefers the first pasted text, falls back to source
 *  names + any title/persona hints in the preamble. */
async function buildDescriptionForSynthesis(
  parsed: ParsedRequest,
  sources: IngestedSource[]
): Promise<string> {
  const pasted = parsed.inputs.find((i) => i.type === "paste");
  let base: string;
  if (pasted && "text" in pasted && pasted.text.trim()) {
    const trimmed = pasted.text.trim();
    base = parsed.preamble ? `${parsed.preamble}\n\n${trimmed}` : trimmed;
  } else {
    const sourceNames = sources.map((s) => s.name).filter(Boolean).join(", ");
    const head = parsed.preamble ?? "";
    base = `${head}\n\nSources provided: ${sourceNames}`.trim();
  }

  // Stage 1 — deterministic shape-keyword detector. Free, instant. Catches
  // explicit cases ("competitive matrix", "journey map", "swimlane", "2x2").
  const hint = detectShapeHint(base);
  const withHint = hint ? `${base}\n\n${hint}` : base;

  // Stage 2 — Haiku interpreter for terse / rough prompts. Gated by
  // shouldInterpret() so longer prompts don't pay the latency tax. SKIPPED
  // when the prompt already contains a `# Constraints (user-confirmed)`
  // block, because that means the conversational clarifier already ran and
  // the user's answers are strictly better than anything the interpreter
  // would infer silently. Fails soft — interpreter errors pass through to
  // the synth agent unchanged. Only appends; never rewrites the user's text.
  const hasUserConstraints = /^#\s*Constraints\s*\(user-confirmed\)/m.test(base);
  if (!hasUserConstraints && shouldInterpret(base)) {
    const interp = await interpretPrompt(base);
    if (interp) {
      const notes = formatInterpreterNotes(interp);
      if (notes) return `${withHint}\n\n${notes}`;
    }
  }

  return withHint;
}

/** Detect explicit shape words in the user's prompt and surface them to the
 *  synth agent as a layout hint. The synth prompt already contains layout
 *  examples and a decision rubric, but it has no signal-boost when the user
 *  says the shape out loud. This is low-risk (a single line appended) and
 *  keeps the agent free to override when the prompt is ambiguous.
 *
 *  NOT a framework-name mapping — we never say "treat this as journey-map".
 *  We just echo the shape word the user used and bind it to a layout. */
function detectShapeHint(description: string): string | null {
  const text = description.toLowerCase();
  const matchers: Array<{ layout: "grid" | "kanban" | "matrix" | "freeform"; patterns: RegExp[] }> = [
    {
      layout: "grid",
      patterns: [
        /\bjourney\s*map\b/,
        /\bservice\s*blueprint\b/,
        /\bprocess\s*map\b/,
        /\buser\s*story\s*map\b/,
        /\bstory\s*map\b/,
        /\bswim\s*lane[s]?\b/,
        /\bswimlane[s]?\b/,
        /\bexperience\s*map\b/,
      ],
    },
    {
      layout: "matrix",
      patterns: [
        /\bcompetitive\s*matrix\b/,
        /\bcompetitive\s*map\b/,
        /\bcomparison\s*matrix\b/,
        /\b2\s*x\s*2\b/,
        /\btwo\s*by\s*two\b/,
        /\bquadrant[s]?\b/,
        /\bswot\b/,
        /\beisenhower\b/,
        /\bimpact.{0,10}effort\b/,
        /\beffort.{0,10}impact\b/,
      ],
    },
    {
      layout: "kanban",
      patterns: [
        /\bkanban\b/,
        /\baffinity\s*diagram\b/,
        /\bcard\s*sort\b/,
        /\bnow.{0,3}next.{0,3}later\b/,
      ],
    },
  ];
  for (const m of matchers) {
    for (const p of m.patterns) {
      const hit = text.match(p);
      if (hit) {
        return `User explicitly requested a ${hit[0].trim()} — strongly prefer layout: "${m.layout}". If the shape genuinely contradicts the subject matter, override, but default to honoring the requested shape.`;
      }
    }
  }
  // Clustered-grid hints: mind map / concept map / clustered canvas. Planner
  // picks variant: "clustered" (renders as a grid with cell-group chrome).
  if (
    /\bmind\s*map\b/.test(text) ||
    /\bconcept\s*map\b/.test(text) ||
    /\bclustered\s+(canvas|graph|board)\b/.test(text) ||
    /\bopportunity\s+(canvas|map)\b/.test(text) ||
    /\bstrategy\s+canvas\b/.test(text) ||
    /\bstakeholder\s+landscape\b/.test(text)
  ) {
    return `User asked for a clustered / mind-map-style board — strongly prefer variant: "clustered" on the shape contract. Render as a grid with named cell groups; do NOT use layout: "freeform".`;
  }
  return null;
}

/** Recognise a single-paste, short-text input as a topic prompt rather than
 *  research material to atomize. Threshold is generous (≤ 600 chars) so a
 *  short brief like "Kaiser Permanente member enrollment" still populates the
 *  seed sensibly, but a pasted interview transcript still goes through atom
 *  extraction. */
function isTopicPrompt(sources: IngestedSource[]): boolean {
  if (sources.length !== 1) return false;
  const only = sources[0];
  if (only.kind !== "text") return false;
  return only.text.trim().length <= 600;
}

/** Join thin sources into a single topic brief, for the fallback path when
 *  atom extraction produced nothing useful. */
function sourcesAsTopic(sources: IngestedSource[]): string {
  const parts: string[] = [];
  for (const s of sources) {
    if (s.kind === "text") parts.push(s.text.trim());
    else if (s.kind === "pdf") parts.push(`(Source: ${s.name} — PDF)`);
    else if (s.kind === "image") parts.push(`(Source: ${s.name} — image)`);
  }
  return parts.filter(Boolean).join("\n\n").slice(0, 2000);
}

/** Populate a framework's seed from a topic brief using executeArrange. Used
 *  when there's no substantive source material to atomize — the agent treats
 *  the topic as the subject and fills the seed with plausible starter content
 *  grounded in that topic. */
async function runTopicPopulate(
  config: import("@/lib/frameworks/universal/config").FrameworkConfig,
  topic: string,
  preamble: string | null
): Promise<{ summary: string; map: import("@/lib/frameworks/universal/types").UniversalMap; opsCount: number }> {
  const layoutHint = config.layout === "matrix"
    ? "Put 4–6 substantive items in every quadrant — every cell must feel load-bearing, not token."
    : config.layout === "kanban"
      ? "Each column should hold 5–8 cards. Use sub-items (addCard with parentCardId) where a card has naturally nested detail."
      : config.layout === "freeform"
        ? "Place 12–20 content cards clustered by col, using meta.x/y. Use shape cards where the framework's identity implies one (see freeform guidance)."
        : "Target ~80% fill across (col, row) positions. Use sub-items freely to capture nested detail. Empty cells are only acceptable when they genuinely don't exist in the domain.";

  const instruction = [
    preamble ?? "",
    `Topic: ${topic}`,
    "",
    "You are populating this framework as a **senior practitioner with 10+ years of hands-on experience in the topic above**. Write the cards that a subject-matter expert would write — not what a generic AI assistant would write.",
    "",
    "## Quality bar for every card",
    "",
    "- **Be specific, not surface-level.** Name real actors (roles, systems, regulations, teams), real metrics (==73% drop-off==, ==6-week turnaround==, ==$40 PMPM==), real artifacts (EOB statements, HL7 feeds, NCQA HEDIS measures, not just 'reports' / 'tools').",
    "- **Use concrete language grounded in the topic's vocabulary.** A card about payer contracting should mention risk corridors, stop-loss, capitation rates — not generic 'negotiate terms'. A card about a login flow should name OAuth, MFA challenge, rate limiters — not 'enter credentials'.",
    "- **Each card reveals something a reader wouldn't have guessed.** Avoid platitudes like 'stakeholders are aligned' or 'users are frustrated'. Every card should carry a non-obvious observation or fact.",
    "- **Length 10–22 words.** Enough to be substantive, short enough to scan. Use `**bold**` for the one load-bearing phrase per card and `==highlight==` for specific numbers, named entities, or direct quotes.",
    "- **Cover the topic broadly.** Hit the full surface area of the framework, not just the obvious corners.",
    "",
    "## What to avoid",
    "",
    "- Generic phrasing that could apply to any topic (\"needs clear communication\", \"better tooling required\").",
    "- Empty cells when the framework position genuinely has content in the real world — use your domain knowledge.",
    "- Card text that merely restates the col/row label.",
    "- More than two cards per position that say the same thing in different words.",
    "",
    "## Layout-specific density",
    "",
    layoutHint,
    "",
    "Set hero meta (persona, coreJobStatement, axis labels, etc.) via `setMapMeta` so the framework's top-level context is grounded in the topic too.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await executeArrange({
    map: config.seed,
    config,
    instruction,
  });
  if (!result.ok) {
    throw new Error(`Topic populate failed: ${result.error}`);
  }
  const applied = applyOps(config.seed, result.ops);
  if (!applied.ok) {
    throw new Error(
      `Topic populate ops failed at index ${applied.failedAtIndex}: ${applied.reason}`
    );
  }
  return {
    summary: result.summary,
    map: applied.map,
    opsCount: result.ops.length,
  };
}
