import type { UniversalMap, Card } from "@/lib/frameworks/universal/types";
import {
  buildHandoffJson,
  type DesignSystem,
  type ThemeV1,
} from "@/lib/theme";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function firstWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

// Group cards by (rowId, colId) — multiple cards stack into a "\n• " list.
function cardsByPosition(map: UniversalMap): Record<string, Card[]> {
  const out: Record<string, Card[]> = {};
  for (const c of map.cards) {
    const k = `${c.rowId}:${c.colId}`;
    (out[k] = out[k] ?? []).push(c);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.order - b.order);
  return out;
}

function joinCardsForCell(cards: Card[] | undefined, maxWords: number): string {
  if (!cards || cards.length === 0) return "";
  if (cards.length === 1) return firstWords(cards[0].text, maxWords);
  return cards.map((c) => `• ${firstWords(c.text, maxWords)}`).join(" ");
}

export function serializeMapJson(map: UniversalMap): string {
  return JSON.stringify(map, null, 2);
}

export function serializeHandoffJson(
  map: UniversalMap,
  theme: ThemeV1 | null,
  designSystem?: DesignSystem | null
): string {
  return buildHandoffJson(map, theme, designSystem ?? null);
}

export function serializeCodeMarkdown(map: UniversalMap): string {
  const cellMap = cardsByPosition(map);
  const colHeaders = map.cols.map((c) => escapeMarkdown(c.label || c.id));
  const lines = [
    `# ${map.title || "Map"}`,
    "",
    ...Object.entries(map.meta).map(([k, v]) => `${k}: ${v}`),
    map.meta && Object.keys(map.meta).length ? "" : "",
    `| Row | ${colHeaders.join(" | ")} |`,
    `| --- | ${colHeaders.map(() => "---").join(" | ")} |`,
  ].filter((l) => l !== undefined);

  for (const row of map.rows) {
    const label = `${row.label || row.id}${row.kind ? ` (${row.kind})` : ""}`;
    const values = map.cols.map((col) =>
      escapeMarkdown(joinCardsForCell(cellMap[`${row.id}:${col.id}`], 14))
    );
    lines.push(`| ${escapeMarkdown(label)} | ${values.join(" | ")} |`);
  }

  // Connectors — appended beneath the table using card text so the output
  // reads without having to cross-reference card ids.
  if (map.connectors && map.connectors.length > 0) {
    const textById = new Map(map.cards.map((c) => [c.id, c.text]));
    lines.push("");
    lines.push("## Connectors");
    lines.push("");
    for (const e of map.connectors) {
      const from = textById.get(e.sourceCardId) ?? e.sourceCardId;
      const to = textById.get(e.targetCardId) ?? e.targetCardId;
      const kind = e.kind ? ` _(${e.kind})_` : "";
      const label = e.label ? ` — "${e.label}"` : "";
      lines.push(
        `- ${escapeMarkdown(firstWords(from, 10))} → ${escapeMarkdown(firstWords(to, 10))}${kind}${label}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// ── Lane color palette — mirrors globals.css lane-* tokens ──────────────────
// Each entry: [tint, accent, border, chipBg, chipText]
type LaneColors = { tint: string; accent: string; border: string };

const LANE_COLORS: Record<string, LaneColors> = {
  actions:           { tint: "rgb(240,249,255)", accent: "rgb(2,132,199)",   border: "rgb(56,189,248)" },
  touchpoints:       { tint: "rgb(245,243,255)", accent: "rgb(124,58,237)",  border: "rgb(167,139,250)" },
  thoughts:          { tint: "rgb(255,251,235)", accent: "rgb(217,119,6)",   border: "rgb(251,191,36)" },
  emotions:          { tint: "rgb(255,241,242)", accent: "rgb(225,29,72)",   border: "rgb(251,113,133)" },
  pain_points:       { tint: "rgb(254,242,242)", accent: "rgb(220,38,38)",   border: "rgb(248,113,113)" },
  opportunities:     { tint: "rgb(236,253,245)", accent: "rgb(5,150,105)",   border: "rgb(52,211,153)" },
  metrics:           { tint: "rgb(240,253,250)", accent: "rgb(13,148,136)",  border: "rgb(45,212,191)" },
  stakeholders:      { tint: "rgb(238,242,255)", accent: "rgb(79,70,229)",   border: "rgb(129,140,248)" },
  systems:           { tint: "rgb(250,250,250)", accent: "rgb(63,63,70)",    border: "rgb(161,161,170)" },
  channels:          { tint: "rgb(236,254,255)", accent: "rgb(8,145,178)",   border: "rgb(34,211,238)" },
  decisions:         { tint: "rgb(253,244,255)", accent: "rgb(192,38,211)",  border: "rgb(232,121,249)" },
  artifacts:         { tint: "rgb(250,250,249)", accent: "rgb(87,83,78)",    border: "rgb(168,162,158)" },
  functional_jobs:   { tint: "rgb(240,253,255)", accent: "rgb(14,116,144)",  border: "rgb(103,232,249)" },
  emotional_jobs:    { tint: "rgb(253,242,248)", accent: "rgb(219,39,119)",  border: "rgb(244,114,182)" },
  social_jobs:       { tint: "rgb(245,243,255)", accent: "rgb(109,40,217)",  border: "rgb(167,139,250)" },
  desired_outcomes:  { tint: "rgb(236,253,245)", accent: "rgb(4,120,87)",    border: "rgb(52,211,153)" },
  current_solutions: { tint: "rgb(238,242,255)", accent: "rgb(67,56,202)",   border: "rgb(129,140,248)" },
  context_triggers:  { tint: "rgb(236,254,255)", accent: "rgb(6,182,212)",   border: "rgb(103,232,249)" },
  hiring_criteria:   { tint: "rgb(240,253,250)", accent: "rgb(15,118,110)",  border: "rgb(45,212,191)" },
  firing_criteria:   { tint: "rgb(255,251,235)", accent: "rgb(180,83,9)",    border: "rgb(251,191,36)" },
  observation:       { tint: "rgb(240,249,255)", accent: "rgb(3,105,161)",   border: "rgb(56,189,248)" },
  quote:             { tint: "rgb(245,243,255)", accent: "rgb(109,40,217)",  border: "rgb(167,139,250)" },
  insight:           { tint: "rgb(255,251,235)", accent: "rgb(217,119,6)",   border: "rgb(251,191,36)" },
  need:              { tint: "rgb(236,253,245)", accent: "rgb(5,150,105)",   border: "rgb(52,211,153)" },
  subject:           { tint: "rgb(238,242,255)", accent: "rgb(79,70,229)",   border: "rgb(129,140,248)" },
  competitor:        { tint: "rgb(255,255,255)", accent: "rgb(100,116,139)", border: "rgb(203,213,225)" },
  criterion:         { tint: "rgb(250,250,249)", accent: "rgb(87,83,78)",    border: "rgb(168,162,158)" },
  quadrant_high:     { tint: "rgb(236,253,245)", accent: "rgb(5,150,105)",   border: "rgb(52,211,153)" },
  quadrant_low:      { tint: "rgb(248,250,252)", accent: "rgb(100,116,139)", border: "rgb(203,213,225)" },
  neutral:           { tint: "rgb(255,255,255)", accent: "rgb(100,116,139)", border: "rgb(203,213,225)" },
};
const NEUTRAL_LANE: LaneColors = LANE_COLORS.neutral;

function laneColors(kind: string | undefined): LaneColors {
  if (!kind) return NEUTRAL_LANE;
  return LANE_COLORS[kind.toLowerCase()] ?? NEUTRAL_LANE;
}

/** Convert **bold** and ==highlight== markup to HTML. */
function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=]+)==/g, '<mark style="background:rgba(253,224,71,0.5);border-radius:2px;padding:0 2px">$1</mark>');
}

// Convert "R G B" triplet to "rgb(R, G, B)" or with alpha to "rgba(...)".
function triplet(t: string, alpha?: number): string {
  const p = t.trim().split(/\s+/).map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return "rgb(0,0,0)";
  if (alpha === undefined) return `rgb(${p[0]},${p[1]},${p[2]})`;
  return `rgba(${p[0]},${p[1]},${p[2]},${alpha})`;
}

export function serializeCodeHtml(
  map: UniversalMap,
  _theme: ThemeV1 | null,
  designSystem?: DesignSystem | null
): string {
  const ncols = map.cols.length;
  const colWidth = Math.max(160, Math.min(240, Math.floor(820 / ncols)));
  const labelWidth = 160;
  const ds = designSystem;

  // Col headers
  const colHeaderCells = map.cols
    .map((col) => `      <div class="col-header">${escapeHtml(col.label || col.id)}</div>`)
    .join("\n");

  // Row sections. When a DesignSystem is present we drop the pastel per-kind
  // tints and render every row with the design system's surface + accent —
  // the export inherits the same uniform "one tool, one palette" feel as the
  // app. Without DS we keep the legacy lane coloring for back-compat.
  const rowSections = map.rows.map((row) => {
    const lc = ds
      ? {
          tint: triplet(ds.surface),
          accent: triplet(ds.accent),
          border: triplet(ds.borderSoft),
        }
      : laneColors(row.kind);
    const cells = map.cols
      .map((col) => {
        const cards = (map.cards
          .filter((c) => c.colId === col.id && c.rowId === row.id && !c.parentCardId)
          .sort((a, b) => a.order - b.order));
        const children = (cid: string) =>
          map.cards.filter((c) => c.parentCardId === cid).sort((a, b) => a.order - b.order);
        const cardHtml = cards.map((card) => {
          const subs = children(card.id);
          const subsHtml = subs.length
            ? `<ul class="sub-list">${subs.map((s) => `<li>${renderInline(s.text)}</li>`).join("")}</ul>`
            : "";
          return `<div class="card">${renderInline(card.text)}${subsHtml}</div>`;
        }).join("");
        return `      <div class="cell">${cardHtml}</div>`;
      })
      .join("\n");

    const kindLabel = row.kind
      ? `<span class="row-kind-badge" style="background:${lc.tint};color:${lc.accent};border-color:${lc.border}">${escapeHtml(row.kind.replace(/_/g, " "))}</span>`
      : "";

    return [
      `    <div class="map-row" style="--row-tint:${lc.tint};--row-accent:${lc.accent};--row-border:${lc.border}">`,
      `      <div class="row-label">`,
      `        <div class="row-label-bar"></div>`,
      `        <div class="row-label-content">`,
      `          <span class="row-label-name">${escapeHtml(row.label || row.id)}</span>`,
      kindLabel,
      `        </div>`,
      `      </div>`,
      cells,
      `    </div>`,
    ].join("\n");
  }).join("\n");

  const metaEntries = Object.entries(map.meta).filter(([, v]) => v);
  const metaHtml = metaEntries.length
    ? `<p class="meta">${metaEntries.map(([k, v]) => `<span class="meta-key">${escapeHtml(k)}</span> ${escapeHtml(v)}`).join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  // Palette — drive the whole export off the imported design system when one
  // exists, otherwise fall back to the old hardcoded chrome so exports without
  // a DS still render sensibly.
  const palette = ds
    ? {
        canvas: triplet(ds.canvas),
        surface: triplet(ds.surface),
        surfaceSubtle: triplet(ds.surfaceSubtle),
        inkPrimary: triplet(ds.inkPrimary),
        inkSecondary: triplet(ds.inkSecondary),
        inkMuted: triplet(ds.inkMuted),
        borderSoft: triplet(ds.borderSoft),
        accent: triplet(ds.accent),
        shadowCard: `0 1px 2px ${triplet(ds.inkPrimary, 0.04)}`,
        shadowHero: `0 1px 3px ${triplet(ds.inkPrimary, 0.04)}, 0 8px 24px -8px ${triplet(ds.inkPrimary, 0.08)}`,
        radiusSm: ds.radiusSm ?? "6px",
        radiusMd: ds.radiusMd ?? "10px",
        radiusLg: ds.radiusLg ?? "16px",
        fontFamily: ds.fontSans ?? `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`,
      }
    : {
        canvas: "#f5f5f6",
        surface: "#ffffff",
        surfaceSubtle: "#f5f5f6",
        inkPrimary: "#282a2f",
        inkSecondary: "#3e424b",
        inkMuted: "#8c8b8c",
        borderSoft: "#e8e8ea",
        accent: "rgb(79,70,229)",
        shadowCard: "0 1px 2px rgba(40,42,47,.04)",
        shadowHero: "0 1px 3px rgba(40,42,47,.04), 0 8px 24px -8px rgba(40,42,47,.08)",
        radiusSm: "6px",
        radiusMd: "10px",
        radiusLg: "16px",
        fontFamily: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`,
      };
  const fontFamilyStack = palette.fontFamily.includes(",")
    ? palette.fontFamily
    : `"${palette.fontFamily}", system-ui, sans-serif`;

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:${fontFamilyStack};
      background:${palette.canvas};
      color:${palette.inkPrimary};
      -webkit-font-smoothing:antialiased;
      padding:32px 24px 64px;
    }
    .page{max-width:100%;margin:0 auto}
    .page-header{
      margin-bottom:24px;
      padding:20px 24px;
      background:${palette.surface};
      border:1px solid ${palette.borderSoft};
      border-radius:${palette.radiusLg};
      box-shadow:${palette.shadowHero};
      position:relative;
      overflow:hidden;
    }
    .page-header::before{
      content:"";
      position:absolute;left:0;top:0;bottom:0;width:3px;
      background:${palette.accent};
    }
    .page-header-eyebrow{
      display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;
    }
    .page-header-eyebrow-dot{
      width:18px;height:3px;border-radius:2px;background:${palette.accent};opacity:.7;
    }
    .page-header-eyebrow-text{
      font-size:9px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;
      color:${palette.inkMuted};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    }
    .title{font-size:24px;font-weight:700;letter-spacing:-.02em;color:${palette.inkPrimary};margin-bottom:6px}
    .meta{font-size:12px;color:${palette.inkMuted};display:flex;flex-wrap:wrap;gap:4px 0}
    .meta-key{font-weight:600;color:${palette.inkSecondary}}
    .board{
      overflow-x:auto;padding-bottom:16px;
      background:${palette.surface};
      border:1px solid ${palette.borderSoft};
      border-radius:${palette.radiusLg};
    }
    .board-inner{display:inline-block;min-width:100%}
    .col-headers{
      display:grid;
      grid-template-columns:${labelWidth}px repeat(${ncols},${colWidth}px);
      position:sticky;top:0;z-index:2;
      background:${palette.surface};
      padding-bottom:4px;
    }
    .col-header-spacer{width:${labelWidth}px}
    .col-header{
      padding:12px 14px;
      font-size:11px;font-weight:600;
      text-transform:uppercase;letter-spacing:.08em;
      color:${palette.inkMuted};
      border-bottom:1px solid ${palette.borderSoft};
    }
    .map-row{
      display:grid;
      grid-template-columns:${labelWidth}px repeat(${ncols},${colWidth}px);
      border-bottom:1px solid ${palette.borderSoft};
    }
    .map-row:last-child{border-bottom:none}
    .row-label{
      position:sticky;left:0;z-index:1;
      display:flex;align-items:stretch;
      background:${palette.surface};
      border-right:1px solid ${palette.borderSoft};
    }
    .row-label-bar{
      width:3px;flex-shrink:0;
      background:var(--row-accent);
      border-radius:0;
    }
    .row-label-content{
      padding:12px 12px;
      display:flex;flex-direction:column;gap:5px;
      justify-content:flex-start;
    }
    .row-label-name{
      font-size:13px;font-weight:600;color:${palette.inkPrimary};
      line-height:1.3;word-break:break-word;
    }
    .row-kind-badge{
      display:inline-block;
      font-size:9px;font-weight:600;
      text-transform:uppercase;letter-spacing:.08em;
      padding:2px 6px;border-radius:${palette.radiusSm};
      border:1px solid;
      white-space:nowrap;
    }
    .cell{
      padding:10px 10px;
      background:var(--row-tint);
      border-right:1px solid ${palette.borderSoft};
      display:flex;flex-direction:column;gap:6px;
      align-items:stretch;
    }
    .cell:last-child{border-right:none}
    .card{
      background:${palette.surface};
      border:1px solid ${palette.borderSoft};
      border-radius:${palette.radiusMd};
      padding:9px 11px;
      font-size:12px;line-height:1.45;
      color:${palette.inkSecondary};
      box-shadow:${palette.shadowCard};
    }
    .card strong{color:${palette.inkPrimary};font-weight:600}
    .card mark{background:${triplet(ds ? ds.accent : "79 70 229", 0.14)};color:${palette.inkPrimary};border-radius:2px;padding:0 2px}
    .sub-list{
      margin-top:6px;padding-left:14px;
      list-style:disc;
    }
    .sub-list li{font-size:11px;color:${palette.inkSecondary};margin-top:3px;line-height:1.4}
    .export-footer{
      margin-top:40px;
      text-align:center;
      font-size:10px;color:${palette.inkMuted};
      letter-spacing:.08em;text-transform:uppercase;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    }
  `.trim();

  // If the design system uses a Google Font by name, inject the <link> so the
  // standalone export can render in that face. Full font stacks (contain commas
  // or quotes) are treated as already-resolved and we don't fetch them.
  const googleFontLinks: string[] = [];
  if (ds?.fontSans && !/[,"']/.test(ds.fontSans)) {
    googleFontLinks.push(
      `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ds.fontSans)}:wght@400;500;600;700&display=swap" />`
    );
  }
  if (ds?.fontMono && !/[,"']/.test(ds.fontMono)) {
    googleFontLinks.push(
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ds.fontMono)}:wght@400;500&display=swap" />`
    );
  }

  const eyebrowText = ds ? "Framework Handoff" : "Map";

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(map.title || "Map")}</title>`,
    ...googleFontLinks.map((l) => `  ${l}`),
    "  <style>",
    css.split("\n").map((l) => `    ${l}`).join("\n"),
    "  </style>",
    "</head>",
    "<body>",
    "  <div class=\"page\">",
    "    <div class=\"page-header\">",
    "      <div class=\"page-header-eyebrow\">",
    "        <span class=\"page-header-eyebrow-dot\"></span>",
    `        <span class="page-header-eyebrow-text">${escapeHtml(eyebrowText)}</span>`,
    "      </div>",
    `      <h1 class="title">${escapeHtml(map.title || "Map")}</h1>`,
    metaHtml ? `      ${metaHtml}` : "",
    "    </div>",
    "    <div class=\"board\">",
    "      <div class=\"board-inner\">",
    "        <div class=\"col-headers\">",
    "          <div class=\"col-header-spacer\"></div>",
    colHeaderCells.split("\n").map((l) => `    ${l}`).join("\n"),
    "        </div>",
    rowSections,
    "      </div>",
    "    </div>",
    `    <p class="export-footer">Exported from Frameworks · ${new Date().toLocaleDateString()}</p>`,
    "  </div>",
    "</body>",
    "</html>",
    "",
  ].filter((l) => l !== "").join("\n");
}
