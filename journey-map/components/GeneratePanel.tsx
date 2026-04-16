"use client";

import { useEffect, useRef, useState } from "react";
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

import {
  parseSseFrames,
  type GenerateEvent,
} from "@/lib/pipeline/events";

type Props = {
  frameworkId: string;
  /** Human-readable framework label, used in the panel header + submit button. */
  frameworkLabel: string;
  frameworkOptions: { id: string; label: string }[];
  onFrameworkChange: (frameworkId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess: (map: any, summary: string) => void;
  onBusyChange: (busy: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProgress?: (event: GenerateEvent<any> | null) => void;
  /** Provided by the parent so the GenerationOverlay's Cancel button can also abort. */
  registerCancel?: (cancel: (() => void) | null) => void;
};

const ACCEPTED_EXTS = [".pdf", ".docx", ".txt", ".md", ".json", ".csv", ".tsv"];
const ACCEPTED_ATTR = ACCEPTED_EXTS.join(",");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

type Stage = "idle" | "submitting";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hasSupportedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

export function GeneratePanel({
  frameworkId,
  frameworkLabel,
  frameworkOptions,
  onFrameworkChange,
  onSuccess,
  onBusyChange,
  onProgress,
  registerCancel,
}: Props) {
  const reduce = useReducedMotion();
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [title, setTitle] = useState("");
  const [persona, setPersona] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [fidelityMode, setFidelityMode] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = stage === "submitting";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  // Tell the parent how to cancel an in-flight generation.
  useEffect(() => {
    if (!registerCancel) return;
    if (busy) {
      registerCancel(() => {
        abortRef.current?.abort();
      });
    } else {
      registerCancel(null);
    }
    return () => registerCancel(null);
  }, [busy, registerCancel]);

  const totalSize = files.reduce((s, f) => s + f.size, 0) + pasted.length;
  const sourcesCount =
    (pasted.trim() ? 1 : 0) + files.length + urls.length;
  const canSubmit = !busy && sourcesCount > 0 && totalSize <= MAX_TOTAL_BYTES;

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
      // Skip duplicates (same name + size).
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

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      setError(`URL must start with http:// or https://`);
      return;
    }
    if (urls.includes(u)) {
      setUrlDraft("");
      return;
    }
    setUrls((curr) => [...curr, u]);
    setUrlDraft("");
    setError(null);
  }

  function removeUrl(idx: number) {
    setUrls((curr) => curr.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setStage("submitting");
    onProgress?.(null);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const fd = new FormData();
      fd.append("frameworkId", frameworkId);
      if (pasted.trim()) fd.append("text", pasted.trim());
      files.forEach((f, i) => fd.append(`file_${i}`, f));
      urls.forEach((u, i) => fd.append(`url_${i}`, u));
      if (title.trim()) fd.append("title", title.trim());
      if (persona.trim()) fd.append("persona", persona.trim());
      fd.append("fidelityMode", fidelityMode ? "true" : "false");

      const res = await fetch("/api/generate", {
        method: "POST",
        body: fd,
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Generate failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resolvedSuccess = false;
      let resolvedError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseFrames<any>(buffer);
        buffer = remainder;
        for (const event of events) {
          onProgress?.(event);
          if (event.phase === "result") {
            onSuccess(event.map, event.summary);
            resolvedSuccess = true;
          } else if (event.phase === "error") {
            resolvedError = event.message;
          }
        }
        if (resolvedSuccess || resolvedError) break;
      }

      if (resolvedError) {
        throw new Error(resolvedError);
      }
      if (!resolvedSuccess) {
        throw new Error("Generation ended without a result");
      }

      // Reset on success — user can run another generation if they want.
      setPasted("");
      setFiles([]);
      setUrls([]);
      setUrlDraft("");
      setTitle("");
      setPersona("");
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "Cancelled"
          : e instanceof Error
            ? e.message
            : "Unknown error";
      if (msg !== "Cancelled") setError(msg);
    } finally {
      abortRef.current = null;
      onProgress?.(null);
      setStage("idle");
    }
  }

  const buttonLabel = busy
    ? `Generating ${frameworkLabel.toLowerCase()}…`
    : sourcesCount === 0
      ? `Add a source to generate ${frameworkLabel.toLowerCase()}`
      : `Generate ${frameworkLabel} from ${sourcesCount} source${sourcesCount === 1 ? "" : "s"}`;

  return (
    <div className="px-5 pt-3 pb-4 space-y-3 overflow-y-auto chat-scroll">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-ink-primary" />
          <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted">
            From source material
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-muted shrink-0">
            Into
          </span>
          <label className="sr-only" htmlFor="generate-framework-select">
            Framework type
          </label>
          <select
            id="generate-framework-select"
            value={frameworkId}
            onChange={(e) => onFrameworkChange(e.target.value)}
            disabled={busy}
            className={[
              "rounded-md border border-border-soft bg-white/80",
              "px-2 py-1 text-[11px] font-medium text-ink-primary",
              "hover:border-border-medium focus:border-ink-primary",
              "outline-none transition-colors disabled:opacity-60",
            ].join(" ")}
          >
            {frameworkOptions.map((fw) => (
              <option key={fw.id} value={fw.id}>
                {fw.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
          Drop transcripts, personas, user stories, research notes
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
          placeholder="Add a URL (fetched via Jina Reader)…"
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
              <span className="truncate max-w-[200px]" title={u}>
                {u}
              </span>
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

      {/* Paste textarea */}
      <div>
        <textarea
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          disabled={busy}
          placeholder="Or paste a transcript, persona, user story, JTBD…"
          className="w-full resize-none rounded-xl bg-white/70 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-3 py-2 text-[12px] leading-snug text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
        />
      </div>

      {/* Hints (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowHints((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
        >
          <ChevronDown
            className={[
              "h-3 w-3 transition-transform",
              showHints ? "rotate-0" : "-rotate-90",
            ].join(" ")}
          />
          Optional hints
        </button>
        {showHints && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Map title"
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

      {/* Higher fidelity toggle */}
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

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-[12px] text-rose-900">
          {error}
        </div>
      )}

      {/* Submit */}
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
            <span>{buttonLabel}</span>
          </span>
        ) : (
          buttonLabel
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
