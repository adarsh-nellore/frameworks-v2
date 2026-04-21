"use client";

import type { ArchetypeRendererProps } from "@/lib/archetypes/types";
import type { CartesianDoc, CartesianSelection } from "../schema";
import { PlotView } from "./PlotView";

export function CartesianRenderer(
  props: ArchetypeRendererProps<CartesianDoc>
) {
  const { doc, onChange, busy, selection, onSelectionChange } = props;
  return (
    <PlotView
      doc={doc}
      onChange={onChange}
      busy={busy}
      selection={selection as CartesianSelection}
      onSelectionChange={(next) =>
        onSelectionChange(next as CartesianSelection)
      }
    />
  );
}
