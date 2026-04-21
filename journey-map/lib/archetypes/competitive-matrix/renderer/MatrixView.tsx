"use client";

import { useMemo } from "react";
import type {
  CapabilityDef,
  Cell,
  CellValue,
  CompetitiveMatrixDoc,
  CompetitiveMatrixSelection,
  PresenceValue,
} from "../schema";

type Props = {
  doc: CompetitiveMatrixDoc;
  onChange: (next: CompetitiveMatrixDoc) => void;
  busy?: boolean;
  selection: CompetitiveMatrixSelection;
  onSelectionChange: (next: CompetitiveMatrixSelection) => void;
};

export function MatrixView({
  doc,
  busy,
  selection,
  onSelectionChange,
}: Props) {
  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of doc.cells) {
      m.set(`${c.competitorId}:${c.capabilityId}`, c);
    }
    return m;
  }, [doc.cells]);

  const isRowSelected = (id: string) =>
    selection?.type === "competitor" && selection.id === id;
  const isColSelected = (id: string) =>
    selection?.type === "capability" && selection.id === id;
  const isCellSelected = (rid: string, cid: string) =>
    selection?.type === "cell" &&
    selection.competitorId === rid &&
    selection.capabilityId === cid;

  return (
    <div className="p-6 overflow-auto">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">{doc.title}</h2>
        {doc.subject && (
          <p className="text-sm text-neutral-500">{doc.subject}</p>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          {doc.competitors.length} competitor
          {doc.competitors.length === 1 ? "" : "s"} ·{" "}
          {doc.capabilities.length} capabilit
          {doc.capabilities.length === 1 ? "y" : "ies"}
        </p>
      </header>

      <div className="inline-block border border-neutral-200 rounded-lg overflow-hidden">
        <table className="border-collapse text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium min-w-[180px] sticky left-0 bg-neutral-50 z-10">
                Competitor
              </th>
              {doc.capabilities.map((cap) => (
                <th
                  key={cap.id}
                  scope="col"
                  className={`px-3 py-2 text-left font-medium min-w-[140px] border-l border-neutral-200 cursor-pointer select-none ${
                    isColSelected(cap.id) ? "bg-amber-50" : ""
                  }`}
                  onClick={() =>
                    onSelectionChange(
                      isColSelected(cap.id)
                        ? null
                        : { type: "capability", id: cap.id }
                    )
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span>{cap.label}</span>
                    <KindBadge kind={cap.kind} maxScore={cap.maxScore} />
                  </div>
                  {cap.description && (
                    <div className="text-xs font-normal text-neutral-500 mt-0.5">
                      {cap.description}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.competitors.map((comp) => (
              <tr
                key={comp.id}
                className={`border-t border-neutral-100 ${
                  isRowSelected(comp.id) ? "bg-amber-50/40" : ""
                }`}
              >
                <th
                  scope="row"
                  className={`px-3 py-2 text-left font-medium align-top sticky left-0 z-10 cursor-pointer select-none ${
                    isRowSelected(comp.id) ? "bg-amber-50" : "bg-white"
                  }`}
                  onClick={() =>
                    onSelectionChange(
                      isRowSelected(comp.id)
                        ? null
                        : { type: "competitor", id: comp.id }
                    )
                  }
                >
                  <div>{comp.label}</div>
                  {comp.tagline && (
                    <div className="text-xs font-normal text-neutral-500 mt-0.5">
                      {comp.tagline}
                    </div>
                  )}
                </th>
                {doc.capabilities.map((cap) => {
                  const cell = cellMap.get(`${comp.id}:${cap.id}`);
                  const selected = isCellSelected(comp.id, cap.id);
                  return (
                    <td
                      key={cap.id}
                      className={`px-3 py-2 align-top border-l border-neutral-100 cursor-pointer ${
                        selected ? "bg-amber-100/60" : ""
                      }`}
                      onClick={() =>
                        onSelectionChange(
                          selected
                            ? null
                            : {
                                type: "cell",
                                competitorId: comp.id,
                                capabilityId: cap.id,
                              }
                        )
                      }
                    >
                      <CellView
                        cell={cell}
                        capability={cap}
                        disabled={!!busy}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KindBadge({
  kind,
  maxScore,
}: {
  kind: CapabilityDef["kind"];
  maxScore?: number;
}) {
  const label =
    kind === "presence"
      ? "y/n/~"
      : kind === "score"
        ? `/${maxScore ?? "?"}`
        : "txt";
  const styles = {
    presence: "bg-emerald-50 text-emerald-700",
    score: "bg-blue-50 text-blue-700",
    text: "bg-neutral-100 text-neutral-600",
  }[kind];
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wide ${styles}`}
    >
      {label}
    </span>
  );
}

function CellView({
  cell,
  capability,
}: {
  cell: Cell | undefined;
  capability: CapabilityDef;
  disabled: boolean;
}) {
  const value: CellValue = cell?.value ?? null;
  if (value === null || value === undefined) {
    return <span className="text-neutral-300">—</span>;
  }
  return (
    <div>
      <CellValueView value={value} capability={capability} />
      {cell?.note && (
        <div className="text-xs text-neutral-500 mt-0.5">{cell.note}</div>
      )}
    </div>
  );
}

function CellValueView({
  value,
  capability,
}: {
  value: CellValue;
  capability: CapabilityDef;
}) {
  if (capability.kind === "presence") {
    return <PresenceGlyph value={value as PresenceValue} />;
  }
  if (capability.kind === "score") {
    const max = capability.maxScore ?? 0;
    const score = typeof value === "number" ? value : 0;
    return <ScoreBar value={score} max={max} />;
  }
  return <span className="text-sm">{String(value)}</span>;
}

function PresenceGlyph({ value }: { value: PresenceValue }) {
  if (value === "yes")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <span aria-hidden className="text-base">✓</span>
        <span className="text-xs">yes</span>
      </span>
    );
  if (value === "no")
    return (
      <span className="inline-flex items-center gap-1 text-rose-700">
        <span aria-hidden className="text-base">✗</span>
        <span className="text-xs">no</span>
      </span>
    );
  if (value === "partial")
    return (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <span aria-hidden className="text-base">◐</span>
        <span className="text-xs">partial</span>
      </span>
    );
  return <span className="text-neutral-300">—</span>;
}

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="h-1.5 w-full bg-neutral-100 rounded overflow-hidden">
        <div
          className="h-full bg-blue-500"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <div className="text-xs text-neutral-600 mt-0.5 tabular-nums">
        {value}
        <span className="text-neutral-400"> / {max}</span>
      </div>
    </div>
  );
}
