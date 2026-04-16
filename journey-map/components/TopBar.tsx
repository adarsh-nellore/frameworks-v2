"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

type Props = {
  title: string;
  onTitleChange: (title: string) => void;
  /** Anything serializable; copied to clipboard as JSON. */
  data: unknown;
};

export function TopBar({ title, onTitleChange, data }: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== title) onTitleChange(t);
    else setDraft(title);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header
      data-floating
      className="fixed top-3 left-1/2 -translate-x-1/2 z-30 glass-strong rounded-full pl-2 pr-1.5 py-1.5 flex items-center gap-2 max-w-[min(620px,calc(100vw-280px))]"
    >
      <div className="h-6 w-6 rounded-md bg-ink-primary grid place-items-center shrink-0">
        <div className="h-1.5 w-1.5 bg-white rounded-sm" />
      </div>
      <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted shrink-0">
        Journey
      </span>
      <span className="text-ink-muted/60 shrink-0">/</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft(title);
            }
          }}
          className="bg-transparent outline-none text-[13px] font-medium text-ink-primary tracking-tight min-w-0 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[13px] font-medium text-ink-primary tracking-tight min-w-0 truncate hover:text-ink-secondary transition-colors"
          title="Rename"
        >
          {title}
        </button>
      )}
      <button
        type="button"
        onClick={copyJson}
        className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-ink-primary/[0.06] hover:bg-ink-primary/[0.10] text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors shrink-0"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-600" />
            Copied
          </>
        ) : (
          <>
            <ClipboardCopy className="h-3 w-3" />
            JSON
          </>
        )}
      </button>
    </header>
  );
}
