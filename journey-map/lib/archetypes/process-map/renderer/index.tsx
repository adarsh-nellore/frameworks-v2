"use client";

import type { ArchetypeRendererProps } from "@/lib/archetypes/types";
import type { ProcessMapDoc, ProcessMapSelection } from "../schema";
import { ProcessMapView } from "./ProcessMapView";

export function ProcessMapRenderer(
  props: ArchetypeRendererProps<ProcessMapDoc>
) {
  const { doc, onChange, busy, selection, onSelectionChange } = props;
  return (
    <ProcessMapView
      doc={doc}
      onChange={onChange}
      busy={busy}
      selection={selection as ProcessMapSelection}
      onSelectionChange={(next) =>
        onSelectionChange(next as ProcessMapSelection)
      }
    />
  );
}
