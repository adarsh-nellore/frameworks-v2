"use client";

import { useMemo, useState } from "react";
import type {
  CellValue,
  ColumnDef,
  TableDoc,
  TableSelection,
} from "../schema";

type Props = {
  doc: TableDoc;
  onChange: (next: TableDoc) => void;
  busy?: boolean;
  selection: TableSelection;
  onSelectionChange: (next: TableSelection) => void;
};

type SortState = {
  columnId: string;
  direction: "asc" | "desc";
} | null;

export function TableView({
  doc,
  onChange,
  busy,
  selection,
  onSelectionChange,
}: Props) {
  const [sort, setSort] = useState<SortState>(null);
  const [editing, setEditing] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);

  const rows = useMemo(() => {
    if (!sort) return doc.rows;
    const col = doc.columns.find((c) => c.id === sort.columnId);
    if (!col) return doc.rows;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...doc.rows].sort((a, b) => {
      const av = a.values[sort.columnId];
      const bv = b.values[sort.columnId];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return direction * (av - bv);
      return direction * String(av).localeCompare(String(bv));
    });
  }, [doc.columns, doc.rows, sort]);

  const toggleSort = (columnId: string) => {
    setSort((prev) => {
      if (!prev || prev.columnId !== columnId)
        return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  };

  const updateCell = (rowId: string, columnId: string, next: CellValue) => {
    const nextRows = doc.rows.map((r) =>
      r.id === rowId ? { ...r, values: { ...r.values, [columnId]: next } } : r
    );
    onChange({ ...doc, rows: nextRows });
  };

  const toggleRowSelected = (rowId: string) => {
    const current =
      selection && selection.type === "rows" ? selection.ids : [];
    const nextIds = current.includes(rowId)
      ? current.filter((id) => id !== rowId)
      : [...current, rowId];
    onSelectionChange(nextIds.length ? { type: "rows", ids: nextIds } : null);
  };

  const exportCsv = () => {
    const header = doc.columns.map((c) => csvEscape(c.label)).join(",");
    const body = doc.rows
      .map((r) =>
        doc.columns
          .map((c) => csvEscape(formatCell(r.values[c.id], c)))
          .join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(doc.title)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-full overflow-x-auto">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          {doc.subtitle && (
            <p className="text-sm text-neutral-500">{doc.subtitle}</p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {doc.columns.length} column{doc.columns.length === 1 ? "" : "s"} ·{" "}
            {doc.rows.length} row{doc.rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={busy}
          className="text-xs px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </header>

      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="w-8 px-2 py-2" aria-hidden />
              {doc.columns.map((col) => {
                const isSorted = sort?.columnId === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className="text-left px-3 py-2 font-medium cursor-pointer select-none"
                    onClick={() => toggleSort(col.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      <TypeBadge type={col.type} />
                      {isSorted && (
                        <span className="text-neutral-400 text-[10px]">
                          {sort?.direction === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected =
                selection?.type === "rows" &&
                selection.ids.includes(row.id);
              return (
                <tr
                  key={row.id}
                  className={
                    isSelected
                      ? "bg-amber-50 border-t border-neutral-100"
                      : "border-t border-neutral-100 hover:bg-neutral-50/50"
                  }
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelected(row.id)}
                      aria-label={`select row ${row.id}`}
                    />
                  </td>
                  {doc.columns.map((col) => {
                    const value = row.values[col.id] ?? null;
                    const isEditing =
                      editing?.rowId === row.id && editing?.columnId === col.id;
                    return (
                      <td
                        key={col.id}
                        className="px-3 py-1.5 align-top"
                        onClick={() =>
                          !busy && setEditing({ rowId: row.id, columnId: col.id })
                        }
                      >
                        {isEditing ? (
                          <CellEditor
                            column={col}
                            value={value}
                            onCommit={(next) => {
                              updateCell(row.id, col.id, next);
                              setEditing(null);
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <CellView value={value} column={col} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={doc.columns.length + 1}
                  className="px-3 py-6 text-center text-neutral-500 text-sm"
                >
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: ColumnDef["type"] }) {
  const styles: Record<ColumnDef["type"], string> = {
    text: "bg-neutral-100 text-neutral-600",
    number: "bg-blue-50 text-blue-700",
    enum: "bg-violet-50 text-violet-700",
    date: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wide ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function CellView({
  value,
  column,
}: {
  value: CellValue;
  column: ColumnDef;
}) {
  if (value === null || value === undefined)
    return <span className="text-neutral-300">—</span>;
  if (column.type === "enum")
    return (
      <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full">
        {String(value)}
      </span>
    );
  if (column.type === "number")
    return <span className="tabular-nums">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function CellEditor({
  column,
  value,
  onCommit,
  onCancel,
}: {
  column: ColumnDef;
  value: CellValue;
  onCommit: (next: CellValue) => void;
  onCancel: () => void;
}) {
  if (column.type === "enum" && column.options) {
    return (
      <select
        autoFocus
        value={value === null ? "" : String(value)}
        onChange={(e) =>
          onCommit(e.target.value === "" ? null : e.target.value)
        }
        onBlur={onCancel}
        className="w-full px-1 py-0.5 text-sm border border-neutral-300 rounded"
      >
        <option value="">—</option>
        {column.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
      defaultValue={value === null ? "" : String(value)}
      onBlur={(e) => commitTyped(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitTyped((e.target as HTMLInputElement).value);
        else if (e.key === "Escape") onCancel();
      }}
      className="w-full px-1 py-0.5 text-sm border border-neutral-300 rounded"
    />
  );

  function commitTyped(raw: string) {
    if (raw === "") {
      onCommit(null);
      return;
    }
    if (column.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) return onCancel();
      onCommit(n);
      return;
    }
    onCommit(raw);
  }
}

function formatCell(value: CellValue, col: ColumnDef): string {
  if (value === null || value === undefined) return "";
  if (col.type === "number") return String(value);
  return String(value);
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "table";
}
