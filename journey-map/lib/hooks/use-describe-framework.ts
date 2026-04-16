"use client";

import { useCallback, useRef, useState } from "react";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

// ──────────────────────────────────────────────────────────────────────────────
// useDescribeFramework — thin wrapper around POST /api/framework-describe.
// Unlike generate, this is a single request/response (no streaming). The
// server does both synthesize + populate in one shot and returns the populated
// map alongside the config.
// ──────────────────────────────────────────────────────────────────────────────

export type UseDescribeFrameworkReturn = {
  busy: boolean;
  error: string | null;
  warnings: string[];
  submit: (
    description: string,
    existingIds: string[]
  ) => Promise<{ config: FrameworkConfig; populatedMap: UniversalMap } | null>;
  abort: () => void;
};

export function useDescribeFramework(): UseDescribeFrameworkReturn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const submit = useCallback(
    async (description: string, existingIds: string[]) => {
      if (busy) return null;
      const trimmed = description.trim();
      if (!trimmed) return null;
      setError(null);
      setWarnings([]);
      setBusy(true);
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/framework-describe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description: trimmed, existingIds }),
          signal: ac.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error ?? `Describe failed (HTTP ${res.status})`);
        }
        if (Array.isArray(data.warnings)) setWarnings(data.warnings);
        return {
          config: data.config as FrameworkConfig,
          populatedMap: data.populatedMap as UniversalMap,
        };
      } catch (e) {
        const msg =
          e instanceof DOMException && e.name === "AbortError"
            ? "Cancelled"
            : e instanceof Error
              ? e.message
              : "Unknown error";
        if (msg !== "Cancelled") setError(msg);
        return null;
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy]
  );

  return { busy, error, warnings, submit, abort };
}
