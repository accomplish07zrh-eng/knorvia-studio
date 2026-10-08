import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useSelectDirectory } from "@/hooks/usePlatform.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import { STUDIO_KERNELS, type StudioKernelId } from "../types.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import type { WorkbenchTile } from "./workbenchModel.js";

export function WorkbenchTileSetup({ pane, tile }: { pane: string; tile: WorkbenchTile }) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const update = useTaskWorkbench((state) => state.update);
  const selectDirectory = useSelectDirectory();
  const setDraftWorkspace = useStudioAgentStore((state) => state.setDraftWorkspace);
  const [error, setError] = useState("");
  const remote = Boolean(tile.scope.workspaceIdentity || tile.scope.remoteSessionId);
  const validPath =
    /^(?:[a-zA-Z]:[\\/]|\/)/.test(tile.scope.workspacePath) &&
    !/[\r\n]/.test(tile.scope.workspacePath) &&
    !tile.scope.workspacePath.includes("\0");
  const patch = (value: Partial<WorkbenchTile>) =>
    update(pane, { ...value, configured: true }, tile.id);
  const open = () => {
    if (!validPath) return;
    const id = tile.kernel === "knorvia" ? null : crypto.randomUUID();
    if (id && !setDraftWorkspace(id, tile.kernel, tile.scope.workspacePath)) {
      setError(
        zh
          ? "无法保存此格的项目，请检查草稿存储。"
          : "Could not save this tile's project. Check draft storage.",
      );
      return;
    }
    patch({ opened: true, sessionId: id });
  };
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-sm space-y-4 text-ui-sm">
        <div>
          <h2 className="font-medium">{zh ? "准备一个任务格" : "Prepare a task tile"}</h2>
          <p className="mt-1 text-foreground-subtle">
            {zh
              ? "先选内核和项目，排好布局后逐格输入。"
              : "Choose a kernel and project, arrange your tiles, then enter each task."}
          </p>
        </div>
        <label className="block space-y-1">
          <span>{zh ? "内核" : "Kernel"}</span>
          <select
            data-testid="workbench-kernel"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-ui-sm"
            value={tile.kernel}
            onChange={(event) => patch({ kernel: event.target.value as StudioKernelId })}
          >
            {STUDIO_KERNELS.filter((kernel) => !remote || kernel.id === "knorvia").map((kernel) => (
              <option key={kernel.id} value={kernel.id}>
                {kernel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span>{zh ? "项目目录" : "Project directory"}</span>
          <input
            data-testid="workbench-directory"
            value={tile.scope.workspacePath}
            readOnly={remote}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-ui-sm"
            onChange={(event) => patch({ scope: { workspacePath: event.target.value } })}
          />
        </label>
        <div className="flex gap-2">
          {!remote && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void selectDirectory()
                  .then((path) => {
                    if (path) patch({ scope: { workspacePath: path } });
                  })
                  .catch(() => setError(zh ? "未能选择目录" : "Could not select a directory"));
              }}
            >
              {zh ? "选择目录" : "Choose folder"}
            </Button>
          )}
          <Button size="sm" disabled={!validPath} data-testid="workbench-open-input" onClick={open}>
            {zh ? "开始输入" : "Open input"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-ui-sm text-foreground-subtle">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
