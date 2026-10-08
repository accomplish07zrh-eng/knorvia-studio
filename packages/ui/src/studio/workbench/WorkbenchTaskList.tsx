import { useState, type ReactNode } from "react";
import { Archive, Info, List, ListChecks, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutTree.js";
import type { StudioRoute } from "../useStudioNavigation.js";
import { studioKernelOption } from "../types.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import { useWorkbenchTasks } from "./useWorkbenchTasks.js";
import { workbenchPaneFor } from "./workbenchPlacement.js";
import type { StudioAttentionRow } from "../attention/attentionRows.js";
import {
  useWorkbenchAttention,
  WorkbenchAttentionIcon,
  WorkbenchAttentionPanel,
} from "./WorkbenchAttention.js";
import { normalizeWorkbenchZoom, WORKBENCH_TILE_LIMIT, WORKBENCH_ZOOM } from "./workbenchModel.js";
import type { WorkbenchTaskState } from "./workbenchTasks.js";

const labels: Record<WorkbenchTaskState, [string, string]> = {
  running: ["运行中", "Running"],
  queued: ["排队", "Queued"],
  waiting: ["等待中", "Waiting"],
  approval: ["等待审批", "Waiting for approval"],
  input: ["等待输入", "Waiting for input"],
};
/** 窄顶栏只显示图标；完整名称保留在 aria-label 与悬停提示（specs/knorvia-workbench-usability-20261008.md）。 */
function ToolbarButton({
  icon,
  label,
  text,
  ...props
}: React.ComponentProps<typeof Button> & {
  icon: ReactNode;
  label: string;
  text?: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 shrink-0 gap-1 px-2 text-ui-xs"
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
      <span className="hidden @[720px]:inline">{text ?? label}</span>
    </Button>
  );
}

/** 工作台顶栏：一行容纳新建、汇总、列表、收起与缩放；列表与收起以浮层展开，不挤压格子。 */
export function WorkbenchTaskList({
  scopes,
  count,
  workspaceTabs,
  onOpenTarget,
  onOpenAttention,
}: {
  scopes: PaneWorkspaceScope[];
  count: number;
  workspaceTabs: PaneWorkspaceScope[];
  onOpenTarget(route: Partial<StudioRoute>): void;
  onOpenAttention(row: StudioAttentionRow): void;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const state = useTaskWorkbench(),
    board = state.board!;
  const tasks = useWorkbenchTasks(scopes);
  // 三个浮层互斥：任务列表、已收起、待办。
  const [panel, setPanel] = useState<"tasks" | "shelf" | "attention" | null>(null);
  const expanded = panel === "tasks",
    shelfOpen = panel === "shelf";
  const { attention, count: attentionCount } = useWorkbenchAttention(workspaceTabs, (row) => {
    setPanel(null);
    onOpenAttention(row);
  });
  const [error, setError] = useState(false);
  const shown = tasks.rows.filter((row) => row.tile && workbenchPaneFor(board, row.tile)).length;
  const actionable = !tasks.loading && !tasks.error;
  // 浮层覆盖在格子上方：成功放入/恢复后收起浮层，直接露出目标格子。
  const reveal = (tile: Parameters<typeof state.show>[0]) => {
    const shown = state.show(tile);
    setError(!shown);
    if (!shown) return;
    setPanel(null);
  };
  const zoom = normalizeWorkbenchZoom(board.zoom ?? 1);
  const full = count >= WORKBENCH_TILE_LIMIT;
  const icon = "size-3.5";
  const createLabel = full
    ? zh
      ? "新建任务（已满 8 格：收起当前格后放入）"
      : "New task (8 tiles: shelves the focused tile)"
    : zh
      ? "新建任务"
      : "New task";
  return (
    <div className="relative z-20 shrink-0 border-b border-border text-ui-sm">
      <div className="@container">
        <div className="flex h-9 items-center gap-1 overflow-x-auto px-2 whitespace-nowrap">
          <ToolbarButton
            data-testid="workbench-new-task"
            variant="outline"
            icon={<Plus className={icon} aria-hidden="true" />}
            label={createLabel}
            text={zh ? "新建任务" : "New task"}
            onClick={() => setError(!state.create())}
          />
          <ToolbarButton
            data-testid="workbench-collect"
            disabled={!actionable}
            icon={<ListChecks className={icon} aria-hidden="true" />}
            label={
              tasks.loading
                ? zh
                  ? "正在读取任务…"
                  : "Reading tasks…"
                : zh
                  ? "汇总进行中任务"
                  : "Collect active tasks"
            }
            onClick={() => {
              setPanel("tasks");
              state.collect(
                tasks.rows.filter((row) => row.tile && !row.unavailable).map((row) => row.tile!),
              );
            }}
          />
          <ToolbarButton
            icon={<List className={icon} aria-hidden="true" />}
            label={`${zh ? "任务列表" : "Task list"} (${tasks.rows.length})`}
            aria-expanded={expanded}
            onClick={() => {
              setPanel(expanded ? null : "tasks");
            }}
          />
          <ToolbarButton
            data-testid="workbench-shelf-toggle"
            icon={<Archive className={icon} aria-hidden="true" />}
            label={`${zh ? "已收起" : "Shelved"} (${board.shelved.length})`}
            aria-expanded={shelfOpen}
            onClick={() => {
              setPanel(shelfOpen ? null : "shelf");
            }}
          />
          <ToolbarButton
            data-testid="workbench-attention-toggle"
            icon={<WorkbenchAttentionIcon />}
            label={`${zh ? "待办" : "Attention"} (${attentionCount})`}
            aria-expanded={panel === "attention"}
            onClick={() => setPanel(panel === "attention" ? null : "attention")}
          />
          <span
            className="flex shrink-0 items-center px-1 text-foreground-subtle"
            role="note"
            aria-label={
              zh
                ? "每格独立输入、审批和停止；收起不停止任务，草稿保留；停止请用格内按钮。"
                : "Each tile has its own input, approvals and stop. Shelving keeps tasks and drafts."
            }
            title={
              zh
                ? "每格独立输入、审批和停止；收起不停止任务，草稿保留；停止请用格内按钮。"
                : "Each tile has its own input, approvals and stop. Shelving keeps tasks and drafts."
            }
          >
            <Info className={icon} aria-hidden="true" />
          </span>
          <span className="min-w-2 flex-1" />
          <div
            role="group"
            aria-label={zh ? "画布缩放" : "Canvas zoom"}
            className="flex shrink-0 items-center"
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label={zh ? "缩小画布" : "Zoom out"}
              title={zh ? "缩小画布" : "Zoom out"}
              data-testid="workbench-zoom-out"
              disabled={zoom <= WORKBENCH_ZOOM.min}
              onClick={() => state.zoom(zoom - WORKBENCH_ZOOM.step)}
            >
              <ZoomOut className={icon} aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 min-w-11 px-1 text-ui-xs tabular-nums"
              aria-label={
                zh
                  ? `缩放 ${Math.round(zoom * 100)}%，点击复位`
                  : `Zoom ${Math.round(zoom * 100)}%, reset`
              }
              title={zh ? "复位到 100%" : "Reset to 100%"}
              data-testid="workbench-zoom-reset"
              onClick={() => state.zoom(1)}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label={zh ? "放大画布" : "Zoom in"}
              title={zh ? "放大画布" : "Zoom in"}
              data-testid="workbench-zoom-in"
              disabled={zoom >= WORKBENCH_ZOOM.max}
              onClick={() => state.zoom(zoom + WORKBENCH_ZOOM.step)}
            >
              <ZoomIn className={icon} aria-hidden="true" />
            </Button>
          </div>
          <span
            data-testid="workbench-tile-count"
            className="shrink-0 px-1 text-ui-xs text-foreground-subtle tabular-nums"
          >
            {count} / {WORKBENCH_TILE_LIMIT}
          </span>
        </div>
      </div>
      {(error || board.shelved.length >= 64) && !panel && (
        <p role="alert" className="border-t border-border px-4 py-1 text-ui-xs">
          {zh
            ? "已收起列表已满（64）；可恢复已有项来切换，不会丢弃草稿。"
            : "The shelf is full (64). Restore a shelved tile to swap without discarding drafts."}
        </p>
      )}
      {panel && (
        <div
          data-testid="workbench-toolbar-panel"
          className="absolute top-full left-2 mt-1 max-h-[60vh] w-[min(36rem,calc(100%-1rem))] overflow-auto rounded-xl border border-border bg-background shadow-lg"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setPanel(null);
          }}
        >
          {expanded && (tasks.partial || tasks.error) && (
            <p role="status" className="px-4 pt-2 text-ui-xs text-foreground-subtle">
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
            <p role="alert" className="px-4 pt-2 text-ui-xs">
              {zh
                ? "已收起列表已满（64）；可恢复已有项来切换，不会丢弃草稿。"
                : "The shelf is full (64). Restore a shelved tile to swap without discarding drafts."}
            </p>
          )}
          {expanded && (
            <div data-testid="workbench-active-list" className="px-4 py-2">
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
                        if (row.tile) reveal(row.tile);
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
          {panel === "attention" && <WorkbenchAttentionPanel attention={attention} />}
          {shelfOpen && (
            <div data-testid="workbench-shelf" className="px-4 py-2">
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
                  <Button size="sm" variant="outline" onClick={() => reveal(tile)}>
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
      )}
    </div>
  );
}
