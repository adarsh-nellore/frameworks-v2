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
  accentText: string;
  accentBorder: string;
  tintBg: string;
  chipBg: string;
  chipText: string;
  highlightBg: string;
  highlightText: string;
};

function laneCss(kind: string): Omit<KindTheme, "Icon"> {
  return {
    accentText: `text-[rgb(var(--lane-${kind}-accent)/1)]`,
    accentBorder: `border-[rgb(var(--lane-${kind}-border)/1)]`,
    tintBg: `bg-[rgb(var(--lane-${kind}-tint)/1)]`,
    chipBg: `bg-[rgb(var(--lane-${kind}-chip-bg)/1)]`,
    chipText: `text-[rgb(var(--lane-${kind}-chip-text)/1)]`,
    highlightBg: `bg-[rgb(var(--lane-${kind}-highlight-bg)/0.8)]`,
    highlightText: `text-[rgb(var(--lane-${kind}-highlight-text)/1)]`,
  };
}

const NEUTRAL: KindTheme = {
  Icon: Square,
  ...laneCss("neutral"),
};

const THEMES: Record<string, KindTheme> = {
  actions: { Icon: Activity, ...laneCss("actions") },
  touchpoints: { Icon: Radio, ...laneCss("touchpoints") },
  thoughts: { Icon: MessageCircle, ...laneCss("thoughts") },
  emotions: { Icon: Heart, ...laneCss("emotions") },
  pain_points: { Icon: AlertTriangle, ...laneCss("pain_points") },
  opportunities: { Icon: Lightbulb, ...laneCss("opportunities") },
  metrics: { Icon: BarChart3, ...laneCss("metrics") },
  stakeholders: { Icon: Users, ...laneCss("stakeholders") },
  systems: { Icon: Server, ...laneCss("systems") },
  channels: { Icon: Signal, ...laneCss("channels") },
  decisions: { Icon: GitBranch, ...laneCss("decisions") },
  artifacts: { Icon: FileText, ...laneCss("artifacts") },
};

export function kindTheme(kind: string | undefined): KindTheme {
  if (!kind) return NEUTRAL;
  const k = kind.toLowerCase();
  return THEMES[k] ?? NEUTRAL;
}
