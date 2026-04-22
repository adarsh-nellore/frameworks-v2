import type { FrameworkConfig, CardMetaField, HeroMetaField, RenderingPlan } from "../universal/config";
import type { UniversalMap, Card } from "../universal/types";
import { validateMap } from "../universal/ops";

// ──────────────────────────────────────────────────────────────────────────────
// Runtime validator for FrameworkConfig objects synthesized by the LLM.
//
// The Claude tool JSON Schema (lib/frameworks/custom/tool.ts) enforces shape at
// the tool-call boundary, but that's not enough — we also need semantic checks
// (layout-specific rules, no op names leaking into structuringPrompt, col/row
// id formats that applyOps can work with, unknown-field strip).
//
// validateFrameworkConfig takes the raw tool input + the set of ids already in
// use, and returns a normalized, typed FrameworkConfig (with a possibly
// auto-suffixed id on collision) or a precise failure reason.
// ──────────────────────────────────────────────────────────────────────────────

const ID_PATTERN = /^custom-[a-z0-9-]{3,40}$/;
const COL_ID_PATTERN = /^c\d+$/;
const ROW_ID_PATTERN = /^r\d+$/;
const OP_NAME_PATTERN =
  /\b(addCard|addCol|addRow|removeCard|removeCol|removeRow|renameCol|renameRow|moveCard|moveCol|moveRow|editCard|reparentCard|setCardMeta|setMapMeta)\b/;

const MAX_NOUN = 20;
const MAX_LABEL = 40;
const MIN_STRUCTURING = 40;
const MAX_STRUCTURING = 2000;
const MIN_EXAMPLES = 2;
const MAX_EXAMPLES = 5;
const MAX_EXAMPLE_LEN = 120;
const MAX_CHAT_HINT = 80;

type Result =
  | { ok: true; config: FrameworkConfig }
  | { ok: false; reason: string };

export function validateFrameworkConfig(raw: unknown, existingIds: Iterable<string> = []): Result {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "Config must be a JSON object" };
  }
  const src = raw as Record<string, unknown>;

  // ── Required string fields ─────────────────────────────────────────────────
  for (const key of ["label", "colNoun", "rowNoun", "cardNoun", "structuringPrompt"] as const) {
    if (typeof src[key] !== "string" || (src[key] as string).trim().length === 0) {
      return { ok: false, reason: `Missing or empty field: ${key}` };
    }
  }

  // ── id: normalize (repair), then auto-suffix on collision ─────────────────
  // The agent sometimes returns ids with uppercase letters, URLs, or trailing
  // dots (e.g. when the user's description includes a URL). Rather than reject,
  // we normalize to the strict form and only bail if nothing usable remains.
  const normalizedId = normalizeFrameworkId(src.id);
  if (!normalizedId || !ID_PATTERN.test(normalizedId)) {
    return {
      ok: false,
      reason: `id could not be normalized to match ${ID_PATTERN} (got "${String(src.id)}")`,
    };
  }
  const existing = new Set(existingIds);
  let id = normalizedId;
  if (existing.has(id)) {
    let n = 2;
    while (existing.has(`${id}-${n}`) && n < 1000) n++;
    id = `${id}-${n}`.slice(0, 48);
  }

  // ── label, nouns, optional chat hints ──────────────────────────────────────
  const label = (src.label as string).trim().slice(0, MAX_LABEL);
  const colNoun = (src.colNoun as string).trim().slice(0, MAX_NOUN);
  const rowNoun = (src.rowNoun as string).trim().slice(0, MAX_NOUN);
  const cardNoun = (src.cardNoun as string).trim().slice(0, MAX_NOUN);
  const chatPlaceholder = optTruncString(src.chatPlaceholder, MAX_CHAT_HINT);
  const chatSubtitle = optTruncString(src.chatSubtitle, MAX_CHAT_HINT);

  // ── layout ─────────────────────────────────────────────────────────────────
  if (
    src.layout !== "grid" &&
    src.layout !== "kanban" &&
    src.layout !== "matrix" &&
    src.layout !== "freeform"
  ) {
    return {
      ok: false,
      reason: `layout must be one of "grid" | "kanban" | "matrix" | "freeform" (got "${String(src.layout)}")`,
    };
  }
  const layout = src.layout as "grid" | "kanban" | "matrix" | "freeform";

  // ── structuringPrompt: length + no op-name leak ────────────────────────────
  // Truncate long prompts (the agent tends to be verbose) rather than rejecting
  // — the user's framework is still valid, just a bit wordier than ideal.
  const structuringPrompt =
    (src.structuringPrompt as string).trim().length > MAX_STRUCTURING
      ? (src.structuringPrompt as string).trim().slice(0, MAX_STRUCTURING)
      : (src.structuringPrompt as string).trim();
  if (structuringPrompt.length < MIN_STRUCTURING) {
    return { ok: false, reason: `structuringPrompt too short (min ${MIN_STRUCTURING} chars)` };
  }
  if (OP_NAME_PATTERN.test(structuringPrompt)) {
    return {
      ok: false,
      reason:
        "structuringPrompt mentions universal op names (addCard, moveRow, etc.) — describe the framework, not how to mutate it.",
    };
  }

  // ── exampleInstructions ────────────────────────────────────────────────────
  if (!Array.isArray(src.exampleInstructions)) {
    return { ok: false, reason: "exampleInstructions must be an array" };
  }
  const exs = (src.exampleInstructions as unknown[])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, MAX_EXAMPLE_LEN));
  if (exs.length < MIN_EXAMPLES) {
    return { ok: false, reason: `exampleInstructions needs at least ${MIN_EXAMPLES} items` };
  }
  const exampleInstructions = exs.slice(0, MAX_EXAMPLES);

  // ── fixedCols / fixedRows (optional booleans) ──────────────────────────────
  // Matrix layout semantically implies a fixed dense grid. If the agent
  // forgets to set both flags (easy mistake when patterning after the
  // competitive-map few-shot, which uses matrix with dynamic rows/cols),
  // coerce to fixed rather than rejecting — same forgiveness the kanban
  // branch below applies when the agent proposes >1 row.
  const coerceFixedForMatrix = src.layout === "matrix";
  const fixedCols = src.fixedCols === true || coerceFixedForMatrix;
  const fixedRows = src.fixedRows === true || coerceFixedForMatrix;

  // ── cardMetaFields / heroMetaFields (optional) ─────────────────────────────
  const cardMetaFields = parseCardMetaFields(src.cardMetaFields);
  if (cardMetaFields.error) return { ok: false, reason: cardMetaFields.error };

  const heroMetaFields = parseHeroMetaFields(src.heroMetaFields);
  if (heroMetaFields.error) return { ok: false, reason: heroMetaFields.error };

  // ── chrome (optional) ───────────────────────────────────────────────────────
  const chrome = parseChrome(src.chrome);
  if (chrome.error) return { ok: false, reason: chrome.error };

  // ── renderingPlan (required in schema, but fall back to a sensible default
  //     inferred from layout if the agent omits it or sends a malformed one) ─
  const renderingPlan = parseRenderingPlan(src.renderingPlan, src.layout);
  if (renderingPlan.error) return { ok: false, reason: renderingPlan.error };

  // ── connectors (optional) ──────────────────────────────────────────────────
  const connectors = parseConnectors(src.connectors);
  if (connectors.error) return { ok: false, reason: connectors.error };

  // ── seed ───────────────────────────────────────────────────────────────────
  const seedRes = validateSeed(src.seed, id, label);
  if (!seedRes.ok) return { ok: false, reason: `seed: ${seedRes.reason}` };
  const seed = seedRes.map;

  // ── Layout-specific rules ──────────────────────────────────────────────────
  let effectiveFixedRows = fixedRows;
  if (layout === "matrix") {
    if (seed.cols.length < 2 || seed.rows.length < 2) {
      return { ok: false, reason: 'matrix layout requires at least 2 cols and 2 rows' };
    }
    // fixedCols/fixedRows are coerced to true above — matrix is always fixed.
  } else if (layout === "kanban") {
    // Kanban is single-row by convention. If the agent proposed multiple rows,
    // coerce to grid rather than rejecting — the user doesn't care which
    // renderer we use, they want their framework.
    if (seed.rows.length !== 1) {
      return buildResult("grid");
    }
    effectiveFixedRows = true;
  } else if (layout === "freeform") {
    // Freeform coexists with any cols/rows shape; no structural constraint.
  }

  return buildResult(layout);

  function buildResult(effectiveLayout: "grid" | "kanban" | "matrix" | "freeform"): Result {
    // Strip chrome kinds that don't make sense with the effective layout
    // instead of rejecting the whole config. The agent may misinterpret and
    // pick, e.g., kanban + coordinate-cross; the framework still works without
    // the chrome, and the user gets a usable result.
    const effectiveChrome =
      chrome.value && chromeFitsLayout(chrome.value.kind, effectiveLayout)
        ? chrome.value
        : undefined;

    // ── Assemble ─────────────────────────────────────────────────────────────
    const config: FrameworkConfig = {
      id,
      label,
      layout: effectiveLayout,
      colNoun,
      rowNoun,
      cardNoun,
      seed,
      structuringPrompt,
      exampleInstructions,
      ...(fixedCols ? { fixedCols: true } : {}),
      ...(effectiveFixedRows ? { fixedRows: true } : {}),
      ...(cardMetaFields.value ? { cardMetaFields: cardMetaFields.value } : {}),
      ...(heroMetaFields.value ? { heroMetaFields: heroMetaFields.value } : {}),
      ...(chatPlaceholder ? { chatPlaceholder } : {}),
      ...(chatSubtitle ? { chatSubtitle } : {}),
      ...(effectiveChrome ? { chrome: effectiveChrome } : {}),
      ...(connectors.value ? { connectors: connectors.value } : {}),
      ...(renderingPlan.value ? { renderingPlan: renderingPlan.value } : {}),
    };

    return { ok: true, config };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// renderingPlan — the visual layer between semantic framework choice and
// per-card placement. We coerce missing/malformed plans to a safe default
// inferred from layout so existing frameworks and agent misfires don't break.
// ──────────────────────────────────────────────────────────────────────────────

function parseRenderingPlan(
  raw: unknown,
  layout: unknown
): { error?: string; value?: RenderingPlan } {
  const defaultPlan: RenderingPlan = inferDefaultRenderingPlan(layout);
  if (raw === undefined || raw === null) return { value: defaultPlan };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "renderingPlan must be an object" };
  }
  const r = raw as Record<string, unknown>;

  const cardOrientation =
    r.cardOrientation === "stacked" ||
    r.cardOrientation === "horizontal-bar" ||
    r.cardOrientation === "dot" ||
    r.cardOrientation === "mixed"
      ? r.cardOrientation
      : undefined;
  if (r.cardOrientation !== undefined && cardOrientation === undefined) {
    return {
      error: `renderingPlan.cardOrientation must be one of "stacked" | "horizontal-bar" | "dot" | "mixed" (got "${String(r.cardOrientation)}")`,
    };
  }

  const spatialContinuity =
    r.spatialContinuity === "cell-discrete" ||
    r.spatialContinuity === "axis-continuous" ||
    r.spatialContinuity === "xy-continuous"
      ? r.spatialContinuity
      : undefined;
  if (r.spatialContinuity !== undefined && spatialContinuity === undefined) {
    return {
      error: `renderingPlan.spatialContinuity must be one of "cell-discrete" | "axis-continuous" | "xy-continuous" (got "${String(r.spatialContinuity)}")`,
    };
  }

  const density =
    r.density === "sparse" ||
    r.density === "moderate" ||
    r.density === "dense"
      ? r.density
      : undefined;
  if (r.density !== undefined && density === undefined) {
    return {
      error: `renderingPlan.density must be one of "sparse" | "moderate" | "dense" (got "${String(r.density)}")`,
    };
  }

  const summary =
    typeof r.summary === "string" && r.summary.trim()
      ? r.summary.trim().slice(0, 400)
      : undefined;

  return {
    value: {
      cardOrientation: cardOrientation ?? defaultPlan.cardOrientation,
      spatialContinuity: spatialContinuity ?? defaultPlan.spatialContinuity,
      density: density ?? defaultPlan.density,
      summary: summary ?? defaultPlan.summary,
    },
  };
}

function inferDefaultRenderingPlan(layout: unknown): RenderingPlan {
  // For any unknown or standard layout, default to the safe stacked /
  // cell-discrete treatment that matches every existing catalog framework.
  return {
    cardOrientation: "stacked",
    spatialContinuity: "cell-discrete",
    density: "moderate",
    summary:
      layout === "matrix"
        ? "Fixed N×M grid. Cards stack discretely within each (col, row) cell."
        : layout === "kanban"
          ? "Single row. Cards stack vertically in each category column."
          : layout === "freeform"
            ? "Unstructured canvas. Cards positioned via meta.x / meta.y in pixel coordinates; no forced grid."
            : "Grid with cols and rows. Cards stack discretely within each (col, row) cell.",
  };
}

// Chrome kinds are tied to specific layouts. A coordinate-cross implies two
// axes, which only matrix provides; venn/kano/funnel/double-diamond/concentric
// are banners that read on kanban or grid. This keeps the agent's mistakes
// forgivable — we strip rather than reject.
function chromeFitsLayout(
  kind: NonNullable<FrameworkConfig["chrome"]>["kind"],
  layout: "grid" | "kanban" | "matrix" | "freeform"
): boolean {
  if (kind === "coordinate-cross") return layout === "matrix";
  // All other chrome kinds were designed for kanban/grid tabular layouts.
  return layout === "kanban" || layout === "grid" || layout === "matrix";
}

function parseConnectors(raw: unknown): { error?: string; value?: FrameworkConfig["connectors"] } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "connectors must be an object" };
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.enabled !== "boolean") {
    return { error: "connectors.enabled must be a boolean" };
  }
  if (!c.enabled) return {}; // opt-out = omit entirely
  const allowedKinds =
    Array.isArray(c.allowedKinds) && c.allowedKinds.every((x) => typeof x === "string" && (x as string).trim())
      ? (c.allowedKinds as string[]).map((x) => x.trim()).slice(0, 12)
      : undefined;
  const defaultRouting =
    c.defaultRouting === "straight" || c.defaultRouting === "orthogonal"
      ? c.defaultRouting
      : undefined;
  return {
    value: {
      enabled: true,
      ...(allowedKinds && allowedKinds.length ? { allowedKinds } : {}),
      ...(defaultRouting ? { defaultRouting } : {}),
    },
  };
}

function parseChrome(raw: unknown): { error?: string; value?: FrameworkConfig["chrome"] } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "chrome must be an object" };
  }
  const c = raw as Record<string, unknown>;
  const kind = c.kind;
  if (kind === "double-diamond") {
    return {
      value: {
        kind,
        ...(typeof c.leftLabel === "string" ? { leftLabel: c.leftLabel } : {}),
        ...(typeof c.rightLabel === "string" ? { rightLabel: c.rightLabel } : {}),
      },
    };
  }
  if (kind === "venn") {
    const circles = Array.isArray(c.circles)
      ? (c.circles.filter((x) => typeof x === "string") as string[])
      : undefined;
    return { value: { kind, ...(circles && circles.length ? { circles } : {}) } };
  }
  if (
    kind === "kano-curve" ||
    kind === "funnel" ||
    kind === "concentric" ||
    kind === "coordinate-cross"
  ) {
    return { value: { kind } };
  }
  return {
    error: `chrome.kind must be one of "double-diamond" | "venn" | "kano-curve" | "funnel" | "concentric" | "coordinate-cross"`,
  };
}

// Normalize a proposed framework id into the strict `custom-[a-z0-9-]{3,40}`
// form. Returns the normalized id or an empty string if nothing usable is left.
function normalizeFrameworkId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  // Replace any non-allowed char with a hyphen. This drops URLs, dots,
  // underscores, unicode, etc. and leaves dashes/letters/digits intact.
  s = s.replace(/[^a-z0-9-]/g, "-");
  // Collapse consecutive hyphens and trim leading/trailing.
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!s) return "";
  // Ensure "custom-" prefix.
  if (!s.startsWith("custom-")) s = `custom-${s}`;
  // Truncate the part AFTER "custom-" to 40 chars to satisfy ID_PATTERN.
  const body = s.slice("custom-".length);
  const trimmedBody = body.slice(0, 40).replace(/-+$/g, "");
  return `custom-${trimmedBody}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed validation: shape → universal validateMap → id format enforcement.
// Also re-ids cols/rows if the LLM emitted malformed ids (so applyOps' seq
// counters — which parse the numeric suffix — still work deterministically).
// Cards in a propose_framework seed must be empty; the populate step fills them.
// ──────────────────────────────────────────────────────────────────────────────

function validateSeed(
  raw: unknown,
  configId: string,
  label: string
): { ok: true; map: UniversalMap } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "must be a JSON object" };
  }
  const s = raw as Record<string, unknown>;

  if (!Array.isArray(s.cols)) return { ok: false, reason: "cols must be an array" };
  if (!Array.isArray(s.rows)) return { ok: false, reason: "rows must be an array" };
  // cards must be empty — populate step fills them.
  if (!Array.isArray(s.cards) || s.cards.length !== 0) {
    return { ok: false, reason: "cards must be an empty array (populate step fills them)" };
  }

  // Re-id cols/rows to c1..cN / r1..rN so applyOps seq counters initialize correctly.
  const cols = (s.cols as unknown[]).map((c, i) => {
    if (!c || typeof c !== "object") return null;
    const co = c as Record<string, unknown>;
    if (typeof co.label !== "string" || !co.label.trim()) return null;
    const rawId = typeof co.id === "string" && COL_ID_PATTERN.test(co.id) ? co.id : `c${i + 1}`;
    const entry: { id: string; label: string; kind?: string } = {
      id: rawId,
      label: co.label.trim(),
    };
    if (typeof co.kind === "string" && co.kind.trim()) entry.kind = co.kind.trim();
    return entry;
  });
  if (cols.some((x) => x === null)) return { ok: false, reason: "col entries must have a non-empty label" };

  const rows = (s.rows as unknown[]).map((r, i) => {
    if (!r || typeof r !== "object") return null;
    const ro = r as Record<string, unknown>;
    if (typeof ro.label !== "string" || !ro.label.trim()) return null;
    const rawId = typeof ro.id === "string" && ROW_ID_PATTERN.test(ro.id) ? ro.id : `r${i + 1}`;
    const entry: { id: string; label: string; kind?: string } = {
      id: rawId,
      label: ro.label.trim(),
    };
    if (typeof ro.kind === "string" && ro.kind.trim()) entry.kind = ro.kind.trim();
    return entry;
  });
  if (rows.some((x) => x === null)) return { ok: false, reason: "row entries must have a non-empty label" };

  // Normalize ids to be unique AND follow the `c${i+1}` / `r${i+1}` pattern if duplicates appeared.
  const normalizedCols = dedupeSeqIds(cols as { id: string; label: string; kind?: string }[], "c");
  const normalizedRows = dedupeSeqIds(rows as { id: string; label: string; kind?: string }[], "r");

  const meta =
    s.meta && typeof s.meta === "object" && !Array.isArray(s.meta)
      ? (Object.fromEntries(
          Object.entries(s.meta as Record<string, unknown>)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string")
            .map(([k, v]) => [k, v as string])
        ) as Record<string, string>)
      : {};

  const candidate: UniversalMap = {
    id: typeof s.id === "string" && s.id.trim() ? s.id : `${configId}-seed`,
    title: typeof s.title === "string" && s.title.trim() ? s.title : label,
    meta,
    cols: normalizedCols,
    rows: normalizedRows,
    cards: [] as Card[],
  };

  const finalCheck = validateMap(candidate);
  if (!finalCheck.ok) return { ok: false, reason: finalCheck.reason };
  return { ok: true, map: finalCheck.map };
}

// If two cols (or rows) ended up with the same id (possible if the LLM reused
// one), renumber them in order. We don't track cross-references at this stage
// because cards MUST be empty, so no ids are referenced elsewhere.
function dedupeSeqIds<T extends { id: string }>(xs: T[], prefix: "c" | "r"): T[] {
  const seen = new Set<string>();
  return xs.map((x, i) => {
    if (seen.has(x.id)) {
      const next = `${prefix}${i + 1}`;
      seen.add(next);
      return { ...x, id: next };
    }
    seen.add(x.id);
    return x;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-parsers for optional structured fields
// ──────────────────────────────────────────────────────────────────────────────

function parseCardMetaFields(raw: unknown): { error?: string; value?: CardMetaField[] } {
  if (raw === undefined || raw === null) return {};
  if (!Array.isArray(raw)) return { error: "cardMetaFields must be an array" };
  const out: CardMetaField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") return { error: "cardMetaFields entry must be an object" };
    const o = f as Record<string, unknown>;
    if (typeof o.key !== "string" || !o.key.trim()) return { error: "cardMetaFields entry missing key" };
    if (typeof o.label !== "string" || !o.label.trim()) return { error: `cardMetaFields ${o.key} missing label` };
    if (o.type !== "select") return { error: `cardMetaFields ${o.key}: only "select" type is supported` };
    if (!Array.isArray(o.options) || !o.options.every((x) => typeof x === "string" && (x as string).trim())) {
      return { error: `cardMetaFields ${o.key}: options must be a non-empty string[]` };
    }
    out.push({
      key: (o.key as string).trim(),
      label: (o.label as string).trim(),
      type: "select",
      options: (o.options as string[]).map((x) => x.trim()),
      ...(o.nullable === true ? { nullable: true } : {}),
    });
  }
  return { value: out.length > 0 ? out : undefined };
}

function parseHeroMetaFields(raw: unknown): { error?: string; value?: HeroMetaField[] } {
  if (raw === undefined || raw === null) return {};
  if (!Array.isArray(raw)) return { error: "heroMetaFields must be an array" };
  const out: HeroMetaField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") return { error: "heroMetaFields entry must be an object" };
    const o = f as Record<string, unknown>;
    if (typeof o.key !== "string" || !o.key.trim()) return { error: "heroMetaFields entry missing key" };
    if (typeof o.label !== "string" || !o.label.trim()) return { error: `heroMetaFields ${o.key} missing label` };
    if (typeof o.placeholder !== "string") return { error: `heroMetaFields ${o.key} missing placeholder` };
    out.push({
      key: (o.key as string).trim(),
      label: (o.label as string).trim(),
      placeholder: (o.placeholder as string).trim(),
    });
  }
  return { value: out.length > 0 ? out : undefined };
}

function optTruncString(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}
