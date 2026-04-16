"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, FileText, Upload, X } from "lucide-react";
import type { BrandInput, ThemeV1 } from "@/lib/theme/types";

type Props = {
  onNormalized: (theme: ThemeV1, notes: string, brand?: BrandInput) => void;
  onError: (msg: string) => void;
  busy: boolean;
  onBusyChange: (b: boolean) => void;
};

const ACCEPTED_EXTS = [".json", ".css", ".html", ".htm", ".md", ".txt", ".pdf"];
const ACCEPTED_ATTR = ".json,.css,.html,.htm,.md,.txt,.pdf";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hasSupportedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

export function ThemeUploadPanel({
  onNormalized,
  onError,
  busy,
  onBusyChange,
}: Props) {
  const reduce = useReducedMotion();
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sourcesCount = (pasted.trim() ? 1 : 0) + files.length;
  const canSubmit = !busy && sourcesCount > 0;

  // Sync local error to parent
  useEffect(() => {
    if (error) onError(error);
  }, [error, onError]);

  function acceptFiles(incoming: FileList | File[]) {
    const next: File[] = [...files];
    let err: string | null = null;
    for (const f of Array.from(incoming)) {
      if (!hasSupportedExt(f.name)) {
        err = `"${f.name}": unsupported type. Allowed: ${ACCEPTED_EXTS.join(", ")}`;
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        err = `"${f.name}" is ${formatBytes(f.size)}; max per file is ${formatBytes(MAX_FILE_BYTES)}.`;
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
    setError(err);
  }

  function removeFile(idx: number) {
    setFiles((curr) => curr.filter((_, i) => i !== idx));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    onBusyChange(true);

    try {
      const fd = new FormData();
      if (pasted.trim()) fd.append("text", pasted.trim());
      files.forEach((f, i) => fd.append(`file_${i}`, f));

      const res = await fetch("/api/theme-normalize", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);

      const brandResult = data.brand as BrandInput | undefined;
      onNormalized(data.theme as ThemeV1, (data.notes as string) ?? "", brandResult);

      // Reset on success
      setPasted("");
      setFiles([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-4 space-y-3 overflow-y-auto chat-scroll">
      {/* Dropzone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          "relative flex flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed transition-colors cursor-pointer",
          "px-4 py-5 text-center",
          dragOver
            ? "border-ink-primary/50 bg-ink-primary/[0.04]"
            : "border-border-medium bg-white/40 hover:bg-white/70 hover:border-border-medium",
        ].join(" ")}
      >
        <Upload className="h-4 w-4 text-ink-muted mb-1.5" />
        <div className="text-[12px] text-ink-secondary leading-snug">
          Drop design system files
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted">
          .json .css .html .md .txt .pdf
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) acceptFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Attached file chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <motion.span
              key={`${f.name}-${i}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 border border-border-soft px-2 py-1 text-[11px] text-ink-secondary"
            >
              <FileText className="h-3 w-3 text-ink-muted shrink-0" />
              <span className="truncate max-w-[180px]" title={f.name}>
                {f.name}
              </span>
              <span className="text-ink-muted font-mono">
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                disabled={busy}
                className="text-ink-muted hover:text-ink-primary disabled:opacity-40"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          ))}
        </div>
      )}

      {/* Paste textarea (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
        >
          <ChevronDown
            className={[
              "h-3 w-3 transition-transform",
              showPaste ? "rotate-0" : "-rotate-90",
            ].join(" ")}
          />
          Or paste design tokens / CSS / brand notes
        </button>
        {showPaste && (
          <div className="mt-2">
            <textarea
              rows={4}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              disabled={busy}
              placeholder="Paste design tokens, CSS variables, brand guidelines…"
              className="w-full resize-none rounded-xl bg-white/70 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-3 py-2 text-[12px] leading-snug text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-[12px] text-rose-900">
          {error}
        </div>
      )}

      {/* Normalize button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          "w-full h-9 rounded-xl text-[13px] font-medium transition-colors",
          canSubmit
            ? "bg-ink-primary text-white hover:bg-[#1b1c20]"
            : "bg-ink-primary/10 text-ink-muted cursor-not-allowed",
        ].join(" ")}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:300ms]" />
            <span>Normalizing…</span>
          </span>
        ) : sourcesCount === 0 ? (
          "Add a source to normalize"
        ) : (
          `Normalize ${sourcesCount} source${sourcesCount === 1 ? "" : "s"} into theme`
        )}
      </button>
    </div>
  );
}
