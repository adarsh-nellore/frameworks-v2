import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceContentBlocks } from "../lib/pipeline/source-content";
import { extractImage } from "../lib/ingestion/extractors";
import type { IngestedSource } from "../lib/ingestion";

// 1x1 red PNG, minimum valid.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

function makeFile(name: string, data: Buffer, type: string): File {
  // `File` is a global in recent Node — falls back to a polyfill-ish shim.
  if (typeof File !== "undefined") {
    const view = new Uint8Array(data);
    return new File([view], name, { type });
  }
  throw new Error("File global not available — use Node 20+");
}

test("buildSourceContentBlocks: empty input returns empty array", () => {
  assert.deepEqual(buildSourceContentBlocks(undefined), []);
  assert.deepEqual(buildSourceContentBlocks([]), []);
});

test("buildSourceContentBlocks: PDF becomes a document content block with cache on last", () => {
  const sources: IngestedSource[] = [
    { kind: "pdf", name: "r.pdf", pdfBase64: "AAAA", estTokens: 100 },
  ];
  const blocks = buildSourceContentBlocks(sources);
  // intro text + header text + document block = 3
  assert.equal(blocks.length, 3);
  assert.equal((blocks[0] as { type: string }).type, "text");
  assert.equal((blocks[1] as { type: string }).type, "text");
  assert.equal((blocks[2] as { type: string }).type, "document");
  const doc = blocks[2] as {
    source: { media_type: string; data: string; type: string };
    cache_control?: { type: string };
  };
  assert.equal(doc.source.media_type, "application/pdf");
  assert.equal(doc.source.type, "base64");
  assert.equal(doc.source.data, "AAAA");
  assert.equal(doc.cache_control?.type, "ephemeral");
});

test("buildSourceContentBlocks: image becomes an image content block", () => {
  const sources: IngestedSource[] = [
    {
      kind: "image",
      name: "m.png",
      imageBase64: TINY_PNG_BASE64,
      mediaType: "image/png",
      estTokens: 1500,
    },
  ];
  const blocks = buildSourceContentBlocks(sources);
  assert.equal(blocks.length, 3);
  assert.equal((blocks[2] as { type: string }).type, "image");
  const img = blocks[2] as { source: { media_type: string; data: string } };
  assert.equal(img.source.media_type, "image/png");
  assert.equal(img.source.data, TINY_PNG_BASE64);
});

test("buildSourceContentBlocks: text source emits a single text block with heading", () => {
  const sources: IngestedSource[] = [
    { kind: "text", name: "notes.txt", text: "hello world", estTokens: 3 },
  ];
  const blocks = buildSourceContentBlocks(sources);
  // intro + single text block that contains both the header and the text
  assert.equal(blocks.length, 2);
  const body = blocks[1] as { type: string; text: string; cache_control?: { type: string } };
  assert.equal(body.type, "text");
  assert.ok(body.text.includes("--- notes.txt ---"));
  assert.ok(body.text.includes("hello world"));
  assert.equal(body.cache_control?.type, "ephemeral");
});

test("buildSourceContentBlocks: only the LAST block gets cache_control", () => {
  const sources: IngestedSource[] = [
    { kind: "text", name: "a.txt", text: "a", estTokens: 1 },
    { kind: "text", name: "b.txt", text: "b", estTokens: 1 },
  ];
  const blocks = buildSourceContentBlocks(sources);
  // Expect: intro + a-block + b-block  (3 blocks)
  assert.equal(blocks.length, 3);
  assert.equal((blocks[0] as { cache_control?: unknown }).cache_control, undefined);
  assert.equal((blocks[1] as { cache_control?: unknown }).cache_control, undefined);
  assert.equal(
    (blocks[2] as { cache_control?: { type: string } }).cache_control?.type,
    "ephemeral"
  );
});

test("buildSourceContentBlocks: text longer than the cap is truncated", () => {
  const big = "x".repeat(100_000);
  const sources: IngestedSource[] = [
    { kind: "text", name: "huge.txt", text: big, estTokens: 25_000 },
  ];
  const blocks = buildSourceContentBlocks(sources);
  const body = blocks[1] as { text: string };
  assert.ok(body.text.includes("[…truncated…]"));
  assert.ok(body.text.length < big.length);
});

test("extractImage: PNG round-trip preserves bytes + sets mediaType", async () => {
  const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
  const file = makeFile("pixel.png", bytes, "image/png");
  const out = await extractImage(file);
  assert.equal(out.kind, "image");
  if (out.kind !== "image") throw new Error("narrowing failure");
  assert.equal(out.mediaType, "image/png");
  assert.equal(out.name, "pixel.png");
  assert.equal(out.imageBase64, TINY_PNG_BASE64);
  assert.ok(out.estTokens > 0);
});

test("extractImage: JPG maps to image/jpeg", async () => {
  // Minimal-ish JPG header — we're testing the MIME mapping, not decoding.
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const file = makeFile("photo.jpg", bytes, "image/jpeg");
  const out = await extractImage(file);
  if (out.kind !== "image") throw new Error("expected image kind");
  assert.equal(out.mediaType, "image/jpeg");
});

test("extractImage: unsupported extension throws", async () => {
  const file = makeFile("oops.bmp", Buffer.from([0x42, 0x4d]), "image/bmp");
  await assert.rejects(() => extractImage(file), /Unsupported image type/);
});
