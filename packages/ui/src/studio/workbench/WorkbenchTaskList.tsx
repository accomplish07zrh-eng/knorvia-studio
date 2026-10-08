import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutTree.js";
import type { StudioRoute } from "../useStudioNavigation.js";
import { studioKernelOption } from "../types.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import { useWorkbenchTasks } from "./useWorkbenchTasks.js";
import { workbenchPaneFor } from "./workbenchPlacement.js";
import type { WorkbenchTaskState } from "./workbenchTasks.js";

const labels: Record<WorkbenchTaskState, [string, string]> = {
  running: ["运行中", "Running"],
  queued: ["排队", "Queued"],
  waiting: ["等待中", "Waiting"],
  approval: ["等待审批", "Waiting for approval"],
  input: ["等待输入", "Waiting for input"],
};
export function WorkbenchTaskList({
  scopes,
  onOpenTarget,
}: {
  scopes: PaneWorkspaceScope[];
  onOpenTarget(route: Partial<StudioRoute>): void;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const state = useTaskWorkbench(),
    board = state.board!;
  const tasks = useWorkbenchTasks(scopes);
  const [expanded, setExpanded] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [error, setError] = useState(false);
  const shown = tasks.rows.filter((row) => row.tile && workbenchPaneFor(board, row.tile)).length;
  const actionable = !tasks.loading && !tasks.error;
  return (
    <div className="shrink-0 border-b border-border text-ui-sm">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="workbench-collect"
          disabled={!actionable}
          onClick={() => {
            setExpanded(true);
            state.collect(
              tasks.rows.filter((row) => row.tile && !row.unavailable).map((row) => row.tile!),
            );
          }}
        >
          {tasks.loading
            ? zh
              ? "正在读取任务…"
              : "Reading tasks…"
            : zh
              ? "汇总进行中任务"
              : "Collect active tasks"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {zh ? "任务列表" : "Task list"} ({tasks.rows.length})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="workbench-shelf-toggle"
          onClick={() => setShelfOpen(!shelfOpen)}
          aria-expanded={shelfOpen}
        >
          {zh ? "已收起" : "Shelved"} ({board.shelved.length})
        </Button>
        <p className="text-ui-xs text-foreground-subtle">
          {zh
            ? "收起不停止任务，草稿保留；停止请用格内按钮。"
            : "Shelving keeps tasks and drafts. Use Stop inside a tile to stop a task."}
        </p>
      </div>
      {(tasks.partial || tasks.error) && (
        <p role="status" className="px-4 pb-2 text-ui-xs text-foreground-subtle">
          {zh
            ? "部分来源离线、不可用或未完整返回；下列仅为已知任务。"
            : "Some sources are offline, unavailable or incomplete. Only known tasks are listed."}
          {tasks.error && <span> {tasks.error}</span>}
          <Button size="sm" variant="ghost" onClick={tasks.refresh}>
            {zh ? "刷新" : "Refresh"}
          </Button>
        </p>
      )}
      {(error || board.shelved.length >= 64) && (
        <p role="alert" className="px-4 pb-2 text-ui-xs">
          {zh
            ? "已收起列表已满（64）；可恢复已有项来切换，不会丢弃草稿。"
            : "The shelf is full (64). Restore a shelved tile to swap without discarding drafts."}
        </p>
      )}
      {expanded && (
        <div
          data-testid="workbench-active-list"
          className="max-h-64 overflow-auto border-t border-border px-4 py-2"
        >
          <p data-testid="workbench-active-count" className="pb-2 font-medium">
            {zh
              ? `${tasks.rows.length} 个进行中 · ${shown} 个已在格内 · ${tasks.rows.length - shown} 个未纳入`
              : `${tasks.rows.length} active · ${shown} in tiles · ${tasks.rows.length - shown} not included`}
          </p>
          {tasks.rows.map((row) => {
            const pane = row.tile ? workbenchPaneFor(board, row.tile) : undefined;
            return (
              <div
                key={row.key}
                data-testid="workbench-active-row"
                className="flex items-center gap-3 border-t border-border py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate" title={row.title}>
                    {row.title} ·{" "}
                    {row.states.map((status) => labels[status][zh ? 0 : 1]).join(" / ")}
                  </p>
                  <p
                    className="truncate text-ui-xs text-foreground-subtle"
                    title={row.workspacePath}
                  >
                    {row.tile && `${studioKernelOption(row.tile.kernel).name} · `}
                    {row.workspacePath}
                  </p>
                  {row.unavailable && (
                    <p className="text-ui-xs">
                      {zh
                        ? "来源离线或目标缺失，状态待确认"
                        : "Source offline or target missing; status unconfirmed"}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!actionable || row.unavailable}
                  onClick={() => {
                    if (row.tile) setError(!state.show(row.tile));
                    else if (row.route) onOpenTarget(row.route);
                  }}
                >
                  {row.tile
                    ? pane
                      ? zh
                        ? "查看格子"
                        : "Show tile"
                      : zh
                        ? "加入 / 切换当前格"
                        : "Add / switch current tile"
                    : zh
                      ? "打开原页面"
                      : "Open original page"}
                </Button>
              </div>
            );
          })}
          {tasks.rows.length === 0 && (
            <p className="text-foreground-subtle">
              {zh ? "当前没有已知进行中的任务。" : "No known active tasks."}
            </p>
          )}
        </div>
      )}
      {shelfOpen && (
        <div
          data-testid="workbench-shelf"
          className="max-h-48 overflow-auto border-t border-border px-4 py-2"
        >
          {board.shelved.map((tile) => (
            <div
              key={tile.id}
              data-testid="workbench-shelved-row"
              className="flex items-center gap-3 py-1"
            >
              <span className="min-w-0 flex-1 truncate" title={tile.scope.workspacePath}>
                {studioKernelOption(tile.kernel).name} · {tile.scope.workspacePath} ·{" "}
                {tile.sessionId || (zh ? "未发送草稿 / 待命配置" : "Unsent draft / setup")}
              </span>
              <Button size="sm" variant="outline" onClick={() => setError(!state.show(tile))}>
                {zh ? "恢复 / 切换当前格" : "Restore / switch current tile"}
              </Button>
            </div>
          ))}
          {!board.shelved.length && (
            <p className="text-foreground-subtle">
              {zh ? "暂无已收起格子。" : "No shelved tiles."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
