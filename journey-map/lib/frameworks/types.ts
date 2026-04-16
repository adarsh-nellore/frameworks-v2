import type { ComponentType } from "react";

// Generic shape for a framework module.
// TMap is the framework's map type (e.g., JourneyMap).
// TOp is the framework's op union (e.g., journey-map's Op).
export type FrameworkModule<TMap, TOp> = {
  id: string;
  label: string;
  seed: TMap;

  // Agent
  systemPrompt: string;
  toolName: string;
  toolDescription: string;
  toolSchema: object;
  renderUserPayload: (map: TMap, instruction: string, focus?: unknown) => string;

  // Reducer + validation
  applyOps: (
    map: TMap,
    ops: TOp[]
  ) =>
    | { ok: true; map: TMap }
    | { ok: false; reason: string; failedAtIndex: number };
  validateMap: (m: unknown) =>
    | { ok: true; map: TMap }
    | { ok: false; reason: string };
  validateOpShape: (op: unknown) => boolean;

  // Render (selection is framework-specific agent/canvas focus; use `unknown` in registry.)
  Component: ComponentType<{
    map: TMap;
    onChange: (next: TMap) => void;
    busy?: boolean;
    selection: unknown;
    onSelectionChange: (next: unknown) => void;
  }>;

  // Toolbar chips
  exampleInstructions: string[];
};

// Type-erased variant for the registry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFrameworkModule = FrameworkModule<any, any>;
