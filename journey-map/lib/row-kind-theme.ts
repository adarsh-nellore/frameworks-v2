import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Briefcase,
  ChevronsRight,
  Clock,
  Eye,
  FileText,
  GitBranch,
  Heart,
  Inbox,
  Lightbulb,
  MessageCircle,
  Quote,
  Radio,
  Server,
  Signal,
  Square,
  Star,
  Tag,
  Target,
  Users,
  Wrench,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Neutral row-kind theme.
//
// Earlier versions mapped each row "kind" (actions, emotions, pain_points…) to
// a distinct pastel palette baked into CSS vars (--lane-{kind}-tint, etc.). We
// have deliberately dropped that. The kind now only controls the ICON — colors
// come from the design system tokens directly so an imported palette applies
// uniformly across every framework.
//
// The interface is preserved so downstream components (GridCard, cell-text,
// Copilot focus previews) don't need rewrites. Every color slot resolves to a
// semantic or accent token; no per-kind branching.
// ──────────────────────────────────────────────────────────────────────────────

export type KindTheme = {
  Icon: LucideIcon;
  /** Secondary ink — for small captions or row-label text. */
  accentText: string;
  /** Accent color border — used for the optional left stripe on selected/flagged cards. */
  accentBorder: string;
  /** Card background (kept semantic-neutral to let the design system drive the look). */
  tintBg: string;
  /** Icon chip background — neutral ink wash. */
  chipBg: string;
  /** Icon chip foreground. */
  chipText: string;
  /** Highlight marker (==phrase==) background — low-opacity accent so it keeps brand identity. */
  highlightBg: string;
  /** Highlight marker foreground — dark ink reads at any accent hue. */
  highlightText: string;
};

// One neutral theme. Every kindTheme() call returns this shape with a different Icon.
const NEUTRAL_COLORS = {
  accentText: "text-ink-secondary",
  accentBorder: "border-accent",
  tintBg: "bg-surface",
  chipBg: "bg-ink-primary/[0.06]",
  chipText: "text-ink-secondary",
  highlightBg: "bg-[rgb(var(--accent)/0.14)]",
  highlightText: "text-ink-primary",
} as const;

// Per-kind icon only. Colors are uniform across all kinds.
const KIND_ICONS: Record<string, LucideIcon> = {
  // Journey-map
  actions: Activity,
  touchpoints: Radio,
  thoughts: MessageCircle,
  emotions: Heart,
  pain_points: AlertTriangle,
  opportunities: Lightbulb,
  metrics: BarChart3,
  stakeholders: Users,
  systems: Server,
  channels: Signal,
  decisions: GitBranch,
  artifacts: FileText,

  // JTBD
  functional_jobs: Briefcase,
  emotional_jobs: Heart,
  social_jobs: Users,
  desired_outcomes: Target,
  current_solutions: Wrench,
  context_triggers: Clock,
  hiring_criteria: ArrowUpCircle,
  firing_criteria: ArrowDownCircle,

  // Affinity
  observation: Eye,
  quote: Quote,
  insight: Lightbulb,
  need: Heart,
  theme: Tag,
  ungrouped: Inbox,

  // Competitive
  subject: Star,
  competitor: Square,
  criterion: ChevronsRight,

  // Matrix quadrants
  quadrant_high: ArrowUpCircle,
  quadrant_low: ArrowDownCircle,
};

function neutralTheme(Icon: LucideIcon): KindTheme {
  return { Icon, ...NEUTRAL_COLORS };
}

const NEUTRAL: KindTheme = neutralTheme(Square);

export function kindTheme(kind: string | undefined): KindTheme {
  if (!kind) return NEUTRAL;
  const k = kind.toLowerCase();
  const Icon = KIND_ICONS[k];
  return Icon ? neutralTheme(Icon) : NEUTRAL;
}

/**
 * Legacy API kept for the affinity diagram, which cycled a palette across
 * theme cols by index. In the neutral treatment every kind looks the same,
 * so this is effectively a no-op — but keeping the callable avoids churn.
 */
export function themeKindForIndex(_index: number): string {
  return "theme";
}
