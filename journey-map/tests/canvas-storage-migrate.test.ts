import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCanvasState, saveCanvasState } from "../lib/canvas/storage";

// Minimal in-memory localStorage polyfill so the storage module (which guards
// on `typeof localStorage`) can run under node:test.
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    length: 0,
    clear: () => store.clear(),
    key: () => null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  } as unknown as Storage;
}

const KEY = "frameworks-canvas-v1";

test("storage v2 → v3 migration wraps flat boards into a default canvas", () => {
  installLocalStorageShim();
  const v2Blob = {
    version: 2,
    activeProjectId: "proj-a",
    projects: [
      {
        id: "proj-a",
        name: "Legacy project",
        createdAt: 100,
        activeBoardId: "b1",
        boards: [
          {
            id: "b1",
            frameworkId: "journey-map",
            title: "My journey",
            x: 0,
            y: 0,
            map: { id: "m", title: "m", meta: {}, cols: [], rows: [], cards: [] },
            selection: null,
            status: "ready",
            createdAt: 50,
          },
        ],
      },
    ],
  };
  localStorage.setItem(KEY, JSON.stringify(v2Blob));

  const loaded = loadCanvasState();
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.projects.length, 1);
  const p = loaded.projects[0];
  assert.equal(p.id, "proj-a");
  assert.equal(p.name, "Legacy project");
  assert.equal(p.canvases.length, 1);
  const c = p.canvases[0];
  assert.equal(c.name, "Canvas 1");
  assert.equal(c.boards.length, 1);
  assert.equal(c.boards[0].id, "b1");
  assert.equal(c.activeBoardId, "b1");
  assert.equal(p.activeCanvasId, c.id);
});

test("storage v1 → v3 migration wraps single workspace into project+canvas", () => {
  installLocalStorageShim();
  const v1Blob = {
    version: 1,
    activeBoardId: "b2",
    boards: [
      {
        id: "b2",
        frameworkId: "journey-map",
        title: "Old single board",
        x: 0,
        y: 0,
        map: { id: "m", title: "m", meta: {}, cols: [], rows: [], cards: [] },
        selection: null,
        status: "ready",
        createdAt: 1,
      },
    ],
  };
  localStorage.setItem(KEY, JSON.stringify(v1Blob));

  const loaded = loadCanvasState();
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.projects.length, 1);
  const p = loaded.projects[0];
  assert.equal(p.canvases.length, 1);
  const c = p.canvases[0];
  assert.equal(c.boards.length, 1);
  assert.equal(c.boards[0].id, "b2");
  assert.equal(c.activeBoardId, "b2");
});

test("storage v3 round-trip: save then load yields the same tree", () => {
  installLocalStorageShim();
  const project = {
    id: "pp",
    name: "RT",
    createdAt: 1,
    activeCanvasId: "cc",
    canvases: [
      {
        id: "cc",
        name: "Canvas A",
        createdAt: 2,
        boards: [],
        activeBoardId: null,
      },
      {
        id: "cc2",
        name: "Canvas B",
        createdAt: 3,
        boards: [],
        activeBoardId: null,
      },
    ],
  };
  const save = saveCanvasState([project], "pp");
  assert.equal(save.ok, true);
  const loaded = loadCanvasState();
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.projects.length, 1);
  assert.equal(loaded.projects[0].canvases.length, 2);
  assert.equal(loaded.projects[0].canvases[0].name, "Canvas A");
  assert.equal(loaded.projects[0].canvases[1].name, "Canvas B");
});

test("storage: missing blob returns ok:false", () => {
  installLocalStorageShim();
  const loaded = loadCanvasState();
  assert.equal(loaded.ok, false);
});
