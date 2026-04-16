"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  FileText,
  Link2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { FrameworkPills } from "@/components/FrameworkPills";
import { useCanvas } from "@/lib/canvas/context";
import { listFrameworks, isDynamicFramework } from "@/lib/frameworks";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

// Minimal empty map for the placeholder board while /api/framework-describe runs.
// The canvas page renders a skeleton when board.status === "pending-describe",
// so this map is never actually shown — it just needs to be a valid UniversalMap.
const EMPTY_MAP: UniversalMap = {
  id: "placeholder",
  title: "",
  meta: {},
  cols: [],
  rows: [],
  cards: [],
};

const ACCEPTED_EXTS = [".pdf", ".docx", ".txt", ".md", ".json", ".csv", ".tsv"];
const ACCEPTED_ATTR = ACCEPTED_EXTS.join(",");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

function hasSupportedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function LandingPage() {
  const router = useRouter();
  const { addBoard, boards, startDescribe, startGenerate } = useCanvas();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  // Input state
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraftOpen, setUrlDraftOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [title, setTitle] = useState("");
  const [persona, setPersona] = useState("");
  const [fidelityMode, setFidelityMode] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const existingIds = useMemo(() => listFrameworks().map((fw) => fw.id), []);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsNarrow(window.innerWidth < 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auto-focus textarea on mount (but not if the viewport is too narrow — avoids
  // opening the iOS keyboard on phones that somehow got past the gate).
  useEffect(() => {
    if (mounted && !isNarrow) textareaRef.current?.focus();
  }, [mounted, isNarrow]);

  const totalBytes = files.reduce((s, f) => s + f.size, 0) + text.length;
  const sourcesCount = (text.trim() ? 1 : 0) + files.length + urls.length;
  const canSubmit = sourcesCount > 0 && totalBytes <= MAX_TOTAL_BYTES;

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

  function removeFile(i: number) {
    setFiles((curr) => curr.filter((_, idx) => idx !== i));
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
    setUrlDraftOpen(false);
    setLocalError(null);
  }

  function removeUrl(i: number) {
    setUrls((curr) => curr.filter((_, idx) => idx !== i));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setLocalError(null);

    const hasSources = files.length > 0 || urls.length > 0;
    const hasText = text.trim().length > 0;

    if (!selectedId) {
      if (!hasText) return;
      // Fire-and-forget: create a pending board, start describe, navigate now.
      // The context streams results into the board while /canvas renders the skeleton.
      // Files + URLs are forwarded to the describe endpoint, which fetches URLs
      // via Jina Reader and passes all source text into the synthesis prompt.
      const board = addBoard({
        frameworkId: "journey-map", // placeholder — canvas ignores it while pending
        title: (title || text.slice(0, 60)).trim() || "New framework",
        map: EMPTY_MAP,
        status: "pending-describe",
        pendingPrompt: text,
        makeActive: true,
      });
      void startDescribe(board.id, text, existingIds, {
        files: hasSources ? files : undefined,
        urls: hasSources ? urls : undefined,
      });
      router.push(`/canvas?b=${board.id}`);
      return;
    }

    const fw = listFrameworks().find((f) => f.id === selectedId);
    if (!fw) return;

    const board = addBoard({
      frameworkId: fw.id,
      customConfig: isDynamicFramework(fw.id) ? (fw.config as FrameworkConfig) : undefined,
      title: title || fw.seed.title || fw.label,
      map: fw.seed,
      status: "pending-generate",
      pendingPrompt: text,
      makeActive: true,
    });
    void startGenerate(board.id, {
      frameworkId: fw.id,
      text: hasText ? text : undefined,
      files,
      urls,
      title: title || undefined,
      persona: persona || undefined,
      fidelityMode,
    });
    router.push(`/canvas?b=${board.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (mounted && isNarrow) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-3 glass rounded-2xl p-6">
          <Sparkles className="h-6 w-6 text-ink-primary mx-auto" />
          <h1 className="text-[18px] font-medium text-ink-primary">Use a desktop</h1>
          <p className="text-[13px] text-ink-muted leading-relaxed">
            Frameworks is a workspace for designing and iterating on strategic canvases. It's built for desktop — open on a wider screen to get started.
          </p>
        </div>
      </div>
    );
  }

  const combinedError = localError;
  const selectedFramework = selectedId ? listFrameworks().find((fw) => fw.id === selectedId) : null;
  const busy = false; // generation now runs in the canvas route, not the landing

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* Minimal header — logo top-left only, nothing else */}
      <header className="absolute top-5 left-6 z-10 flex items-center gap-2">
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-primary text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium text-[14px] text-ink-primary">Frameworks</span>
      </header>

      {/* Deep-link to workspace when boards already exist */}
      {boards.length > 0 && (
        <button
          onClick={() => router.push("/canvas")}
          className="absolute top-5 right-6 z-10 inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors"
        >
          Open workspace
          <span className="text-ink-muted">→</span>
        </button>
      )}

      {/* Layout: prompt centered in the upper 2/3, framework pills anchored to the
          bottom. Keeps the prompt the hero while the pills read as a secondary
          quick-picker toolbar below it. */}
      <div className="h-full grid grid-rows-[1fr_auto] overflow-hidden">
        <div className="flex items-center justify-center px-6 pt-16 pb-6 overflow-y-auto chat-scroll">
          <div className="w-full max-w-[720px] space-y-4">
          {/* Prompt box (glassmorphic) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files);
            }}
            className={[
              "glass-strong rounded-[28px] transition-colors",
              dragOver ? "ring-2 ring-ink-primary/30" : "",
            ].join(" ")}
          >
            {/* Attached file + URL chips (above textarea, only when present) */}
            {(files.length > 0 || urls.length > 0) && (
              <div className="flex flex-wrap gap-1.5 px-5 pt-4">
                {files.map((f, i) => (
                  <span
                    key={`f-${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-border-soft px-2.5 py-1 text-[11px] text-ink-secondary"
                  >
                    <FileText className="h-3 w-3 text-ink-muted shrink-0" />
                    <span className="truncate max-w-[180px]" title={f.name}>{f.name}</span>
                    <span className="text-ink-muted font-mono">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={busy}
                      className="text-ink-muted hover:text-ink-primary disabled:opacity-40"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {urls.map((u, i) => (
                  <span
                    key={`u-${u}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-border-soft px-2.5 py-1 text-[11px] text-ink-secondary"
                  >
                    <Link2 className="h-3 w-3 text-ink-muted shrink-0" />
                    <span className="truncate max-w-[200px]" title={u}>{u}</span>
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

            <textarea
              ref={textareaRef}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              placeholder={
                selectedFramework
                  ? `Describe your source material or theme for the ${selectedFramework.label.toLowerCase()}…`
                  : "Describe what you want to make…"
              }
              className={[
                "w-full resize-none bg-transparent outline-none",
                "px-5 pt-5 pb-3 text-[15px] leading-relaxed text-ink-primary placeholder:text-ink-muted",
                busy ? "opacity-60" : "",
              ].join(" ")}
            />

            {/* Inline URL editor (collapsed by default) */}
            {urlDraftOpen && (
              <div className="px-5 pb-3 flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <input
                  type="url"
                  autoFocus
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addUrl();
                    } else if (e.key === "Escape") {
                      setUrlDraft("");
                      setUrlDraftOpen(false);
                    }
                  }}
                  disabled={busy}
                  placeholder="https://…"
                  className="flex-1 rounded-md bg-white/80 border border-border-soft focus:border-ink-primary px-2.5 py-1 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={addUrl}
                  disabled={busy || !urlDraft.trim()}
                  className="text-[11px] font-medium text-ink-primary hover:text-ink-secondary disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrlDraft("");
                    setUrlDraftOpen(false);
                  }}
                  className="text-ink-muted hover:text-ink-primary transition-colors"
                  aria-label="Cancel URL"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Bottom toolbar — inside the box */}
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full text-ink-muted hover:text-ink-primary hover:bg-white/70 disabled:opacity-40 transition-colors"
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setUrlDraftOpen((o) => !o)}
                  disabled={busy}
                  className={[
                    "inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                    urlDraftOpen
                      ? "bg-ink-primary/[0.08] text-ink-primary"
                      : "text-ink-muted hover:text-ink-primary hover:bg-white/70",
                    busy ? "opacity-40" : "",
                  ].join(" ")}
                  title="Add URL"
                  aria-label="Add URL"
                >
                  <Link2 className="h-4 w-4" />
                </button>
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

              <div className="flex items-center gap-2">
                {selectedFramework && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--accent))]/[0.12] text-[rgb(var(--accent))] px-2.5 py-1 text-[11px] font-medium max-w-[200px]">
                    <span className="truncate">{selectedFramework.label}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      disabled={busy}
                      className="opacity-70 hover:opacity-100 disabled:opacity-30"
                      aria-label="Clear framework"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={[
                    "inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors",
                    canSubmit
                      ? "bg-ink-primary text-white hover:bg-[#1b1c20]"
                      : "bg-ink-primary/10 text-ink-muted cursor-not-allowed",
                  ].join(" ")}
                  aria-label="Build"
                  title="Build (⌘↵)"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-white/80 animate-pulse [animation-delay:0ms]" />
                      <span className="h-1 w-1 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]" />
                      <span className="h-1 w-1 rounded-full bg-white/80 animate-pulse [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Advanced options — collapsible (sits right under the prompt for density) */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Advanced
            </button>
          </div>
          {showAdvanced && (
            <div className="glass rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  placeholder="Title hint"
                  className="rounded-lg bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2.5 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
                />
                <input
                  type="text"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  disabled={busy}
                  placeholder="Persona hint"
                  className="rounded-lg bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2.5 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
                />
              </div>
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
                  <span className="text-ink-muted">(critique + revision pass; ~30–60s slower)</span>
                </span>
              </label>
            </div>
          )}

          {combinedError && (
            <div className="glass rounded-xl px-4 py-3 text-[12px] text-rose-900 bg-rose-50/80 border border-rose-100">
              {combinedError}
            </div>
          )}
          </div>
        </div>

        {/* Framework pills — anchored to the bottom as a quick-picker toolbar */}
        <div className="px-6 pb-8">
          <div className="w-full max-w-[880px] mx-auto">
            <FrameworkPills selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
      </div>
    </main>
  );
}
