#!/usr/bin/env node
// Retry just the 2 failing cases from e2e-full.

const BASE = process.env.BASE ?? "http://localhost:3000";

async function readSse(res, timeoutMs = 240_000) {
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
  if (!result) throw new Error("no result event");
  return result;
}

async function retry(name, fn, times = 2) {
  for (let i = 1; i <= times; i++) {
    try {
      const t0 = Date.now();
      const detail = await fn();
      console.log(`✓ [${i}/${times}] ${name} (${((Date.now()-t0)/1000).toFixed(1)}s) ${detail}`);
      return true;
    } catch (e) {
      console.log(`✗ [${i}/${times}] ${name}: ${e.message}`);
      if (i === times) return false;
    }
  }
}

// 2×2 matrix — first run reported "terminated" (likely fetch timeout).
await retry("topic: 2×2 matrix prioritization", async () => {
  const fd = new FormData();
  fd.append("frameworkId", "matrix-2x2");
  fd.append("text", "feature prioritization for a B2B SaaS analytics product");
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  if (cards.length < 8) throw new Error(`only ${cards.length} cards`);
  const cols = new Set(cards.map((c) => c.colId));
  const rows = new Set(cards.map((c) => c.rowId));
  return `${cards.length} cards / ${cols.size}×${rows.size}`;
});

// Research paste — structure step invented col id "c1". Retry once to see
// if it was transient.
await retry("research paste → atom extraction path", async () => {
  const research = `
Interviewed 5 registered nurses across 3 hospital systems (Kaiser, Stanford, UCSF) in March 2026.
Pain points:
- Charting in Epic after each med pass takes 4-6 minutes per patient; nurses average 18 patients per shift.
- 72% of double-documentation comes from meds that have to be logged in both MAR and eMAR.
- Shift handoff routinely runs 20-30 minutes over; SBAR template in Epic is rarely used.
- 4 of 5 nurses keep a paper "brain" sheet because they can't trust Epic's snapshot view.
Quotes:
- "I chart twice for every controlled substance — once for the Pyxis and once for the MAR."
- "The snapshot view doesn't show telemetry alarms from the last 2 hours."
- "Our unit's badge-in policy makes the Epic lock-out 3x a shift — I give up and stay logged in."
Observations:
- All 5 nurses had Epic running on 2+ monitors with chat, huddle board, telemetry in separate tabs.
- 3 of 5 use Dragon for free-text charting; 2 of those retype because Dragon misheard drug names.
`.trim();
  const fd = new FormData();
  fd.append("frameworkId", "affinity-diagram");
  fd.append("text", research);
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  const out = await readSse(res);
  const cards = out.map.cards ?? [];
  return `${cards.length} cards`;
});
