"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  FileText,
  Link2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// PromptComposer — shared prompt+sources UI.
//
// Used by:
//  - The "/" landing page (hero size, centered, big textarea)
//  - The in-canvas copilot "generate" mode (compact, embedded)
//
// This is a controlled-ish input collector: it owns its own state (prompt,
// files, urls, title, persona) and emits a single payload on submit. It knows
// NOTHING about which endpoint to call — the parent decides (describe vs
// generate) based on whether a framework is selected.
// ──────────────────────────────────────────────────────────────────────────────

const ACCEPTED_EXTS = [".pdf", ".docx", ".txt", ".md", ".json", ".csv", ".tsv"];
const ACCEPTED_ATTR = ACCEPTED_EXTS.join(",");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export type PromptSubmitPayload = {
  text: string;
  files: File[];
  urls: string[];
  title?: string;
  persona?: string;
  fidelityMode: boolean;
};

export type PromptComposerProps = {
  /** Visual size preset. Hero = big landing variant. Compact = copilot-embedded. */
  size?: "hero" | "compact";
  /** Disabled + spinner while the parent's submit handler is running. */
  busy?: boolean;
  /** Parent-managed error message. */
  error?: string | null;
  /** Placeholder for the main textarea. */
  placeholder?: string;
  /** Submit button label (defaults to "Generate"). */
  submitLabel?: string;
  /** Optional slot rendered in the header — typically a framework selector. */
  headerSlot?: ReactNode;
  /** Called on submit with the collected payload. */
  onSubmit: (payload: PromptSubmitPayload) => void;
  /** Show the higher-fidelity toggle. Default true. */
  allowFidelityToggle?: boolean;
  /** Show optional title/persona hints. Default true. */
  allowHints?: boolean;
  /** Require a prompt OR a source (file/url). Default true. Set false to allow empty submit in hero mode. */
  requireSource?: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hasSupportedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

export function PromptComposer({
  size = "hero",
  busy = false,
  error = null,
  placeholder,
  submitLabel = "Generate",
  headerSlot,
  onSubmit,
  allowFidelityToggle = true,
  allowHints = true,
  requireSource = true,
}: PromptComposerProps) {
  const reduce = useReducedMotion();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [title, setTitle] = useState("");
  const [persona, setPersona] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [fidelityMode, setFidelityMode] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0) + text.length;
  const sourcesCount = (text.trim() ? 1 : 0) + files.length + urls.length;
  const canSubmit = !busy && (!requireSource || sourcesCount > 0) && totalSize <= MAX_TOTAL_BYTES;

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
    setLocalError(err);
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

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      setLocalError("URL must start with http:// or https://");
      return;
    }
    if (urls.includes(u)) {
      setUrlDraft("");
      return;
    }
    setUrls((curr) => [...curr, u]);
    setUrlDraft("");
    setLocalError(null);
  }

  function removeUrl(idx: number) {
    setUrls((curr) => curr.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      text: text.trim(),
      files,
      urls,
      title: title.trim() || undefined,
      persona: persona.trim() || undefined,
      fidelityMode,
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isHero = size === "hero";
  const textareaRows = isHero ? 5 : 4;
  const combinedError = error ?? localError;

  return (
    <div className={isHero ? "space-y-4" : "space-y-3"}>
      {/* Header — label + optional slot (e.g. framework selector) */}
      {(headerSlot || isHero) && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className={isHero ? "h-4 w-4 text-ink-primary" : "h-3.5 w-3.5 text-ink-primary"} />
            <span className={[
              "font-mono uppercase text-ink-muted",
              isHero ? "text-[10px] tracking-[0.24em]" : "text-[9px] tracking-[0.22em]",
            ].join(" ")}>
              {isHero ? "Describe what you want to make" : "From source material"}
            </span>
          </div>
          {headerSlot && <div className="min-w-0">{headerSlot}</div>}
        </div>
      )}

      {/* Prompt textarea */}
      <textarea
        rows={textareaRows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        placeholder={placeholder ?? "A 2×2 matrix for prioritizing features by impact and effort… or drop files below."}
        className={[
          "w-full resize-none rounded-2xl bg-white border border-border-soft",
          "hover:border-border-medium focus:border-ink-primary focus:bg-white",
          "outline-none transition-colors text-ink-primary placeholder:text-ink-muted",
          isHero ? "px-5 py-4 text-[15px] leading-relaxed" : "px-3.5 py-3 text-[13px] leading-snug",
          busy ? "opacity-60" : "",
        ].join(" ")}
      />

      {/* Dropzone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          "relative flex flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed transition-colors cursor-pointer text-center",
          isHero ? "px-4 py-4" : "px-3 py-3",
          dragOver
            ? "border-ink-primary/50 bg-ink-primary/[0.04]"
            : "border-border-medium bg-white/40 hover:bg-white/70",
        ].join(" ")}
      >
        <Upload className={isHero ? "h-4 w-4 text-ink-muted mb-1.5" : "h-3.5 w-3.5 text-ink-muted mb-1"} />
        <div className={["text-ink-secondary leading-snug", isHero ? "text-[12px]" : "text-[11px]"].join(" ")}>
          Drop transcripts, personas, research notes
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-widest uppercase text-ink-muted">
          .pdf .docx .txt .md .json .csv .tsv
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

      {/* Attached files */}
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
              <span className="truncate max-w-[200px]" title={f.name}>{f.name}</span>
              <span className="text-ink-muted font-mono">{formatBytes(f.size)}</span>
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

      {/* URL input */}
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-ink-muted shrink-0" />
        <input
          type="url"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          disabled={busy}
          placeholder="Add a URL…"
          className="flex-1 rounded-lg bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2.5 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
        />
        <button
          type="button"
          onClick={addUrl}
          disabled={busy || !urlDraft.trim()}
          className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink-primary disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {urls.map((u, i) => (
            <span
              key={`${u}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 border border-border-soft px-2 py-1 text-[11px] text-ink-secondary"
            >
              <Link2 className="h-3 w-3 text-ink-muted shrink-0" />
              <span className="truncate max-w-[240px]" title={u}>{u}</span>
              <button
                type="button"
                onClick={() => removeUrl(i)}
                disabled={busy}
                className="text-ink-muted hover:text-ink-primary disabled:opacity-40"
                aria-label={`Remove ${u}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Hints (collapsible) */}
      {allowHints && (
        <div>
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
          >
            <ChevronDown className={["h-3 w-3 transition-transform", showHints ? "rotate-0" : "-rotate-90"].join(" ")} />
            Optional hints
          </button>
          {showHints && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                placeholder="Title"
                className="rounded-lg bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2.5 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
              />
              <input
                type="text"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                disabled={busy}
                placeholder="Persona"
                className="rounded-lg bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2.5 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
              />
            </div>
          )}
        </div>
      )}

      {/* Fidelity toggle */}
      {allowFidelityToggle && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={fidelityMode}
            onChange={(e) => setFidelityMode(e.target.checked)}
            disabled={busy}
            className="h-3.5 w-3.5 rounded border-border-medium text-ink-primary focus:ring-1 focus:ring-ink-primary/30"
          />
          <span className="text-[12px] text-ink-secondary leading-snug">
            Higher fidelity{" "}
            <span className="text-ink-muted">(adds a critique + revision pass; ~30–60s slower)</span>
          </span>
        </label>
      )}

      {/* Error */}
      {combinedError && (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-[12px] text-rose-900">
          {combinedError}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          "w-full rounded-xl font-medium transition-colors",
          isHero ? "h-11 text-[14px]" : "h-9 text-[13px]",
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
            <span>Generating…</span>
          </span>
        ) : (
          submitLabel
        )}
      </button>
      {sourcesCount > 1 && !busy && (
        <div className="text-center font-mono text-[9px] tracking-widest uppercase text-ink-muted">
          Multi-source — runs extraction pass per source, then synthesis
        </div>
      )}
    </div>
  );
}
