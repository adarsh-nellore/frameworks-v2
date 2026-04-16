"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";
import { PromptComposer, type PromptSubmitPayload } from "@/components/PromptComposer";
import { FrameworkLibrary } from "@/components/FrameworkLibrary";
import { useCanvas } from "@/lib/canvas/context";
import { useGenerateStream } from "@/lib/hooks/use-generate-stream";
import { useDescribeFramework } from "@/lib/hooks/use-describe-framework";
import { listFrameworks, isDynamicFramework } from "@/lib/frameworks";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { GenerateEvent } from "@/lib/pipeline/events";

// ──────────────────────────────────────────────────────────────────────────────
// Landing page ("/")
//
// Prompt-first UX:
//  - User types a prompt + optionally uploads files/URLs + optionally picks a
//    framework from the right rail.
//  - No framework picked → /api/framework-describe synthesizes a structure and
//    populates it in one shot (~5–10s). Single-request, non-streaming.
//  - Framework picked → /api/generate streams events for the user to watch.
//
// On success, we addBoard() into CanvasContext (survives router navigation
// because the provider is in app/layout.tsx) and router.push("/canvas").
// ──────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { addBoard, boards } = useCanvas();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressEvent, setProgressEvent] = useState<GenerateEvent<UniversalMap> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  const existingIds = useMemo(() => listFrameworks().map((fw) => fw.id), []);

  const describe = useDescribeFramework();
  const generate = useGenerateStream({
    onProgress: setProgressEvent,
    onSuccess: () => {
      // onSuccess is wired per-submit below; setting null here just clears
      // any residual progress event if the user stays on the landing.
      setProgressEvent(null);
    },
  });

  const busy = describe.busy || generate.busy;

  useEffect(() => {
    setMounted(true);
    const check = () => setIsNarrow(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function handleSubmit(payload: PromptSubmitPayload) {
    const hasSources = payload.files.length > 0 || payload.urls.length > 0;
    const hasText = payload.text.length > 0;

    if (!selectedId) {
      // Custom synthesis path — single-call describe. Requires a prompt.
      if (!hasText) return;
      if (hasSources) {
        // Phase 1 MVP: describe doesn't ingest files. Prompt user to pick a
        // framework first if they want to use source files.
        alert("Pick a framework from the right to generate from uploaded files. The custom (prompt-only) flow can't read files yet.");
        return;
      }
      const result = await describe.submit(payload.text, existingIds);
      if (!result) return;
      const board = addBoard({
        frameworkId: result.config.id,
        customConfig: result.config,
        title: result.populatedMap.title || result.config.label,
        map: result.populatedMap,
        makeActive: true,
      });
      router.push(`/canvas?b=${board.id}`);
      return;
    }

    // Framework selected → /api/generate streams, wait for completion, then navigate.
    // (Streaming while navigating is deferred to Phase 2 — it requires hoisting
    // the generation state into CanvasContext so it survives route changes.)
    const fw = listFrameworks().find((f) => f.id === selectedId);
    if (!fw) return;

    const result = await generate.submit({
      frameworkId: fw.id,
      text: hasText ? payload.text : undefined,
      files: payload.files,
      urls: payload.urls,
      title: payload.title,
      persona: payload.persona,
      fidelityMode: payload.fidelityMode,
    });
    if (!result) return;

    const board = addBoard({
      frameworkId: fw.id,
      customConfig: isDynamicFramework(fw.id) ? (fw.config as FrameworkConfig) : undefined,
      title: result.map.title || payload.title || fw.seed.title || fw.label,
      map: result.map,
      makeActive: true,
    });
    router.push(`/canvas?b=${board.id}`);
  }

  // Desktop-only notice for narrow viewports
  if (mounted && isNarrow) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-3">
          <Sparkles className="h-6 w-6 text-ink-primary mx-auto" />
          <h1 className="text-[18px] font-medium text-ink-primary">Use a desktop</h1>
          <p className="text-[13px] text-ink-muted leading-relaxed">
            Frameworks is a workspace for designing and iterating on strategic canvases. It's built for desktop — open it on a wider screen to get started.
          </p>
        </div>
      </div>
    );
  }

  const describeError = describe.error;
  const generateError = generate.error;
  const combinedError = describeError || generateError;

  return (
    <div className="min-h-dvh" style={{ background: "rgb(var(--canvas))" }}>
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-10 lg:py-14">
        {/* Header */}
        <header className="flex items-center justify-between mb-10 lg:mb-14">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-medium text-[15px] text-ink-primary">Frameworks</span>
          </div>
          {boards.length > 0 && (
            <button
              onClick={() => router.push("/canvas")}
              className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors"
            >
              Open workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </header>

        {/* Main two-column layout */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 lg:gap-10">
          {/* Left: prompt hero */}
          <main className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-[32px] lg:text-[40px] font-medium text-ink-primary leading-tight tracking-tight">
                Describe what you want to make.
              </h1>
              <p className="text-[14px] lg:text-[15px] text-ink-secondary leading-relaxed max-w-[560px]">
                Start with an open prompt. Drop files for context. Or pick a framework template from the library to structure your thinking.
              </p>
            </div>

            <div className="rounded-3xl bg-surface shadow-panel ring-1 ring-border-soft/70 p-5 lg:p-6">
              <PromptComposer
                size="hero"
                busy={busy}
                error={combinedError}
                placeholder={
                  selectedId
                    ? "Describe your source material, persona, or theme. Or drop files below."
                    : "A 2×2 matrix for prioritizing features by impact and effort… a stakeholder map by influence and interest…"
                }
                submitLabel={selectedId ? "Generate from sources" : "Design and generate framework"}
                onSubmit={handleSubmit}
                headerSlot={
                  selectedId ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
                        Using
                      </span>
                      <span className="text-[12px] font-medium text-ink-primary">
                        {listFrameworks().find((fw) => fw.id === selectedId)?.label ?? selectedId}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="text-[11px] text-ink-muted hover:text-ink-primary underline-offset-2 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
                      Default: custom synthesis
                    </span>
                  )
                }
              />
            </div>

            {/* Progress / streaming hint while describe is running */}
            {describe.busy && (
              <div className="rounded-xl bg-white/80 border border-border-soft px-4 py-3 text-[13px] text-ink-secondary inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:300ms]" />
                </span>
                <span>Designing framework structure and filling in content…</span>
              </div>
            )}
            {progressEvent && progressEvent.phase !== "result" && progressEvent.phase !== "error" && (
              <div className="rounded-xl bg-white/80 border border-border-soft px-4 py-3 text-[13px] text-ink-secondary">
                {progressEvent.phase === "ingesting" && "Reading source material…"}
                {progressEvent.phase === "extracting" && "Extracting key details…"}
                {progressEvent.phase === "structuring" && "Structuring into a framework…"}
              </div>
            )}
          </main>

          {/* Right: framework library rail */}
          <aside className="lg:sticky lg:top-8 self-start">
            <div className="rounded-2xl bg-white/70 shadow-card ring-1 ring-border-soft/70 p-4 lg:p-5 max-h-[calc(100dvh-8rem)] overflow-y-auto chat-scroll">
              <FrameworkLibrary
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
