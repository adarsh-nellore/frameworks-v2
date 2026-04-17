#!/usr/bin/env node
// Thorough E2E against the dev server — covers every generation path the
// user relies on, with quality assertions on the content itself. Requires
// ANTHROPIC_API_KEY (the dev server reads it from .env.local).
//
// Usage: node scripts/e2e-full.mjs  (dev server running on http://localhost:3000)

import { deflateSync, crc32 } from "node:zlib";

const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];

function ok(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? "  " + detail : ""}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`✗ ${name}\n    ${detail}`);
}
async function run(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    ok(`${name} (${dt}s)`, detail ?? "");
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

// ── Small helpers ──────────────────────────────────────────────────────────
async function readSse(res, timeoutMs = 180_000) {
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  let err = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const chunk of buf.split("\n\n")) {
      if (!chunk.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(chunk.slice(6));
        if (ev.phase === "result") result = ev;
        else if (ev.phase === "error") err = ev.message;
      } catch {}
    }
    if (result || err) break;
  }
  if (err) throw new Error(err);
  if (!result) throw new Error("no result event within timeout");
  return result;
}

function countCardsWith(cards, re) {
  return cards.filter((c) => re.test(c.text ?? "")).length;
}

function hasGenericContent(cards) {
  const generic = [
    /\bstakeholders are aligned\b/i,
    /\bbetter communication needed\b/i,
    /\bimprove user experience\b/i,
    /\bincrease efficiency\b/i,
  ];
  for (const re of generic) {
    const hit = cards.find((c) => re.test(c.text ?? ""));
    if (hit) return hit.text;
  }
  return null;
}

// Tiny NxN colored PNG — real enough for Anthropic vision.
function makeTestPng(size = 200) {
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(size * 3 + 1);
  const rows = [];
  for (let y = 0; y < size; y++) {
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const top = y < size / 2;
      const left = x < size / 2;
      const [r, g, b] = top
        ? left ? [220, 40, 40] : [40, 180, 60]
        : left ? [40, 80, 200] : [230, 200, 40];
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Tests ──────────────────────────────────────────────────────────────────

await run("server reachable", async () => {
  const res = await fetch(BASE + "/");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
});

// ── Generation: topic prompts (short text → fast path) ─────────────────────
await run("topic: 'Kaiser Permanente' → journey map, substantive content", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "journey-map");
  fd.append("text", "Kaiser Permanente");
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 20) throw new Error(`only ${cards.length} cards (expected ≥20)`);
  const highlightCards = countCardsWith(cards, /==[^=]+==/);
  if (highlightCards < 5) throw new Error(`only ${highlightCards} cards use ==highlight== (expected ≥5)`);
  const boldCards = countCardsWith(cards, /\*\*[^*]+\*\*/);
  if (boldCards < 5) throw new Error(`only ${boldCards} cards use **bold** (expected ≥5)`);
  const generic = hasGenericContent(cards);
  if (generic) throw new Error(`generic card detected: "${generic}"`);
  return `${cards.length} cards, ${highlightCards} hl, ${boldCards} bold`;
});

await run("topic: '2x2 matrix for feature prioritization'", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "matrix-2x2");
  fd.append("text", "feature prioritization for a B2B SaaS analytics product");
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 12) throw new Error(`only ${cards.length} cards (expected ≥12)`);
  // Every quadrant should have cards — distribution check.
  const cols = new Set(cards.map((c) => c.colId));
  const rows = new Set(cards.map((c) => c.rowId));
  if (cols.size < 2 || rows.size < 2) {
    throw new Error(`cards not spread across quadrants — cols=${cols.size} rows=${rows.size}`);
  }
  return `${cards.length} cards across ${cols.size} cols × ${rows.size} rows`;
});

await run("topic: 'affinity diagram of login UX issues'", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "affinity-diagram");
  fd.append("text", "affinity diagram of login UX issues observed in usability tests");
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 12) throw new Error(`only ${cards.length} cards (expected ≥12)`);
  return `${cards.length} cards`;
});

// ── Generation: longer research material (atom-extraction path) ────────────
await run("research paste → atom-extraction path produces populated map", async () => {
  const research = `
Interviewed 5 registered nurses across 3 hospital systems (Kaiser, Stanford, UCSF) in March 2026.
Recurring pain points:
- Charting in Epic after each med pass takes 4-6 minutes per patient; nurses average 18 patients per shift.
- 72% of double-documentation comes from meds that have to be logged in both MAR and eMAR.
- Shift handoff routinely runs 20-30 minutes over; SBAR template in Epic is rarely used.
- 4 of 5 nurses keep a paper "brain" sheet because they can't trust Epic's snapshot view at a glance.
Verbatim quotes:
- "I chart twice for every controlled substance — once for the Pyxis and once for the MAR."
- "The snapshot view doesn't show telemetry alarms from the last 2 hours, so I scroll the whole timeline."
- "Our unit's badge-in policy makes the Epic lock-out 3x a shift — I give up and just stay logged in."
Observations:
- All 5 nurses had Epic running on 2+ monitors with chat, huddle board, and telemetry in separate tabs.
- 3 of 5 use Dragon for free-text charting; 2 of those retype because Dragon misheard drug names.
- Every nurse mentioned workload tier A (ICU) patients require 90+ minutes of charting per shift.
`.trim();
  const fd = new FormData();
  fd.append("frameworkId", "affinity-diagram");
  fd.append("text", research);
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 8) throw new Error(`only ${cards.length} cards`);
  // Content should reflect the input's specific details.
  const referencesSpecifics =
    cards.some((c) => /Epic|MAR|eMAR|Pyxis|Dragon|telemetry|SBAR|Kaiser|Stanford|UCSF/.test(c.text ?? ""));
  if (!referencesSpecifics) throw new Error("cards don't reference any specifics from the research");
  return `${cards.length} cards, specifics preserved`;
});

// ── Generation: image (vision) ─────────────────────────────────────────────
await run("image upload → vision pipeline returns a populated map", async () => {
  const png = makeTestPng(200);
  const fd = new FormData();
  fd.append("frameworkId", "affinity-diagram");
  fd.append("text", "cluster visible elements from the attached image");
  fd.append("fidelityMode", "false");
  fd.append("file_0", new File([new Blob([png], { type: "image/png" })], "quads.png", { type: "image/png" }));
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 4) throw new Error(`only ${cards.length} cards`);
  return `${cards.length} cards`;
});

// ── Describe path (no framework selected) ──────────────────────────────────
await run("describe: topic alone → synthesizes a custom framework config", async () => {
  const fd = new FormData();
  fd.append("description", "a map of regulatory pathways for a Class II medical device to reach FDA clearance");
  fd.append("existingIds", JSON.stringify([]));
  const res = await fetch(BASE + "/api/framework-describe", { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.ok || !body.config || !body.populatedMap) {
    throw new Error(`missing config/populatedMap — ${JSON.stringify(body).slice(0, 200)}`);
  }
  const cards = body.populatedMap.cards ?? [];
  if (cards.length < 10) throw new Error(`only ${cards.length} populated cards`);
  return `framework "${body.config.label}" with ${cards.length} cards`;
});

// ── Summary ────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${passed}/${results.length} passed${failed > 0 ? `  (${failed} failed)` : ""}`);
process.exit(failed > 0 ? 1 : 0);
