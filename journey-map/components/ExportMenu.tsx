"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  Code2,
  Download,
  FileJson2,
  FileText,
  Image,
  Share,
} from "lucide-react";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import {
  captureBoardPdfBlob,
  captureBoardPngBlob,
  copyText,
  loadDesignSystemForExport,
  loadThemeForExport,
  serializeCodeHtml,
  serializeCodeMarkdown,
  serializeHandoffJson,
  serializeMapJson,
  timestampTag,
  triggerDownload,
} from "@/lib/export";

type Props = { map: UniversalMap; exportLocked?: boolean };

type ExportItem = {
  label: string;
  icon: React.ReactNode;
  action: () => Promise<void> | void;
  locked?: boolean;
  group: string;
};

export function ExportMenu({ map, exportLocked = false }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setMsg(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const run = useCallback(
    async (label: string, action: () => Promise<void> | void) => {
      setMsg(null);
      setBusy(label);
      try {
        await action();
        setMsg({ ok: true, text: label });
        setTimeout(() => setMsg((prev) => (prev?.text === label ? null : prev)), 2000);
      } catch (err) {
        setMsg({
          ok: false,
          text: err instanceof Error ? err.message : "Export failed.",
        });
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const items: ExportItem[] = [
    {
      label: "Map JSON",
      icon: <FileJson2 className="h-3.5 w-3.5" />,
      group: "download",
      action: () => {
        const json = serializeMapJson(map);
        triggerDownload(
          new Blob([json], { type: "application/json;charset=utf-8" }),
          `journey-map-${timestampTag()}.json`
        );
      },
    },
    {
      label: "Handoff JSON",
      icon: <FileJson2 className="h-3.5 w-3.5" />,
      group: "download",
      action: () => {
        const json = serializeHandoffJson(map, loadThemeForExport(), loadDesignSystemForExport());
        triggerDownload(
          new Blob([json], { type: "application/json;charset=utf-8" }),
          `journey-map-handoff-${timestampTag()}.json`
        );
      },
    },
    {
      label: "PNG image",
      icon: <Image className="h-3.5 w-3.5" />,
      group: "download",
      locked: exportLocked,
      action: async () => {
        if (exportLocked)
          throw new Error("Unavailable while generation is in progress.");
        const blob = await captureBoardPngBlob();
        triggerDownload(blob, `journey-map-${timestampTag()}.png`);
      },
    },
    {
      label: "PDF document",
      icon: <FileText className="h-3.5 w-3.5" />,
      group: "download",
      locked: exportLocked,
      action: async () => {
        if (exportLocked)
          throw new Error("Unavailable while generation is in progress.");
        const blob = await captureBoardPdfBlob();
        triggerDownload(blob, `journey-map-${timestampTag()}.pdf`);
      },
    },
    {
      label: "Standalone HTML",
      icon: <Code2 className="h-3.5 w-3.5" />,
      group: "download",
      action: () => {
        const html = serializeCodeHtml(map, loadThemeForExport(), loadDesignSystemForExport());
        triggerDownload(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          `framework-export-${timestampTag()}.html`
        );
      },
    },
    {
      label: "Map JSON",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      group: "copy",
      action: async () => {
        await copyText(serializeMapJson(map));
      },
    },
    {
      label: "Handoff JSON",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      group: "copy",
      action: async () => {
        await copyText(serializeHandoffJson(map, loadThemeForExport(), loadDesignSystemForExport()));
      },
    },
    {
      label: "Standalone HTML",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      group: "copy",
      action: async () => {
        await copyText(serializeCodeHtml(map, loadThemeForExport(), loadDesignSystemForExport()));
      },
    },
    {
      label: "Markdown",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      group: "copy",
      action: async () => {
        await copyText(serializeCodeMarkdown(map));
      },
    },
  ];

  const downloads = items.filter((i) => i.group === "download");
  const copies = items.filter((i) => i.group === "copy");

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink-primary/[0.06] hover:bg-ink-primary/[0.10] text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors shrink-0"
        title="Export"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Share className="h-3 w-3" />
        Export
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close export menu"
            className="fixed inset-0 z-[45] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className={[
              "absolute right-0 top-full mt-2 z-[60]",
              "w-[17rem] rounded-xl border border-border-soft bg-surface shadow-panel",
              "flex flex-col overflow-hidden text-left",
            ].join(" ")}
            role="menu"
            aria-label="Export"
          >
            {/* Header */}
            <div className="px-3.5 pt-3 pb-2">
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-muted">
                Export
              </p>
            </div>

            {/* Download section */}
            <div className="px-1.5 pb-1">
              <p className="px-2 pb-1 text-[10px] font-mono uppercase tracking-[0.15em] text-ink-muted/70">
                Download
              </p>
              {downloads.map((item) => (
                <button
                  key={`dl-${item.label}`}
                  type="button"
                  role="menuitem"
                  disabled={busy !== null || item.locked}
                  onClick={() =>
                    void run(`Downloaded ${item.label}`, item.action)
                  }
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] text-ink-secondary hover:text-ink-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {item.icon}
                  <span>{item.label}</span>
                  <Download className="h-3 w-3 ml-auto text-ink-muted/50" />
                </button>
              ))}
            </div>

            <div className="mx-3 h-px bg-border-soft" />

            {/* Copy section */}
            <div className="px-1.5 pt-1 pb-1.5">
              <p className="px-2 pb-1 text-[10px] font-mono uppercase tracking-[0.15em] text-ink-muted/70">
                Copy to clipboard
              </p>
              {copies.map((item) => (
                <button
                  key={`cp-${item.label}`}
                  type="button"
                  role="menuitem"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`Copied ${item.label}`, item.action)
                  }
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] text-ink-secondary hover:text-ink-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Status message */}
            {msg ? (
              <div className="px-3 pb-2.5">
                <p
                  className={[
                    "text-[11px] rounded-lg px-2.5 py-1.5 border",
                    msg.ok
                      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                      : "text-rose-700 bg-rose-50 border-rose-100",
                  ].join(" ")}
                >
                  {msg.text}
                </p>
              </div>
            ) : null}

            {exportLocked ? (
              <div className="px-3 pb-2.5">
                <p className="text-[10px] text-ink-muted leading-snug">
                  PNG / PDF disabled while generation is running.
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
