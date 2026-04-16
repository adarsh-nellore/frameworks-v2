import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeCodeHtml,
  serializeCodeMarkdown,
  serializeHandoffJson,
  serializeMapJson,
} from "@/lib/export";
import { DEFAULT_THEME_V1 } from "@/lib/theme";
import type { JourneyMap } from "@/lib/frameworks/journey-map/types";

const MAP: JourneyMap = {
  id: "m1",
  title: "Buyer journey <alpha>",
  persona: "Ops lead",
  stages: [
    { id: "s1", label: "Discover" },
    { id: "s2", label: "Decide" },
  ],
  rows: [
    { id: "r1", label: "Actions", kind: "actions" },
    { id: "r2", label: "Emotions", kind: "emotions" },
  ],
  cells: [
    { id: "c1", rowId: "r1", stageId: "s1", text: "Searches peer reviews online" },
    { id: "c2", rowId: "r1", stageId: "s2", text: "Starts free trial after demo" },
    { id: "c3", rowId: "r2", stageId: "s1", text: "Confused about options" },
    { id: "c4", rowId: "r2", stageId: "s2", text: "Confident in recommendation" },
  ],
};

test("serializeMapJson returns parseable map payload", () => {
  const json = serializeMapJson(MAP);
  const parsed = JSON.parse(json) as JourneyMap;
  assert.equal(parsed.title, MAP.title);
  assert.equal(parsed.cells.length, 4);
});

test("serializeHandoffJson wraps map and theme", () => {
  const json = serializeHandoffJson(MAP, DEFAULT_THEME_V1);
  const parsed = JSON.parse(json) as {
    version: number;
    map: JourneyMap;
    theme: { version: number };
  };
  assert.equal(parsed.version, 1);
  assert.equal(parsed.map.id, MAP.id);
  assert.equal(parsed.theme.version, 1);
});

test("serializeCodeMarkdown includes table structure", () => {
  const md = serializeCodeMarkdown(MAP);
  assert.ok(md.includes("# Buyer journey <alpha>"));
  assert.ok(md.includes("| Row | Discover | Decide |"));
  assert.ok(md.includes("Actions (actions)"));
});

test("serializeCodeHtml escapes dangerous content", () => {
  const html = serializeCodeHtml(MAP, DEFAULT_THEME_V1);
  assert.ok(html.includes("Journey Map embed"));
  assert.ok(html.includes("Buyer journey &lt;alpha&gt;"));
  assert.ok(html.includes("<table class=\"jm-table\">"));
});
