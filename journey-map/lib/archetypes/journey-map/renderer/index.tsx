"use client";

import type { ArchetypeRendererProps } from "@/lib/archetypes/types";
import type { JourneyMap } from "../types";
import { JourneyMap as JourneyMapCanvas } from "./JourneyMap";

export function JourneyMapRenderer(
  props: ArchetypeRendererProps<JourneyMap>
) {
  const { doc, onChange, busy, selection, onSelectionChange } = props;
  return (
    <JourneyMapCanvas
      map={doc}
      onChange={onChange}
      busy={busy}
      selection={selection}
      onSelectionChange={onSelectionChange}
    />
  );
}
