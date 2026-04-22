"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { EditableGrid } from "@/components/ui/grid/EditableGrid";
import { useGenerateStream } from "@/lib/hooks/use-generate-stream";
import {
  universalMapToCells,
  structureHintForConfig,
  shouldFlatten,
  type FlattenedBoard,
  type StructureHint,
} from "@/lib/preview-data/universal-to-cells";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { GenerateEvent } from "@/lib/pipeline/events";
import {
  registerDynamicFramework,
  isDynamicFramework,
  getFramework,
} from "@/lib/frameworks";
import { FrameworkGridStage } from "./framework-grid-stage";

// ──────────────────────────────────────────────────────────────────────────────
// /preview/prompt-lab — the same /api/generate pipeline the real product uses,
// surfaced as a preview playground. Flow:
//   1. User describes what they want + optionally attaches files / URLs.
//   2. Hitting "Generate" kicks off a conversational clarifier loop
//      (/api/preview/clarify) that drills into ambiguity with open-ended
//      follow-ups. The agent can declare ready at any turn.
//   3. Clarifier answers compose into a `# Constraints (user-confirmed)`
//      block that's appended to the prompt before /api/generate runs.
//   4. Generation streams; we route the result to EditableGrid (flat
//      frameworks) or FrameworkGrid (richer grid-layout frameworks).
// ──────────────────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const DEFAULT_SCALE = 0.55;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;

const SUGGESTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: "Competitive matrix of foundation model labs",
    prompt:
      "Competitive matrix of foundation model labs (Anthropic, OpenAI, Google DeepMind, Meta, Mistral, xAI) across 8 capability dimensions — reasoning, code, multimodal, context length, safety posture, enterprise distribution, pricing, and ecosystem. Fill with 2026 realities.",
  },
  {
    label: "Service blueprint — telehealth visit",
    prompt:
      "Service blueprint for a telehealth urgent-care visit from the patient's perspective — swimlanes for patient actions, frontstage care team, backstage systems, support infra, and evidence. Cover the full arc from symptom onset to follow-up, with realistic pains at each handoff.",
  },
  {
    label: "Post-mortem: SVB collapse",
    prompt:
      "Post-mortem board on the SVB collapse and aftermath for founders: root causes, warning signs investors missed, founder decisions that mattered, regulatory response, how the treasury-management landscape changed, and lessons that still apply in 2026.",
  },
];

type BoardState = {
  map: UniversalMap;
  summary: string;
  config: FrameworkConfig;
  isDynamic: boolean;
  flat: FlattenedBoard;
  structureHint: StructureHint;
  canFlatten: boolean;
};

type TranscriptPair = { question: string; answer: string };

type ClarifierQuestion = {
  question: string;
  rationale?: string;
  suggestions?: string[];
  allowFreeText: boolean;
};

type SourceDigestClient = {
  text: string;
  meta: { csvs: Array<{ name: string; delimiter: string; columns: string[]; rowCount: number }>; sourceCount: number };
};

type ConstraintsValue = string | string[] | undefined;
type Constraints = Record<string, ConstraintsValue>;

type ClarifierResponse =
  | { ok: true; ready: true; constraints: Constraints; sourceDigest: SourceDigestClient }
  | { ok: true; ready: false; question: ClarifierQuestion; sourceDigest: SourceDigestClient };

export default function PromptLabPage() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<TranscriptPair[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<ClarifierQuestion | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [clarifying, setClarifying] = useState(false);
  const [sourceDigest, setSourceDigest] = useState<SourceDigestClient | null>(null);

  const [phase, setPhase] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const configRef = useRef<FrameworkConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { submit, busy: generating, error: generateError, abort } = useGenerateStream({
    onProgress: (event: GenerateEvent<UniversalMap> | null) => {
      if (!event) {
        setPhase(null);
        return;
      }
      if (event.phase === "result") {
        if ("config" in event && event.config) {
          configRef.current = event.config as FrameworkConfig;
        }
        return;
      }
      setPhase(phaseLabel(event));
    },
    onSuccess: (map, summary) => {
      const cfg = configRef.current;
      let resolvedConfig = cfg;
      let isDynamic = false;
      if (cfg) {
        try {
          getFramework(cfg.id);
        } catch {
          registerDynamicFramework(cfg);
        }
        isDynamic = isDynamicFramework(cfg.id);
        resolvedConfig = cfg;
      }
      if (!resolvedConfig) {
        const flat = universalMapToCells(map);
        setBoard({
          map,
          summary,
          config: {} as FrameworkConfig,
          isDynamic: false,
          flat,
          structureHint: "brainstorm-dump",
          canFlatten: true,
        });
        setPhase(null);
        return;
      }
      const flat = universalMapToCells(map);
      const canFlatten = shouldFlatten(map, resolvedConfig);
      setBoard({
        map,
        summary,
        config: resolvedConfig,
        isDynamic,
        flat,
        structureHint: structureHintForConfig(resolvedConfig),
        canFlatten,
      });
      setPhase(null);
    },
  });

  const busy = clarifying || generating;

  // ── File / URL attachment handling ──────────────────────────────────────────

  const acceptFiles = useCallback(
    (incoming: FileList | File[]) => {
      const next: File[] = [...files];
      let err: string | null = null;
      for (const f of Array.from(incoming)) {
        if (next.length >= MAX_FILES) {
          err = `Max ${MAX_FILES} files`;
          break;
        }
        if (f.size > MAX_FILE_BYTES) {
          err = `"${f.name}" is too large (>${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`;
          continue;
        }
        const total = next.reduce((s, x) => s + x.size, 0) + f.size;
        if (total > MAX_TOTAL_BYTES) {
          err = "Total size exceeds 50 MB";
          break;
        }
        if (!next.some((x) => x.name === f.name && x.size === f.size)) {
          next.push(f);
        }
      }
      setFiles(next);
      setUploadError(err);
    },
    [files]
  );

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function addUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    try {
      new URL(u);
    } catch {
      setUploadError("Invalid URL");
      return;
    }
    if (urls.length >= MAX_FILES) {
      setUploadError(`Max ${MAX_FILES} URLs`);
      return;
    }
    if (urls.includes(u)) return;
    setUrls((prev) => [...prev, u]);
    setUrlDraft("");
    setUploadError(null);
  }

  function removeUrl(i: number) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onDrop(e: ReactDragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files);
  }

  function onDragOver(e: ReactDragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!busy) setDragOver(true);
  }

  function onDragLeave(e: ReactDragEvent<HTMLDivElement>) {
    if (e.currentTarget === e.target) setDragOver(false);
  }

  const hasSources = files.length > 0 || urls.length > 0;
  const canGenerate = (prompt.trim().length > 0 || hasSources) && !busy;

  // ── Clarifier loop ───────────────────────────────────────────────────────────

  async function handleInitialSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canGenerate) return;
    setUploadError(null);
    setTranscript([]);
    setActiveQuestion(null);
    setAnswerDraft("");
    setSourceDigest(null);
    setClarifying(true);

    try {
      const fd = new FormData();
      fd.append("prompt", prompt.trim());
      files.forEach((f, i) => fd.append(`file_${i}`, f));
      urls.forEach((u, i) => fd.append(`url_${i}`, u));

      const res = await fetch("/api/preview/clarify", { method: "POST", body: fd });
      const data = (await res.json()) as ClarifierResponse | { ok: false; error: string };
      if (!("ok" in data) || !data.ok) {
        // Fail soft — skip clarifier, go straight to generate with whatever we have.
        await finalizeGenerate({});
        return;
      }
      setSourceDigest(data.sourceDigest);
      if (data.ready) {
        await finalizeGenerate(data.constraints);
        return;
      }
      setActiveQuestion(data.question);
    } catch {
      // Network/transport failure — skip clarifier and generate anyway.
      await finalizeGenerate({});
    }
  }

  async function handleAnswer(e?: React.FormEvent) {
    e?.preventDefault();
    if (!activeQuestion) return;
    const answer = answerDraft.trim();
    if (!answer) return;
    const nextTranscript: TranscriptPair[] = [
      ...transcript,
      { question: activeQuestion.question, answer },
    ];
    setTranscript(nextTranscript);
    setActiveQuestion(null);
    setAnswerDraft("");

    try {
      const res = await fetch("/api/preview/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          transcript: nextTranscript,
          sourceDigest: sourceDigest ?? { text: "", meta: { csvs: [], sourceCount: 0 } },
        }),
      });
      const data = (await res.json()) as ClarifierResponse | { ok: false; error: string };
      if (!("ok" in data) || !data.ok) {
        await finalizeGenerate({});
        return;
      }
      if (data.ready) {
        await finalizeGenerate(data.constraints);
        return;
      }
      setActiveQuestion(data.question);
    } catch {
      await finalizeGenerate({});
    }
  }

  async function handleGenerateNow() {
    // User taps "Generate now" mid-clarifier: skip remaining questions and
    // generate with whatever transcript exists. Compose a lightweight
    // constraints block from the transcript so answers aren't lost.
    const constraints: Constraints = {};
    if (transcript.length > 0) {
      constraints.notes = transcript.map((p) => `${p.question} → ${p.answer}`);
    }
    await finalizeGenerate(constraints);
  }

  async function finalizeGenerate(constraints: Constraints) {
    setActiveQuestion(null);
    setAnswerDraft("");
    const constraintsBlock = renderConstraintsBlockClient(constraints);
    const fullText = constraintsBlock
      ? `${prompt.trim()}\n\n${constraintsBlock}`
      : prompt.trim();
    configRef.current = null;
    setBoard(null);
    setClarifying(false);
    await submit({
      frameworkId: "auto",
      text: fullText,
      files,
      urls,
      fidelityMode: false,
    });
  }

  function handleCancelAll() {
    abort();
    setClarifying(false);
    setActiveQuestion(null);
    setAnswerDraft("");
    setTranscript([]);
    setPhase(null);
  }

  function handleReset() {
    abort();
    setBoard(null);
    setPhase(null);
    setTranscript([]);
    setActiveQuestion(null);
    setAnswerDraft("");
    setSourceDigest(null);
    configRef.current = null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (board) {
    if (board.canFlatten) {
      return <BoardStage board={board} onReset={handleReset} />;
    }
    return (
      <FrameworkGridStage
        map={board.map}
        config={board.config}
        isDynamic={board.isDynamic}
        summary={board.summary}
        onReset={handleReset}
        onRegenerate={async (userPrompt) => {
          // The arrange agent refused a layout-change request. Build a fresh
          // generate prompt by stitching together (a) the current board's
          // subject/title and (b) the user's reshape instruction, then fire
          // the full synth pipeline. Shape planner will produce the correct
          // new layout + regions for this subject.
          const subject =
            board.map.title?.trim() ||
            board.config?.label ||
            board.summary?.trim() ||
            "";
          const pieces: string[] = [];
          if (subject) pieces.push(`Subject: ${subject}.`);
          if (userPrompt) pieces.push(userPrompt);
          else pieces.push("Propose a fresh shape for this subject.");
          const newPrompt = pieces.join(" ");
          setPrompt(newPrompt);
          setBoard(null);
          configRef.current = null;
          setTranscript([]);
          setActiveQuestion(null);
          setAnswerDraft("");
          await submit({
            frameworkId: "auto",
            text: newPrompt,
            files,
            urls,
            fidelityMode: false,
          });
        }}
      />
    );
  }

  const inClarifier = clarifying || transcript.length > 0 || activeQuestion !== null;

  return (
    <main className="min-h-screen bg-surface px-8 py-14">
      <div className="max-w-2xl mx-auto">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Preview · prompt lab
        </div>
        <h1 className="text-2xl font-semibold text-ink-primary mt-1">
          Generate a board from a prompt
        </h1>
        <p className="text-sm text-ink-muted mt-2 leading-[1.55]">
          Describe a framework and what you want it to be about. Optionally attach
          CSVs, documents, or URLs. A clarifier agent may ask a few follow-ups to
          sharpen your intent before generating.
        </p>

        {!inClarifier && (
          <form onSubmit={handleInitialSubmit} className="mt-8">
            <div
              ref={dropZoneRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={[
                "rounded-lg ring-1 transition-colors",
                dragOver
                  ? "ring-indigo-400 ring-[1.5px] bg-indigo-50/40"
                  : "ring-border-medium bg-white",
              ].join(" ")}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    void handleInitialSubmit(e as unknown as React.FormEvent);
                  }
                }}
                rows={6}
                autoFocus
                disabled={busy}
                placeholder="e.g. Competitive matrix of the top 6 EV OEMs across 7 capability dimensions, 2026 reality. Drop a CSV or PDF for grounding."
                className="w-full text-[13px] leading-[1.5] text-ink-primary bg-transparent rounded-t-lg px-3 py-2.5 focus:outline-none placeholder:text-ink-muted resize-none disabled:opacity-60"
              />

              {(files.length > 0 || urls.length > 0) && (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary bg-surface-hover ring-1 ring-border-soft rounded-md px-2 py-1"
                    >
                      <span className="font-mono text-[9.5px] text-ink-muted">
                        {guessKindLabel(f.name)}
                      </span>
                      <span className="max-w-[220px] truncate">{f.name}</span>
                      <span className="text-ink-muted tabular-nums">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-ink-muted hover:text-ink-secondary"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {urls.map((u, i) => (
                    <span
                      key={u}
                      className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary bg-surface-hover ring-1 ring-border-soft rounded-md px-2 py-1"
                    >
                      <span className="font-mono text-[9.5px] text-ink-muted">URL</span>
                      <span className="max-w-[260px] truncate">{u}</span>
                      <button
                        type="button"
                        onClick={() => removeUrl(i)}
                        className="text-ink-muted hover:text-ink-secondary"
                        aria-label={`Remove ${u}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {showUrlInput && (
                <div className="px-3 pb-2 flex items-center gap-1.5">
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
                    placeholder="https://…"
                    className="flex-1 text-[12px] bg-white ring-1 ring-border-soft rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={addUrl}
                    className="text-[11px] text-ink-secondary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-1 hover:bg-surface-hover"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between px-2 py-2 border-t border-border-soft">
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                    icon={<PaperclipIcon />}
                  />
                  <IconButton
                    label="Add URL"
                    onClick={() => setShowUrlInput((s) => !s)}
                    icon={<LinkIcon />}
                    active={showUrlInput}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) acceptFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canGenerate}
                  className={[
                    "text-[12px] font-medium rounded-md px-4 py-1.5 flex items-center gap-2",
                    !canGenerate
                      ? "bg-indigo-600/40 text-white cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700",
                  ].join(" ")}
                >
                  {busy ? <MiniSpinner /> : null}
                  {clarifying ? "Clarifying…" : generating ? "Generating…" : "Generate"}
                  {!busy && (
                    <span className="opacity-60 font-mono text-[9.5px] tracking-wider">⌘↵</span>
                  )}
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="mt-2 text-[11px] text-red-700 bg-red-50 ring-1 ring-red-200 rounded-md px-3 py-1.5 font-mono">
                ✕ {uploadError}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setPrompt(s.prompt)}
                  disabled={busy}
                  className="text-[11px] text-ink-secondary bg-white ring-1 ring-border-soft rounded-full px-2.5 py-1 hover:ring-border-medium hover:bg-surface-hover disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </form>
        )}

        {inClarifier && (
          <div className="mt-8">
            <div className="rounded-lg ring-1 ring-border-soft bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                  Your brief
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateNow}
                    disabled={generating}
                    className="text-[11px] text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 rounded-md px-2.5 py-1 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    Generate now
                  </button>
                  <button
                    onClick={handleCancelAll}
                    className="text-[11px] text-ink-secondary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-1 hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div className="text-[12px] text-ink-primary mt-2 whitespace-pre-wrap leading-[1.5]">
                {prompt.trim() || <em className="text-ink-muted">(source-driven, no text prompt)</em>}
              </div>
              {(files.length > 0 || urls.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <span
                      key={f.name}
                      className="text-[11px] text-ink-muted bg-surface-hover ring-1 ring-border-soft rounded-md px-2 py-0.5"
                    >
                      {guessKindLabel(f.name)} · {f.name}
                    </span>
                  ))}
                  {urls.map((u) => (
                    <span
                      key={u}
                      className="text-[11px] text-ink-muted bg-surface-hover ring-1 ring-border-soft rounded-md px-2 py-0.5"
                    >
                      URL · {u}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {transcript.length > 0 && (
              <div className="mt-4 space-y-2">
                {transcript.map((pair, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-[12px] text-ink-secondary leading-[1.5] bg-surface-hover rounded-md px-3 py-2 ring-1 ring-border-soft">
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-muted mr-2">
                        Agent
                      </span>
                      {pair.question}
                    </div>
                    <div className="text-[12px] text-ink-primary leading-[1.5] bg-indigo-50 rounded-md px-3 py-2 ring-1 ring-indigo-100">
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-indigo-700 mr-2">
                        You
                      </span>
                      {pair.answer}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeQuestion && !generating && (
              <form onSubmit={handleAnswer} className="mt-4">
                <div className="text-[12px] text-ink-secondary leading-[1.5] bg-surface-hover rounded-md px-3 py-2 ring-1 ring-border-soft">
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-muted mr-2">
                    Agent
                  </span>
                  {activeQuestion.question}
                  {activeQuestion.rationale && (
                    <div className="mt-1 text-[11px] text-ink-muted italic">
                      {activeQuestion.rationale}
                    </div>
                  )}
                </div>
                {activeQuestion.suggestions && activeQuestion.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeQuestion.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAnswerDraft(s)}
                        className="text-[11px] text-ink-secondary bg-white ring-1 ring-border-soft rounded-full px-2.5 py-1 hover:ring-border-medium hover:bg-surface-hover"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-start gap-2">
                  <textarea
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void handleAnswer();
                      }
                    }}
                    rows={2}
                    autoFocus
                    placeholder="Type your answer… (⌘↵ to send)"
                    className="flex-1 text-[12px] leading-[1.5] text-ink-primary bg-white ring-1 ring-border-medium rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-400 focus:ring-[1.5px] placeholder:text-ink-muted resize-none"
                  />
                  <button
                    type="submit"
                    disabled={answerDraft.trim().length === 0}
                    className={[
                      "text-[12px] font-medium rounded-md px-3 py-2",
                      answerDraft.trim().length === 0
                        ? "bg-indigo-600/40 text-white cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700",
                    ].join(" ")}
                  >
                    Send
                  </button>
                </div>
              </form>
            )}

            {clarifying && !activeQuestion && !generating && (
              <div className="mt-4 text-[11px] font-mono text-ink-secondary bg-white ring-1 ring-border-soft rounded-md px-3 py-2">
                <span className="text-indigo-600">●</span> Thinking…
              </div>
            )}
          </div>
        )}

        {generating && (
          <div className="mt-6 text-[11px] font-mono text-ink-secondary bg-white ring-1 ring-border-soft rounded-md px-3 py-2">
            <span className="text-indigo-600">●</span> {phase ?? "Starting…"}
          </div>
        )}
        {generateError && !generating && (
          <div className="mt-6 text-[11px] text-red-700 bg-red-50 ring-1 ring-red-200 rounded-md px-3 py-2 font-mono">
            ✕ {generateError}
          </div>
        )}

        <div className="mt-10 text-[11px] text-ink-muted">
          <Link href="/preview" className="underline underline-offset-2 hover:text-ink-secondary">
            ← Preview index
          </Link>
        </div>
      </div>
    </main>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderConstraintsBlockClient(constraints: Constraints): string {
  const lines: string[] = ["# Constraints (user-confirmed)"];
  for (const [key, value] of Object.entries(constraints)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`- ${key}: ${value.join(", ")}`);
    } else {
      lines.push(`- ${key}: ${value}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function guessKindLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "csv") return "CSV";
  if (ext === "tsv") return "TSV";
  if (ext === "json") return "JSON";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "IMG";
  if (["md", "txt"].includes(ext)) return "TXT";
  if (ext === "docx") return "DOC";
  return (ext || "FILE").toUpperCase();
}

function IconButton({
  label,
  onClick,
  icon,
  active = false,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "rounded-md p-1.5 transition-colors",
        active
          ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
          : "text-ink-secondary hover:bg-surface-hover",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function phaseLabel(e: GenerateEvent<UniversalMap>): string {
  switch (e.phase) {
    case "ingesting":
      return `Ingesting ${e.sourcesCount} source${e.sourcesCount === 1 ? "" : "s"}…`;
    case "extracting":
      return `Extracting atoms (${e.current}/${e.total}) — ${e.sourceLabel}…`;
    case "synthesizing":
      return "Synthesizing framework + populating cards…";
    case "critiquing":
      return `Critiquing${typeof e.fidelity_score === "number" ? ` (score ${e.fidelity_score})` : ""}…`;
    case "revising":
      return `Revising — ${e.reason}`;
    case "subject_id":
      return `Identifying subject (${e.current}/${e.total})…`;
    case "error":
      return `Error: ${e.message}`;
    default:
      return "Working…";
  }
}

// ── Generated-board stage (EditableGrid path) ────────────────────────────────

function BoardStage({ board, onReset }: { board: BoardState; onReset: () => void }) {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(40);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el!.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const delta = -e.deltaY * 0.0015;
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * (1 + delta)));
          const ratio = next / prev;
          setTx((ptx) => ox - ratio * (ox - ptx));
          setTy((pty) => oy - ratio * (oy - pty));
          return next;
        });
      } else {
        e.preventDefault();
        setTx((v) => v - e.deltaX);
        setTy((v) => v - e.deltaY);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-eg-interactive]")) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const s = dragState.current;
    if (!s) return;
    setTx(s.startTx + (e.clientX - s.startX));
    setTy(s.startTy + (e.clientY - s.startY));
  }
  function onPointerUp(e: ReactPointerEvent) {
    dragState.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "0") {
        setScale(DEFAULT_SCALE);
        setTx(40);
        setTy(40);
      } else if (e.key === "=" || e.key === "+") {
        setScale((s) => Math.min(MAX_SCALE, s * 1.15));
      } else if (e.key === "-" || e.key === "_") {
        setScale((s) => Math.max(MIN_SCALE, s / 1.15));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const frameworkName = board.config?.label ?? "custom framework";
  const instanceContext = useMemo(
    () =>
      board.summary?.trim() ||
      board.map.title?.trim() ||
      "Board generated from free-form prompt",
    [board.summary, board.map.title]
  );

  return (
    <main className="fixed inset-0 bg-surface overflow-hidden select-none">
      <div
        className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur rounded-lg ring-1 ring-border-soft px-4 py-3 max-w-md"
        data-eg-interactive
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Preview · prompt lab · {board.flat.rows} × {board.flat.cols}
        </div>
        <h1 className="text-base font-semibold text-ink-primary mt-0.5">
          {board.map.title || frameworkName}
        </h1>
        <p className="text-[11px] text-ink-muted mt-1">
          {board.flat.cells.length} cells · structure:{" "}
          <span className="font-mono">{board.structureHint}</span>. Custom prompts in the
          sidebar run the framework-aware reasoning agent. ⌘/Ctrl+scroll to zoom · 0
          resets.
        </p>
        <button
          onClick={onReset}
          className="mt-2 text-[10.5px] text-ink-muted hover:text-ink-secondary underline underline-offset-2"
        >
          ← Start over with a new prompt
        </button>
      </div>

      <div
        className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur rounded-md ring-1 ring-border-soft px-2 py-1"
        data-eg-interactive
      >
        <span className="text-[11px] font-mono tabular-nums text-ink-secondary">
          {Math.round(scale * 100)}%
        </span>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          <div className="p-8" data-eg-interactive>
            <EditableGrid
              initialCells={board.flat.cells}
              initialConfig={{
                cellW: 150,
                cellH: 70,
                gap: 16,
                cols: board.flat.cols,
                rows: board.flat.rows,
              }}
              rowLabels={board.flat.rowLabels}
              colLabels={board.flat.colLabels}
              structureHint={board.structureHint}
              frameworkName={frameworkName}
              instanceContext={instanceContext}
              promptMode
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function MiniSpinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
