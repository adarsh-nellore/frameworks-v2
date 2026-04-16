import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  GitBranch,
  Heart,
  Lightbulb,
  MessageCircle,
  Radio,
  Server,
  Signal,
  Square,
  Users,
} from "lucide-react";

export type KindTheme = {
  Icon: LucideIcon;
  // Static class strings so Tailwind's JIT picks them up — no template construction.
  accentText: string;    // icon color, small accents
  accentBorder: string;  // left-rail / selected-state border
  tintBg: string;        // cell idle background
  chipBg: string;        // small chip background (e.g. kind icon chip in cell)
  chipText: string;      // chip text
  highlightBg: string;   // inline ==highlight== background
  highlightText: string; // inline ==highlight== text
};

const NEUTRAL: KindTheme = {
  Icon: Square,
  accentText: "text-slate-500",
  accentBorder: "border-slate-300",
  tintBg: "bg-white",
  chipBg: "bg-slate-100",
  chipText: "text-slate-700",
  highlightBg: "bg-slate-200/80",
  highlightText: "text-slate-900",
};

const THEMES: Record<string, KindTheme> = {
  actions: {
    Icon: Activity,
    accentText: "text-sky-600",
    accentBorder: "border-sky-400",
    tintBg: "bg-sky-50",
    chipBg: "bg-sky-100",
    chipText: "text-sky-700",
    highlightBg: "bg-sky-200/80",
    highlightText: "text-sky-900",
  },
  touchpoints: {
    Icon: Radio,
    accentText: "text-violet-600",
    accentBorder: "border-violet-400",
    tintBg: "bg-violet-50",
    chipBg: "bg-violet-100",
    chipText: "text-violet-700",
    highlightBg: "bg-violet-200/80",
    highlightText: "text-violet-900",
  },
  thoughts: {
    Icon: MessageCircle,
    accentText: "text-amber-600",
    accentBorder: "border-amber-400",
    tintBg: "bg-amber-50",
    chipBg: "bg-amber-100",
    chipText: "text-amber-700",
    highlightBg: "bg-amber-200/80",
    highlightText: "text-amber-900",
  },
  emotions: {
    Icon: Heart,
    accentText: "text-rose-600",
    accentBorder: "border-rose-400",
    tintBg: "bg-rose-50",
    chipBg: "bg-rose-100",
    chipText: "text-rose-700",
    highlightBg: "bg-rose-200/80",
    highlightText: "text-rose-900",
  },
  pain_points: {
    Icon: AlertTriangle,
    accentText: "text-red-600",
    accentBorder: "border-red-400",
    tintBg: "bg-red-50",
    chipBg: "bg-red-100",
    chipText: "text-red-700",
    highlightBg: "bg-red-200/80",
    highlightText: "text-red-900",
  },
  opportunities: {
    Icon: Lightbulb,
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-400",
    tintBg: "bg-emerald-50",
    chipBg: "bg-emerald-100",
    chipText: "text-emerald-700",
    highlightBg: "bg-emerald-200/80",
    highlightText: "text-emerald-900",
  },
  metrics: {
    Icon: BarChart3,
    accentText: "text-teal-600",
    accentBorder: "border-teal-400",
    tintBg: "bg-teal-50",
    chipBg: "bg-teal-100",
    chipText: "text-teal-700",
    highlightBg: "bg-teal-200/80",
    highlightText: "text-teal-900",
  },
  stakeholders: {
    Icon: Users,
    accentText: "text-indigo-600",
    accentBorder: "border-indigo-400",
    tintBg: "bg-indigo-50",
    chipBg: "bg-indigo-100",
    chipText: "text-indigo-700",
    highlightBg: "bg-indigo-200/80",
    highlightText: "text-indigo-900",
  },
  systems: {
    Icon: Server,
    accentText: "text-zinc-700",
    accentBorder: "border-zinc-400",
    tintBg: "bg-zinc-50",
    chipBg: "bg-zinc-200",
    chipText: "text-zinc-800",
    highlightBg: "bg-zinc-300/80",
    highlightText: "text-zinc-900",
  },
  channels: {
    Icon: Signal,
    accentText: "text-cyan-600",
    accentBorder: "border-cyan-400",
    tintBg: "bg-cyan-50",
    chipBg: "bg-cyan-100",
    chipText: "text-cyan-700",
    highlightBg: "bg-cyan-200/80",
    highlightText: "text-cyan-900",
  },
  decisions: {
    Icon: GitBranch,
    accentText: "text-fuchsia-600",
    accentBorder: "border-fuchsia-400",
    tintBg: "bg-fuchsia-50",
    chipBg: "bg-fuchsia-100",
    chipText: "text-fuchsia-700",
    highlightBg: "bg-fuchsia-200/80",
    highlightText: "text-fuchsia-900",
  },
  artifacts: {
    Icon: FileText,
    accentText: "text-stone-600",
    accentBorder: "border-stone-400",
    tintBg: "bg-stone-50",
    chipBg: "bg-stone-200",
    chipText: "text-stone-800",
    highlightBg: "bg-stone-300/80",
    highlightText: "text-stone-900",
  },
};

export function kindTheme(kind: string | undefined): KindTheme {
  if (!kind) return NEUTRAL;
  return THEMES[kind.toLowerCase()] ?? NEUTRAL;
}
