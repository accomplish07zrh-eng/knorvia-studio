import { useEffect, useRef, type CSSProperties } from "react";
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
import { useTaskWorkbench } from "./workbenchStore.js";
import { normalizeWorkbenchZoom, workbenchMinimumSize } from "./workbenchModel.js";
import { WorkbenchTileBody } from "./WorkbenchTileBody.js";
import { WorkbenchTileHeader } from "./WorkbenchTileHeader.js";
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
  // 画布缩放用 CSS zoom：最小尺寸、分隔条与格内内容一起按显示尺寸缩放，指针换算保持一致。
  const zoom = normalizeWorkbenchZoom(board.zoom ?? 1);
  const style = {
    minWidth: minimum.width,
    minHeight: minimum.height,
    zoom,
    ...Object.fromEntries(
      layout.dividers.map((divider) => [`${SPLIT_VAR_PREFIX}${divider.splitId}`, divider.ratio]),
    ),
  } as CSSProperties;
  return (
    <div data-testid="task-workbench" className="flex h-full min-h-0 flex-col bg-background">
      <WorkbenchTaskList
        scopes={[
          scope,
          ...workspaceMenuProps.workspaceTabs,
          ...Object.values(board.tiles).map((tile) => tile.scope),
          ...board.shelved.map((tile) => tile.scope),
        ]}
        count={layout.leaves.length}
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
                <WorkbenchTileHeader pane={paneId} tile={tile} />
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
