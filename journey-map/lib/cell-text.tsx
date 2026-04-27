import type { ReactNode } from "react";
import { kindTheme } from "./row-kind-theme";

// Render cell text with two kinds of inline emphasis:
//   **phrase**     → <strong> in ink-primary (font-semibold)
//   ==phrase==     → kind-colored highlight chip
//
// Safety net: when the populate agent emits malformed markdown (e.g.
// "**Duration risk: long-dated bonds" with no closing `**`), prior regex
// would leave the asterisks in place and the renderer would paint them
// literally. That's the ugly `**Foo**:` tokens the user saw on the SVB
// board. We sanitize first — strip any orphan `**` / `==` per line — then
// split on paired tokens. Well-formed text is unchanged.
export function renderCellText(text: string, kind: string): ReactNode {
  if (!text) return null;
  const { highlightBg, highlightText } = kindTheme(kind);

  const sanitized = stripOrphanMarkdown(text);

  // Split on either token while preserving which matched.
  // Non-greedy to keep pairs local.
  const pattern = /(\*\*[^*\n]+?\*\*|==[^=\n]+?==)/g;
  const parts = sanitized.split(pattern).filter((p) => p.length > 0);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark
          key={i}
          className={`${highlightBg} ${highlightText} px-1 py-[1px] rounded-[3px] font-medium`}
        >
          {part.slice(2, -2)}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Strip unpaired `**` and `==` tokens per line so malformed agent output
 *  never paints literal asterisks / equals signs in the UI. Paired tokens
 *  are left intact. Per-line processing so a missing close on line 1 can't
 *  swallow a valid pair on line 2. */
export function stripOrphanMarkdown(text: string): string {
  const lines = text.split("\n");
  const cleaned = lines.map((line) => {
    let out = line;
    // Count `**` occurrences; if odd, drop the last orphan.
    const boldMatches = out.match(/\*\*/g);
    if (boldMatches && boldMatches.length % 2 !== 0) {
      const lastIdx = out.lastIndexOf("**");
      if (lastIdx >= 0) {
        out = out.slice(0, lastIdx) + out.slice(lastIdx + 2);
      }
    }
    // Same for `==` — count, drop last if odd.
    const highlightMatches = out.match(/==/g);
    if (highlightMatches && highlightMatches.length % 2 !== 0) {
      const lastIdx = out.lastIndexOf("==");
      if (lastIdx >= 0) {
        out = out.slice(0, lastIdx) + out.slice(lastIdx + 2);
      }
    }
    return out;
  });
  return cleaned.join("\n");
}
