import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";

export type BoardStatus =
  /** The board is fully generated and ready for editing. */
  | "ready"
  /** Waiting for /api/framework-describe to synthesize a framework from a prompt.
   *  The board has no usable frameworkId/map yet — canvas shows a skeleton. */
  | "pending-describe"
  /** Waiting for /api/generate to populate the board's seed from sources. The
   *  frameworkId/map are the framework's seed; canvas overlays progress. */
  | "pending-generate";

export type Board = {
  id: string;
  frameworkId: string;
  /** Set only when frameworkId is dynamic (user-generated). Kept on the Board so
   *  the dynamic registry can be rehydrated on reload before boards mount. */
  customConfig?: FrameworkConfig;
  title: string;
  /** Canvas-space top-left in CSS pixels (pre-zoom). */
  x: number;
  y: number;
  map: UniversalMap;
  selection: UniversalSelection | null;
  status: BoardStatus;
  /** For pending-describe: the user's original prompt, shown in the skeleton. */
  pendingPrompt?: string;
  createdAt: number;
};

export type CanvasState = {
  boards: Board[];
  activeBoardId: string | null;
  hydrated: boolean;
};
