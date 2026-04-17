import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Theme scoping — the regression the user hit was that uploading a design
// system repainted the whole app. These tests mock enough of the DOM to
// exercise applyDesignSystem / applyTheme / clearAppliedTheme and assert
// they never touch document.documentElement unless explicitly told to.
// ---------------------------------------------------------------------------

type MockStyle = {
  props: Record<string, string>;
  setProperty: (k: string, v: string) => void;
  removeProperty: (k: string) => void;
  [Symbol.iterator]: () => Iterator<string>;
};
type MockEl = { style: MockStyle; [key: string]: unknown };

function makeStyle(): MockStyle {
  const props: Record<string, string> = {};
  const self: MockStyle = {
    props,
    setProperty(k: string, v: string) {
      props[k] = v;
    },
    removeProperty(k: string) {
      delete props[k];
    },
    [Symbol.iterator]: function* () {
      yield* Object.keys(props);
    },
  };
  return self;
}

function makeEl(): MockEl {
  return { style: makeStyle() };
}

function installDom(boardEls: MockEl[], documentEl: MockEl): void {
  const doc = {
    querySelector: (sel: string) => (sel === "[data-map-page]" ? boardEls[0] ?? null : null),
    querySelectorAll: (sel: string) =>
      sel === "[data-map-page]" ? boardEls.slice() : [],
    documentElement: documentEl,
    head: makeEl(),
    getElementById: () => null,
    createElement: () => makeEl(),
  };
  const win = { dispatchEvent: () => true };
  // Broad cast — we only exercise the tiny surface the theme helpers use.
  (globalThis as unknown as { document: unknown }).document = doc;
  (globalThis as unknown as { window: unknown }).window = win;
}

function sampleDs() {
  return {
    version: 1 as const,
    accent: "79 70 229",
    canvas: "250 250 250",
    surface: "255 255 255",
    surfaceSubtle: "249 248 249",
    inkPrimary: "40 42 47",
    inkSecondary: "62 66 75",
    inkMuted: "140 139 140",
    borderSoft: "232 232 234",
  };
}

test("applyDesignSystem: only touches the provided target, never documentElement", async () => {
  const board = makeEl();
  const docEl = makeEl();
  installDom([board], docEl);
  const { applyDesignSystem } = await import("../lib/theme/apply");
  applyDesignSystem(sampleDs() as Parameters<typeof applyDesignSystem>[0], board as unknown as HTMLElement);
  // Board got the vars.
  assert.equal(board.style.props["--accent"], "79 70 229");
  assert.equal(board.style.props["--ink-primary"], "40 42 47");
  // documentElement untouched — the regression.
  assert.equal(Object.keys(docEl.style.props).length, 0);
});

test("applyDesignSystem: falls back to first [data-map-page] when no target given", async () => {
  const b1 = makeEl();
  const b2 = makeEl();
  const docEl = makeEl();
  installDom([b1, b2], docEl);
  const { applyDesignSystem } = await import("../lib/theme/apply");
  applyDesignSystem(sampleDs() as Parameters<typeof applyDesignSystem>[0]);
  assert.equal(b1.style.props["--accent"], "79 70 229");
  // Second board not touched by the single-target call.
  assert.equal(b2.style.props["--accent"], undefined);
  assert.equal(Object.keys(docEl.style.props).length, 0);
});

test("clearAppliedTheme: removes theme CSS vars from the target", async () => {
  const board = makeEl();
  const docEl = makeEl();
  installDom([board], docEl);
  const { applyDesignSystem, clearAppliedTheme } = await import("../lib/theme/apply");
  applyDesignSystem(sampleDs() as Parameters<typeof applyDesignSystem>[0], board as unknown as HTMLElement);
  assert.ok(board.style.props["--accent"]);
  clearAppliedTheme(board as unknown as HTMLElement);
  assert.equal(board.style.props["--accent"], undefined);
  assert.equal(board.style.props["--ink-primary"], undefined);
  assert.equal(Object.keys(docEl.style.props).length, 0);
});

test("applyDesignTokenCssVars: denied keys are never written", async () => {
  const board = makeEl();
  const docEl = makeEl();
  installDom([board], docEl);
  const { applyDesignTokenCssVars } = await import("../lib/theme/apply");
  applyDesignTokenCssVars(
    {
      // Deny-listed: should NOT land.
      "--accent": "255 0 0",
      "--surface": "255 255 255",
      "--font-sans": "Comic Sans",
      "--lane-actions-accent": "0 0 0",
      // Allowed: arbitrary design token.
      "--space-4": "16px",
      "--radius-pill": "9999px",
    },
    board as unknown as HTMLElement,
  );
  assert.equal(board.style.props["--accent"], undefined);
  assert.equal(board.style.props["--surface"], undefined);
  assert.equal(board.style.props["--font-sans"], undefined);
  assert.equal(board.style.props["--lane-actions-accent"], undefined);
  assert.equal(board.style.props["--space-4"], "16px");
  assert.equal(board.style.props["--radius-pill"], "9999px");
});
