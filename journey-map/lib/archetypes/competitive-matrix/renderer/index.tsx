"use client";

import type { ArchetypeRendererProps } from "@/lib/archetypes/types";
import type {
  CompetitiveMatrixDoc,
  CompetitiveMatrixSelection,
} from "../schema";
import { MatrixView } from "./MatrixView";

export function CompetitiveMatrixRenderer(
  props: ArchetypeRendererProps<CompetitiveMatrixDoc>
) {
  const { doc, onChange, busy, selection, onSelectionChange } = props;
  return (
    <MatrixView
      doc={doc}
      onChange={onChange}
      busy={busy}
      selection={selection as CompetitiveMatrixSelection}
      onSelectionChange={(next) =>
        onSelectionChange(next as CompetitiveMatrixSelection)
      }
    />
  );
}
