import type { JourneyMap } from "@/lib/frameworks/journey-map/types";
import {
  buildHandoffJson,
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

function cellByPosition(map: JourneyMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of map.cells) {
    out[`${c.rowId}:${c.stageId}`] = c.text;
  }
  return out;
}

export function serializeMapJson(map: JourneyMap): string {
  return JSON.stringify(map, null, 2);
}

export function serializeHandoffJson(map: JourneyMap, theme: ThemeV1 | null): string {
  return buildHandoffJson(map, theme);
}

export function serializeCodeMarkdown(map: JourneyMap): string {
  const cellMap = cellByPosition(map);
  const stageHeaders = map.stages.map((s) => escapeMarkdown(s.label || s.id));
  const lines = [
    `# ${map.title || "Journey Map"}`,
    "",
    `Persona: ${map.persona || "N/A"}`,
    "",
    `| Row | ${stageHeaders.join(" | ")} |`,
    `| --- | ${stageHeaders.map(() => "---").join(" | ")} |`,
  ];

  for (const row of map.rows) {
    const label = `${row.label || row.id} (${row.kind})`;
    const values = map.stages.map((stage) =>
      escapeMarkdown(firstWords(cellMap[`${row.id}:${stage.id}`] || "", 14))
    );
    lines.push(`| ${escapeMarkdown(label)} | ${values.join(" | ")} |`);
  }

  return `${lines.join("\n")}\n`;
}

export function serializeCodeHtml(map: JourneyMap, theme: ThemeV1 | null): string {
  const t = theme;
  const semanticVars = t
    ? (Object.entries(t.semantic)
        .map(([k, v]) => `  --${k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}: ${v};`)
        .join("\n"))
    : "";
  const cellMap = cellByPosition(map);
  const headerCells = map.stages
    .map((stage) => `<th>${escapeHtml(stage.label || stage.id)}</th>`)
    .join("");
  const bodyRows = map.rows
    .map((row) => {
      const rowName = `${row.label || row.id} (${row.kind})`;
      const tds = map.stages
        .map((stage) => {
          const text = cellMap[`${row.id}:${stage.id}`] || "";
          return `<td>${escapeHtml(firstWords(text, 24))}</td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(rowName)}</th>${tds}</tr>`;
    })
    .join("\n");

  return [
    "<!-- Journey Map embed: copy into Squarespace/Framer custom code block -->",
    "<div class=\"jm-wrap\">",
    "  <style>",
    "    .jm-wrap {",
    "      --canvas: 250 250 250;",
    "      --surface: 255 255 255;",
    "      --ink-primary: 40 42 47;",
    "      --ink-muted: 140 139 140;",
    "      --border-soft: 232 232 234;",
    semanticVars,
    "      color: rgb(var(--ink-primary));",
    "      font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif;",
    "      background: rgb(var(--canvas));",
    "      border: 1px solid rgb(var(--border-soft));",
    "      border-radius: 14px;",
    "      padding: 16px;",
    "      overflow-x: auto;",
    "    }",
    "    .jm-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }",
    "    .jm-meta { font-size: 12px; color: rgb(var(--ink-muted)); margin-bottom: 12px; }",
    "    .jm-table { border-collapse: collapse; width: max-content; min-width: 100%; background: rgb(var(--surface)); }",
    "    .jm-table th, .jm-table td { border: 1px solid rgb(var(--border-soft)); padding: 8px; text-align: left; vertical-align: top; font-size: 12px; line-height: 1.35; }",
    "    .jm-table thead th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ink-muted)); background: rgb(var(--canvas)); }",
    "    .jm-table tbody th { width: 180px; min-width: 180px; font-weight: 600; background: rgb(var(--canvas)); }",
    "    .jm-table td { width: 200px; min-width: 200px; }",
    "  </style>",
    `  <div class=\"jm-title\">${escapeHtml(map.title || "Journey Map")}</div>`,
    `  <div class=\"jm-meta\">Persona: ${escapeHtml(map.persona || "N/A")}</div>`,
    "  <table class=\"jm-table\">",
    "    <thead>",
    `      <tr><th>Row</th>${headerCells}</tr>`,
    "    </thead>",
    "    <tbody>",
    bodyRows,
    "    </tbody>",
    "  </table>",
    "</div>",
    "",
  ].join("\n");
}
