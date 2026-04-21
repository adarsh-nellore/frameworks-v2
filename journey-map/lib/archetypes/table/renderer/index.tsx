"use client";

import type { ArchetypeRendererProps } from "@/lib/archetypes/types";
import type { TableDoc, TableSelection } from "../schema";
import { TableView } from "./TableView";

export function TableRenderer(props: ArchetypeRendererProps<TableDoc>) {
  const { doc, onChange, busy, selection, onSelectionChange } = props;
  return (
    <TableView
      doc={doc}
      onChange={onChange}
      busy={busy}
      selection={selection as TableSelection}
      onSelectionChange={(next) =>
        onSelectionChange(next as TableSelection)
      }
    />
  );
}
