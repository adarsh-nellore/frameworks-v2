import type { ComponentType } from "react";
import type { UniversalMap } from "./universal/types";
import type { Op } from "./universal/ops";
import type { FrameworkConfig } from "./universal/config";

// ---------------------------------------------------------------------------
// All frameworks now share one schema (UniversalMap), one op set (Op), and
// one tool (apply_operations). The FrameworkModule is just a thin wrapper
// that pairs a config with the universal renderer + reducer.
// ---------------------------------------------------------------------------

export type FrameworkModule = {
  // Identity
  id: string;
  label: string;
  config: FrameworkConfig;
  seed: UniversalMap;

  // Reducer (delegated to universal/applyOps)
  applyOps: (
    map: UniversalMap,
    ops: Op[]
  ) =>
    | { ok: true; map: UniversalMap }
    | { ok: false; reason: string; failedAtIndex: number };

  validateMap: (m: unknown) =>
    | { ok: true; map: UniversalMap }
    | { ok: false; reason: string };

  validateOpShape: (op: unknown) => boolean;

  // Renderer
  Component: ComponentType<{
    map: UniversalMap;
    onChange: (next: UniversalMap) => void;
    busy?: boolean;
    selection: unknown;
    onSelectionChange: (next: unknown) => void;
  }>;

  // Toolbar suggestion pills
  exampleInstructions: string[];
};

// Type-erased alias kept for backward compatibility with existing code.
export type AnyFrameworkModule = FrameworkModule;
