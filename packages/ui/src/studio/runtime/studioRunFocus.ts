import { createContext, useContext } from "react";

export interface StudioRunFocus {
  targetId: string;
  runId: string;
}
export const StudioRunFocusContext = createContext<StudioRunFocus | null>(null);
export function useStudioRunFocus(targetId?: string): string | undefined {
  const focus = useContext(StudioRunFocusContext);
  return focus?.targetId === targetId ? focus?.runId : undefined;
}
