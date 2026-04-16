import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";

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
  createdAt: number;
};

export type CanvasState = {
  boards: Board[];
  activeBoardId: string | null;
  hydrated: boolean;
};
