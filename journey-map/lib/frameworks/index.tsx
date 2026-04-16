import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { FrameworkModule, AnyFrameworkModule } from "./types";
import {
  applyOps,
  validateMap,
  validateOpShape,
  type UniversalMap,
} from "./universal";
import {
  affinityDiagramConfig,
  catalogConfigs,
  competitiveMapConfig,
  journeyMapConfig,
  jtbdCanvasConfig,
  matrix2x2Config,
  type FrameworkConfig,
} from "./universal";

// ---------------------------------------------------------------------------
// Lazy-load the FrameworkGrid renderer client-side only. Framework canvases
// are inherently interactive (pointer events, selection, dnd) and don't
// benefit from SSR — eliminating SSR also resolves a hydration mismatch
// observed in the previous bespoke renderers.
// ---------------------------------------------------------------------------

type GridProps = {
  map: UniversalMap;
  onChange: (next: UniversalMap) => void;
  busy?: boolean;
  selection: unknown;
  onSelectionChange: (next: unknown) => void;
};

const FrameworkGrid = dynamic<GridProps & { config: FrameworkConfig }>(
  () =>
    import("@/components/ui/FrameworkGrid").then((m) => ({
      default: m.FrameworkGrid,
    })),
  {
    ssr: false,
    loading: () => null,
  }
);

function makeModule(config: FrameworkConfig): FrameworkModule {
  // Bind config into the renderer so the registry exposes a stable Component
  // signature ({ map, onChange, busy, selection, onSelectionChange }).
  const Bound: ComponentType<GridProps> = (props) =>
    // eslint-disable-next-line react/jsx-props-no-spreading
    <FrameworkGrid {...props} config={config} />;
  Bound.displayName = `FrameworkGrid(${config.id})`;

  return {
    id: config.id,
    label: config.label,
    config,
    seed: config.seed,
    applyOps,
    validateMap,
    validateOpShape,
    Component: Bound,
    exampleInstructions: config.exampleInstructions,
  };
}

const registry: Record<string, AnyFrameworkModule> = {
  [journeyMapConfig.id]: makeModule(journeyMapConfig),
  [matrix2x2Config.id]: makeModule(matrix2x2Config),
  [jtbdCanvasConfig.id]: makeModule(jtbdCanvasConfig),
  [competitiveMapConfig.id]: makeModule(competitiveMapConfig),
  [affinityDiagramConfig.id]: makeModule(affinityDiagramConfig),
  // Catalog configs (~20) from configs/catalog.ts — BCG, SWOT, Eisenhower,
  // Empathy Map, Stakeholder, Risk, Ansoff, Assumption, Wardley, Business
  // Model Canvas, Lean Canvas, Value Prop Canvas, Service Blueprint, User
  // Story Map, RACI, OKR, RICE, Porter's Five Forces, Double Diamond,
  // Now/Next/Later, Hypothesis Board, SCAMPER.
  ...Object.fromEntries(catalogConfigs.map((cfg) => [cfg.id, makeModule(cfg)])),
};

// Dynamic registry for user-generated custom frameworks. Populated at runtime
// via registerDynamicFramework() from the client. Server-side API routes don't
// read this (serverless = no shared memory); those routes accept a customConfig
// field in the request body instead.
const dynamicRegistry = new Map<string, AnyFrameworkModule>();

export function registerDynamicFramework(config: FrameworkConfig): AnyFrameworkModule {
  const module = makeModule(config);
  dynamicRegistry.set(config.id, module);
  return module;
}

export function unregisterDynamicFramework(id: string): void {
  dynamicRegistry.delete(id);
}

export function isDynamicFramework(id: string): boolean {
  return dynamicRegistry.has(id);
}

export function getFramework(id: string): AnyFrameworkModule {
  const fw = registry[id] ?? dynamicRegistry.get(id);
  if (!fw) {
    const knownStatic = Object.keys(registry).join(", ");
    const knownDynamic = Array.from(dynamicRegistry.keys()).join(", ") || "(none)";
    throw new Error(
      `Unknown framework id: ${id}. Static: ${knownStatic}. Dynamic: ${knownDynamic}`
    );
  }
  return fw;
}

export function listFrameworks(): AnyFrameworkModule[] {
  return [...Object.values(registry), ...dynamicRegistry.values()];
}

export type { FrameworkModule, AnyFrameworkModule } from "./types";
