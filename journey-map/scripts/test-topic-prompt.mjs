#!/usr/bin/env node
// Quick E2E: generate a journey map from a bare topic prompt like
// "Kaiser Permanente". Verifies the new topic-prompt fast path in
// /api/generate — without this, atom extraction rightly declines on
// thin input and the whole pipeline errors.

const BASE = process.env.BASE ?? "http://localhost:3000";

async function run(topic, framework) {
  const fd = new FormData();
  fd.append("frameworkId", framework);
  fd.append("text", topic);
  fd.append("fidelityMode", "false");
  const res = await fetch(BASE + "/api/generate", { method: "POST", body: fd });
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  let err = null;
  const deadline = Date.now() + 120_000;
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

try {
  console.log("→ topic: 'Kaiser Permanente', framework: journey-map");
  const r = await run("Kaiser Permanente", "journey-map");
  const cards = r.map.cards ?? [];
  console.log(`  ops: ${r.debug?.opsCount}, cards: ${cards.length}`);
  if (cards.length === 0) throw new Error("zero cards in result");
  console.log(`  first card: ${cards[0].text.slice(0, 90)}`);
  console.log("✓ passed\n");
} catch (e) {
  console.log(`✗ failed: ${e.message}`);
  process.exit(1);
}

try {
  console.log("→ topic: 'affinity diagram of issues with login UX', framework: affinity-diagram");
  const r = await run("affinity diagram of issues with login UX", "affinity-diagram");
  const cards = r.map.cards ?? [];
  console.log(`  ops: ${r.debug?.opsCount}, cards: ${cards.length}`);
  if (cards.length === 0) throw new Error("zero cards in result");
  console.log(`  first card: ${cards[0].text.slice(0, 90)}`);
  console.log("✓ passed\n");
} catch (e) {
  console.log(`✗ failed: ${e.message}`);
  process.exit(1);
}
