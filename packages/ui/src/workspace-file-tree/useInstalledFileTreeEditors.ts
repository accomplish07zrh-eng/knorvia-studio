import { useEffect, useState } from "react";
import type { EditorInfo } from "@knorvia/shared";
import { usePlatform } from "@/hooks/usePlatform.js";
import { logger } from "@/logger.js";
import { InstalledFileTreeEditorRequests } from "./fileTreeConsumerResources.js";

export function useInstalledFileTreeEditors() {
  const platform = usePlatform();
  const [installedEditors, setInstalledEditors] = useState<EditorInfo[]>([]);
  const [requests] = useState(
    () =>
      new InstalledFileTreeEditorRequests({
        accept: setInstalledEditors,
        failed: (error) =>
          logger.warn("[WorkspaceFileTree] 获取已安装 IDE 列表失败", {
            error: error instanceof Error ? error.message : String(error),
          }),
      }),
  );
  useEffect(() => requests.begin(platform), [platform, requests]);

  return { installedEditors };
}
