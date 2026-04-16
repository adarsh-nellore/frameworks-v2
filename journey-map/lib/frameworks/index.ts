import type { AnyFrameworkModule } from "./types";
import { journeyMapModule } from "./journey-map";

const registry: Record<string, AnyFrameworkModule> = {
  [journeyMapModule.id]: journeyMapModule,
};

export function getFramework(id: string): AnyFrameworkModule {
  const fw = registry[id];
  if (!fw) {
    throw new Error(
      `Unknown framework id: ${id}. Known: ${Object.keys(registry).join(", ")}`
    );
  }
  return fw;
}

export function listFrameworks(): AnyFrameworkModule[] {
  return Object.values(registry);
}

export type { FrameworkModule, AnyFrameworkModule } from "./types";
