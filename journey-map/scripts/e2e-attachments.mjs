#!/usr/bin/env node
// End-to-end verification for the attachments + vision feature.
// Hits the running dev server — make sure it's up on $BASE (default :3000).

import { deflateSync, crc32 } from "node:zlib";

const BASE = process.env.BASE ?? "http://localhost:3000";

// Build a valid NxN RGB PNG in-memory so the image passes Anthropic's vision
// minimums (1x1 pixel test images are rejected). Encodes the image via
// zlib/deflate — no native deps.
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
  ihdr[8] = 8;  // 8-bit
  ihdr[9] = 2;  // RGB
  // A visible pattern — four quadrants of distinct colors so Claude can
  // actually describe something. Red, green, blue, yellow.
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
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TEST_PNG_BYTES = makeTestPng(200);

const results = [];

function ok(name) { results.push({ name, ok: true }); console.log(`✓ ${name}`); }
function fail(name, detail) { results.push({ name, ok: false, detail }); console.log(`✗ ${name}\n    ${detail}`); }

async function run(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    ok(`${name} (${dt}s)`);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Dev server is reachable
// ──────────────────────────────────────────────────────────────────────────
await run("dev server: GET / returns 200", async () => {
  const res = await fetch(BASE + "/");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Describe rejects bad MIME / input
// ──────────────────────────────────────────────────────────────────────────
await run("describe: rejects too-short description", async () => {
  const res = await fetch(BASE + "/api/framework-describe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: "x" }),
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.ok !== false) throw new Error(`expected ok:false, got ${JSON.stringify(body)}`);
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Generate rejects no-source request
// ──────────────────────────────────────────────────────────────────────────
await run("generate: requires at least one source", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "journey-map");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  // Either 400 JSON or an SSE "error" event — both fine.
  if (res.status !== 400 && res.status !== 200) {
    throw new Error(`unexpected status ${res.status}`);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Describe with text paste completes (requires Anthropic key — small call)
// ──────────────────────────────────────────────────────────────────────────
await run("describe: text paste → returns populated map", async () => {
  const fd = new FormData();
  fd.append("description", "a 2x2 matrix of ideas to ship");
  fd.append("existingIds", JSON.stringify([]));
  fd.append(
    "url_0",
    // An innocuous public page that Jina Reader handles cleanly.
    "https://example.com"
  );
  const res = await fetch(BASE + "/api/framework-describe", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`status ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.ok) throw new Error(`describe returned ok:false — ${body.error}`);
  if (!body.config) throw new Error("no config returned");
  if (!body.populatedMap) throw new Error("no populatedMap returned");
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Describe with PNG image → vision path exercised
// ──────────────────────────────────────────────────────────────────────────
await run("describe: PNG image → reasons through vision", async () => {
  const fd = new FormData();
  fd.append("description", "an affinity diagram of observations from this image");
  fd.append("existingIds", JSON.stringify([]));
  const blob = new Blob([TEST_PNG_BYTES], { type: "image/png" });
  fd.append("file_0", new File([blob], "quadrants.png", { type: "image/png" }));
  const res = await fetch(BASE + "/api/framework-describe", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`status ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.ok) throw new Error(`describe returned ok:false — ${body.error}`);
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Generate with PNG → SSE completes without error event
// ──────────────────────────────────────────────────────────────────────────
await run("generate: PNG image → SSE emits result", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "affinity-diagram");
  fd.append("text", "cluster observations about the UI in the image");
  fd.append("fidelityMode", "false");
  const blob = new Blob([TEST_PNG_BYTES], { type: "image/png" });
  fd.append("file_0", new File([blob], "quadrants.png", { type: "image/png" }));
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`status ${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawResult = false;
  let sawError = null;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const chunk of buf.split("\n\n")) {
      if (!chunk.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(chunk.slice(6));
        if (data.phase === "result") sawResult = true;
        if (data.phase === "error") sawError = data.message;
      } catch { /* partial frame */ }
    }
    if (sawResult || sawError) break;
  }
  if (sawError) throw new Error(`SSE error: ${sawError}`);
  if (!sawResult) throw new Error("SSE ended without a result frame");
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${passed}/${results.length} passed${failed > 0 ? `  (${failed} failed)` : ""}`);
process.exit(failed > 0 ? 1 : 0);
