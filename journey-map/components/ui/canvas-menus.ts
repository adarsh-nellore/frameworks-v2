import {
  ArrowDown,
  ArrowDownFromLine,
  ArrowLeft,
  ArrowLeftFromLine,
  ArrowRight,
  ArrowRightFromLine,
  ArrowUp,
  ArrowUpFromLine,
  Copy,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Op } from "@/lib/frameworks/universal/ops";
import type { Card, Col, Row, UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { MenuItem } from "./CanvasContextMenu";

/**
 * Menu builders — one per canvas surface. Each returns a list of MenuItems
 * ready to pass to useCanvasContextMenu().open(). Centralizing them here
 * keeps every right-click affordance consistent across layouts and guarantees
 * the same op vocabulary is used for agent-visible change tracking.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Card menu
// ─────────────────────────────────────────────────────────────────────────────

export function cardMenu(args: {
  map: UniversalMap;
  card: Card;
  commitOps: (ops: Op[]) => void;
  beginEdit?: () => void;
  beginRename?: () => void;
  canAddSubItem?: boolean;
  onStartConnector?: () => void;
}): MenuItem[] {
  const { map, card, commitOps, beginEdit, canAddSubItem = true, onStartConnector } = args;

  const items: MenuItem[] = [
    {
      label: "Edit text",
      icon: Pencil,
      onClick: () => beginEdit?.(),
      disabled: !beginEdit,
    },
  ];

  if (canAddSubItem) {
    items.push({
      label: "Add sub-item",
      icon: Plus,
      onClick: () => {
        commitOps([
          {
            op: "addCard",
            colId: card.colId,
            rowId: card.rowId,
            text: "",
            parentCardId: card.id,
          },
        ]);
      },
    });
  }

  if (onStartConnector) {
    items.push({
      label: "Draw connector",
      onClick: onStartConnector,
    });
  }

  items.push({ kind: "divider" });
  items.push({
    label: "Duplicate",
    icon: Copy,
    onClick: () => {
      commitOps([
        {
          op: "addCard",
          colId: card.colId,
          rowId: card.rowId,
          text: card.text,
          meta: card.meta ? { ...card.meta } : undefined,
        },
      ]);
    },
    shortcut: "⌘D",
  });
  items.push({
    label: "Delete card",
    icon: Trash2,
    onClick: () => commitOps([{ op: "removeCard", cardId: card.id }]),
    destructive: true,
    shortcut: "⌫",
  });

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row menu
// ─────────────────────────────────────────────────────────────────────────────

export function rowMenu(args: {
  map: UniversalMap;
  row: Row;
  config: FrameworkConfig;
  commitOps: (ops: Op[]) => void;
  beginRename?: () => void;
}): MenuItem[] {
  const { map, row, config, commitOps, beginRename } = args;
  const idx = map.rows.findIndex((r) => r.id === row.id);
  const rowNoun = config.rowNoun || "row";
  const locked = !!config.fixedRows;

  const items: MenuItem[] = [];
  if (beginRename) {
    items.push({ label: "Rename", icon: Pencil, onClick: beginRename });
  }
  // Reorder is a pure permutation — it doesn't add or remove rows, so it's
  // allowed even when fixedRows locks the structure.
  if (map.rows.length > 1) {
    items.push({
      label: "Move up",
      icon: ArrowUp,
      onClick: () => commitOps([{ op: "moveRow", rowId: row.id, toIndex: idx - 1 }]),
      disabled: idx <= 0,
    });
    items.push({
      label: "Move down",
      icon: ArrowDown,
      onClick: () => commitOps([{ op: "moveRow", rowId: row.id, toIndex: idx + 1 }]),
      disabled: idx >= map.rows.length - 1,
    });
  }
  if (!locked) {
    if (items.length > 1) items.push({ kind: "divider" });
    items.push({
      label: `Insert ${rowNoun} above`,
      icon: ArrowUpFromLine,
      onClick: () =>
        commitOps([{ op: "addRow", label: `New ${rowNoun}`, atIndex: idx }]),
    });
    items.push({
      label: `Insert ${rowNoun} below`,
      icon: ArrowDownFromLine,
      onClick: () =>
        commitOps([{ op: "addRow", label: `New ${rowNoun}`, atIndex: idx + 1 }]),
    });
    items.push({
      label: "Duplicate",
      icon: Copy,
      onClick: () =>
        commitOps([
          {
            op: "addRow",
            label: `${row.label} copy`,
            kind: row.kind,
            atIndex: idx + 1,
          },
        ]),
      shortcut: "⌘D",
    });
    items.push({ kind: "divider" });
    items.push({
      label: `Delete ${rowNoun}`,
      icon: Trash2,
      onClick: () => commitOps([{ op: "removeRow", rowId: row.id }]),
      destructive: true,
      shortcut: "⌫",
    });
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column menu
// ─────────────────────────────────────────────────────────────────────────────

export function colMenu(args: {
  map: UniversalMap;
  col: Col;
  config: FrameworkConfig;
  commitOps: (ops: Op[]) => void;
  beginRename?: () => void;
}): MenuItem[] {
  const { map, col, config, commitOps, beginRename } = args;
  const idx = map.cols.findIndex((c) => c.id === col.id);
  const colNoun = config.colNoun || "column";
  const locked = !!config.fixedCols;

  const items: MenuItem[] = [];
  if (beginRename) {
    items.push({ label: "Rename", icon: Pencil, onClick: beginRename });
  }
  // Reorder is a pure permutation — it doesn't add or remove cols, so it's
  // allowed even when fixedCols locks the structure.
  if (map.cols.length > 1) {
    items.push({
      label: "Move left",
      icon: ArrowLeft,
      onClick: () => commitOps([{ op: "moveCol", colId: col.id, toIndex: idx - 1 }]),
      disabled: idx <= 0,
    });
    items.push({
      label: "Move right",
      icon: ArrowRight,
      onClick: () => commitOps([{ op: "moveCol", colId: col.id, toIndex: idx + 1 }]),
      disabled: idx >= map.cols.length - 1,
    });
  }
  if (!locked) {
    if (items.length > 1) items.push({ kind: "divider" });
    items.push({
      label: `Insert ${colNoun} before`,
      icon: ArrowLeftFromLine,
      onClick: () =>
        commitOps([{ op: "addCol", label: `New ${colNoun}`, atIndex: idx }]),
    });
    items.push({
      label: `Insert ${colNoun} after`,
      icon: ArrowRightFromLine,
      onClick: () =>
        commitOps([{ op: "addCol", label: `New ${colNoun}`, atIndex: idx + 1 }]),
    });
    items.push({
      label: "Duplicate",
      icon: Copy,
      onClick: () =>
        commitOps([
          {
            op: "addCol",
            label: `${col.label} copy`,
            kind: col.kind,
            atIndex: idx + 1,
          },
        ]),
      shortcut: "⌘D",
    });
    items.push({ kind: "divider" });
    items.push({
      label: `Delete ${colNoun}`,
      icon: Trash2,
      onClick: () => commitOps([{ op: "removeCol", colId: col.id }]),
      destructive: true,
      shortcut: "⌫",
    });
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty-slot menu (empty cell inside a row/col intersection)
// ─────────────────────────────────────────────────────────────────────────────

export function slotMenu(args: {
  colId: string;
  rowId: string;
  commitOps: (ops: Op[]) => void;
}): MenuItem[] {
  const { colId, rowId, commitOps } = args;
  return [
    {
      label: "Add card here",
      icon: Plus,
      onClick: () => commitOps([{ op: "addCard", colId, rowId, text: "" }]),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Board (canvas) menu
// ─────────────────────────────────────────────────────────────────────────────

export function boardMenu(args: {
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}): MenuItem[] {
  const items: MenuItem[] = [];
  if (args.onRename) {
    items.push({ label: "Rename board", icon: Pencil, onClick: args.onRename });
  }
  if (args.onDuplicate) {
    items.push({
      label: "Duplicate board",
      icon: Copy,
      onClick: args.onDuplicate,
      shortcut: "⌘D",
    });
  }
  if (args.onDelete) {
    if (items.length > 0) items.push({ kind: "divider" });
    items.push({
      label: "Delete board",
      icon: Trash2,
      onClick: args.onDelete,
      destructive: true,
      shortcut: "⌘⌫",
    });
  }
  return items;
}
