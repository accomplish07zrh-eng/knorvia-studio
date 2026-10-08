import { useEffect, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { WorkbenchSplitDivider } from "@/v4/WorkbenchSplitDivider.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutTree.js";
import {
  collectWorkbenchLayout,
  dividerStyle,
  rectStyle,
  SPLIT_VAR_PREFIX,
} from "@/v4/workbenchLayout.js";
import type { StudioDraftProjectMenuProps } from "../agents/StudioDraftProjectMenu.js";
import { studioKernelOption } from "../types.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import { workbenchMinimumSize } from "./workbenchModel.js";
import { WorkbenchTileBody, WorkbenchViewToggle } from "./WorkbenchTileBody.js";
import { WorkbenchTaskList } from "./WorkbenchTaskList.js";
import type { StudioRoute } from "../useStudioNavigation.js";

export function TaskWorkbench({
  scope,
  isDesktop = false,
  workspaceMenuProps,
  onOpenAgentSettings,
  onOpenTarget,
}: {
  scope: PaneWorkspaceScope;
  isDesktop?: boolean;
  workspaceMenuProps: StudioDraftProjectMenuProps;
  onOpenAgentSettings(): void;
  onOpenTarget(route: Partial<StudioRoute>): void;
}) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const state = useTaskWorkbench();
  const container = useRef<HTMLDivElement | null>(null);
  useEffect(() => state.initialize(scope), [state.initialize, scope]);
  const board = state.board;
  if (!board) return null;
  const layout = collectWorkbenchLayout(board.layout.root);
  const minimum = board.maximized
    ? { width: 360, height: 300 }
    : workbenchMinimumSize(board.layout.root);
  const style = {
    minWidth: minimum.width,
    minHeight: minimum.height,
    ...Object.fromEntries(
      layout.dividers.map((divider) => [`${SPLIT_VAR_PREFIX}${divider.splitId}`, divider.ratio]),
    ),
  } as CSSProperties;
  return (
    <div data-testid="task-workbench" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 text-ui-sm">
        <p className="text-foreground-subtle">
          {zh ? "每格独立输入、审批和停止" : "Independent input, approvals and stop in every tile"}
        </p>
        <span className="shrink-0 text-ui-xs text-foreground-subtle">
          {layout.leaves.length} / 4
        </span>
      </div>
      <WorkbenchTaskList
        scopes={[
          scope,
          ...workspaceMenuProps.workspaceTabs,
          ...Object.values(board.tiles).map((tile) => tile.scope),
          ...board.shelved.map((tile) => tile.scope),
        ]}
        onOpenTarget={onOpenTarget}
      />
      {state.storageError && (
        <p role="alert" className="px-4 py-2 text-ui-sm">
          {zh
            ? "布局暂未保存，本次窗口内仍可使用。"
            : "Layout could not be saved. It remains available in this window."}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          ref={container}
          className="relative h-full w-full"
          style={style}
          data-testid="workbench-canvas"
        >
          {layout.leaves.map(({ paneId, rect }) => {
            const tile = board.tiles[paneId]!;
            const visible = !board.maximized || board.maximized === paneId;
            const focused =
              visible && (board.maximized === paneId || board.layout.focusedPaneId === paneId);
            return (
              <section
                key={tile.id}
                data-testid="workbench-tile"
                data-tile-id={tile.id}
                data-focused={focused}
                className="absolute flex min-h-0 min-w-0 flex-col overflow-hidden border border-border bg-background focus-within:border-foreground-subtle"
                style={
                  board.maximized
                    ? { inset: 0, display: visible ? undefined : "none" }
                    : rectStyle(rect)
                }
                onFocusCapture={() => state.focus(paneId)}
                onPointerDownCapture={() => state.focus(paneId)}
              >
                <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 text-ui-xs">
                  <span className="min-w-0 flex-1 truncate" title={tile.scope.workspacePath}>
                    {studioKernelOption(tile.kernel).name} ·{" "}
                    {tile.scope.workspacePath.split(/[\\/]/).filter(Boolean).pop() ||
                      (zh ? "待命" : "Ready")}
                  </span>
                  {tile.opened ? <WorkbenchViewToggle pane={paneId} tile={tile} /> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-ui-xs"
                    disabled={layout.leaves.length >= 4 || Boolean(board.maximized)}
                    onClick={() => state.split(paneId, "row")}
                    aria-label={zh ? "左右分格" : "Split right"}
                  >
                    {zh ? "左右" : "Right"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-ui-xs"
                    disabled={layout.leaves.length >= 4 || Boolean(board.maximized)}
                    onClick={() => state.split(paneId, "column")}
                    aria-label={zh ? "上下分格" : "Split down"}
                  >
                    {zh ? "上下" : "Down"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-ui-xs"
                    onClick={() => state.maximize(paneId)}
                    aria-label={
                      board.maximized === paneId
                        ? zh
                          ? "返回布局"
                          : "Restore layout"
                        : zh
                          ? "放大格子"
                          : "Maximize tile"
                    }
                  >
                    {board.maximized === paneId
                      ? zh
                        ? "返回"
                        : "Restore"
                      : zh
                        ? "放大"
                        : "Expand"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-ui-xs"
                    onClick={() => state.close(paneId)}
                    disabled={board.shelved.length >= 64}
                    title={
                      zh
                        ? "收起格子，后台任务继续，草稿可恢复"
                        : "Shelve tile; keep the task running and restore drafts later"
                    }
                    aria-label={zh ? "收起格子" : "Shelve tile"}
                  >
                    ×
                  </Button>
                </header>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <WorkbenchTileBody
                    pane={paneId}
                    tile={tile}
                    focused={focused}
                    visible={visible}
                    isDesktop={isDesktop}
                    workspaceMenuProps={workspaceMenuProps}
                    onOpenAgentSettings={onOpenAgentSettings}
                  />
                </div>
              </section>
            );
          })}
          {!board.maximized &&
            layout.dividers.map((divider) => (
              <WorkbenchSplitDivider
                key={divider.splitId}
                containerRef={container}
                {...divider}
                style={dividerStyle(divider)}
                onCommitRatio={state.ratio}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
