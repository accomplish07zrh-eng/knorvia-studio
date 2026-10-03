import { useEffect, useState } from "react";
import { observeFileTreeDragEnd } from "./fileTreeConsumerResources.js";

export function useWorkspaceFileTreeRowDragState() {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    return observeFileTreeDragEnd(window, () => setIsDragging(false));
  }, [isDragging]);

  return { isDragging, setIsDragging };
}
