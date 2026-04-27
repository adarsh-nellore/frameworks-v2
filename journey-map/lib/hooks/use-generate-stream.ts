"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSseFrames, type GenerateEvent } from "@/lib/pipeline/events";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

// ──────────────────────────────────────────────────────────────────────────────
// useGenerateStream — wraps POST /api/generate with SSE streaming. Extracted
// from components/GeneratePanel.tsx so the landing page and the in-canvas
// copilot can share the exact same streaming pipeline.
//
// The hook is framework-agnostic: callers pass frameworkId + inputs. The hook
// yields progress events via `onProgress` and the final map via `onSuccess`.
// ──────────────────────────────────────────────────────────────────────────────

export type GenerateInput = {
  frameworkId: string;
  /** Optional pasted text (replaces a single transcript). */
  text?: string;
  /** Optional uploaded files. */
  files?: File[];
  /** Optional URLs to fetch via the server-side ingestion pipeline. */
  urls?: string[];
  /** Optional title hint passed to the agent. */
  title?: string;
  /** Optional persona hint passed to the agent. */
  persona?: string;
  /** When true, adds the critique+revision pass (30–60s slower, higher quality). */
  fidelityMode?: boolean;
  /** Optional pre-computed shape contract from /api/preview/clarify. When
   *  present, /api/generate skips its own shape-planner call and uses this
   *  directly — saves ~20–25s of round-trip time per generation. */
  contract?: unknown;
};

export type UseGenerateStreamOptions = {
  onProgress?: (event: GenerateEvent<UniversalMap> | null) => void;
  onSuccess?: (map: UniversalMap, summary: string) => void;
  onError?: (message: string) => void;
};

export type GenerateResult = { map: UniversalMap; summary: string };

export type UseGenerateStreamReturn = {
  busy: boolean;
  error: string | null;
  /** Resolves with the final map+summary on success, or null on abort/error. */
  submit: (input: GenerateInput) => Promise<GenerateResult | null>;
  abort: () => void;
};

export function useGenerateStream(
  opts: UseGenerateStreamOptions = {}
): UseGenerateStreamReturn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror the latest callbacks so `submit` doesn't need them in its dep list.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const submit = useCallback(async (input: GenerateInput): Promise<GenerateResult | null> => {
    if (busy) return null;
    setError(null);
    setBusy(true);
    optsRef.current.onProgress?.(null);
    const ac = new AbortController();
    abortRef.current = ac;

    let finalResult: GenerateResult | null = null;

    try {
      const fd = new FormData();
      fd.append("frameworkId", input.frameworkId);
      if (input.text && input.text.trim()) fd.append("text", input.text.trim());
      (input.files ?? []).forEach((f, i) => fd.append(`file_${i}`, f));
      (input.urls ?? []).forEach((u, i) => fd.append(`url_${i}`, u));
      if (input.title && input.title.trim()) fd.append("title", input.title.trim());
      if (input.persona && input.persona.trim()) fd.append("persona", input.persona.trim());
      fd.append("fidelityMode", input.fidelityMode ? "true" : "false");
      if (input.contract) {
        try {
          fd.append("contract", JSON.stringify(input.contract));
        } catch {
          // Defensive — non-serializable input slips silently rather than
          // breaking the form submit.
        }
      }

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
      let resolvedError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseFrames<UniversalMap>(buffer);
        buffer = remainder;
        for (const event of events) {
          optsRef.current.onProgress?.(event);
          if (event.phase === "result") {
            finalResult = { map: event.map, summary: event.summary };
            optsRef.current.onSuccess?.(event.map, event.summary);
          } else if (event.phase === "error") {
            resolvedError = event.message;
          }
        }
        if (finalResult || resolvedError) break;
      }

      if (resolvedError) throw new Error(resolvedError);
      if (!finalResult) throw new Error("Generation ended without a result");
      return finalResult;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "Cancelled"
          : e instanceof Error
            ? e.message
            : "Unknown error";
      if (msg !== "Cancelled") {
        setError(msg);
        optsRef.current.onError?.(msg);
      }
      return null;
    } finally {
      abortRef.current = null;
      optsRef.current.onProgress?.(null);
      setBusy(false);
    }
  }, [busy]);

  return { busy, error, submit, abort };
}
