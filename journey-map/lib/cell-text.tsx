import type { ReactNode } from "react";
import { kindTheme } from "./row-kind-theme";

// Render cell text with two kinds of inline emphasis:
//   **phrase**     → <strong> in ink-primary (font-semibold)
//   ==phrase==     → kind-colored highlight chip
// Unknown markup passes through as plain text. Safe against nested tokens
// because we split once, left-to-right, non-greedy.
export function renderCellText(text: string, kind: string): ReactNode {
  if (!text) return null;
  const { highlightBg, highlightText } = kindTheme(kind);

  // Split on either token while preserving which matched.
  // Non-greedy to keep pairs local.
  const pattern = /(\*\*[^*\n]+?\*\*|==[^=\n]+?==)/g;
  const parts = text.split(pattern).filter((p) => p.length > 0);

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
