"use client";

import { createContext, useContext } from "react";
import type { ConnectorAnchor } from "@/lib/frameworks/universal/types";

// Context for card components to reach back into FrameworkGrid when the user
// starts a drag-to-connect gesture from one of the 4 edge handles. Null when
// connectors are disabled for the current framework.

export type ConnectorUI = {
  enabled: boolean;
  onDragStart: (cardId: string, anchor: ConnectorAnchor, e: React.PointerEvent) => void;
};

export const ConnectorUIContext = createContext<ConnectorUI | null>(null);

export function useConnectorUI(): ConnectorUI | null {
  return useContext(ConnectorUIContext);
}
