import Link from "next/link";

// ──────────────────────────────────────────────────────────────────────────────
// /preview — index of framework preview boards. All share EditableGrid + the
// /api/preview/rearrange agent endpoint. Each route varies structureHint and
// content density to exercise the agent on different framework shapes.
// ──────────────────────────────────────────────────────────────────────────────

type PreviewEntry = {
  href: string;
  title: string;
  subtitle: string;
  hint: string;
  shape: string;
};

const PREVIEWS: PreviewEntry[] = [
  {
    href: "/preview/prompt-lab",
    title: "Prompt lab",
    subtitle: "Generate a board from a prompt, then iterate with custom prompts",
    hint: "auto",
    shape: "Live /api/generate · EditableGrid in prompt mode",
  },
  {
    href: "/preview/service-blueprint",
    title: "Service blueprint",
    subtitle: "Telemedicine visit, end-to-end",
    hint: "process-flow",
    shape: "5 swimlanes × 6 phases · ~72 cells · 9 interaction edges",
  },
  {
    href: "/preview/journey-map",
    title: "Journey map",
    subtitle: "Founder opening business banking (post-SVB)",
    hint: "process-flow",
    shape: "6 aspects × 7 stages · ~70 cells · 8 pain→opportunity edges",
  },
  {
    href: "/preview/strategy-board",
    title: "Strategy board",
    subtitle: "Q3/Q4 planning — AI coding assistant company",
    hint: "brainstorm-dump",
    shape: "30 × 30 · 121 cells across 19 thematic regions",
  },
];

export default function PreviewIndexPage() {
  return (
    <main className="min-h-screen bg-surface px-8 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Preview index
        </div>
        <h1 className="text-2xl font-semibold text-ink-primary mt-1">
          Framework preview boards
        </h1>
        <p className="text-sm text-ink-muted mt-2 max-w-xl">
          Each board renders through <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-surface-hover">EditableGrid</code> and shares the same agent backend. The <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-surface-hover">structureHint</code> changes what the agent preserves — swimlanes and aspect rows are load-bearing; a brainstorm dump is free to reorganize wholesale.
        </p>

        <ul className="mt-10 space-y-3">
          {PREVIEWS.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="block rounded-lg ring-1 ring-border-soft bg-white hover:bg-surface-hover transition px-5 py-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-ink-primary">
                      {p.title}
                    </div>
                    <div className="text-sm text-ink-secondary mt-0.5">
                      {p.subtitle}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted whitespace-nowrap">
                    {p.hint}
                  </span>
                </div>
                <div className="mt-2 font-mono text-[11px] text-ink-muted">
                  {p.shape}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
