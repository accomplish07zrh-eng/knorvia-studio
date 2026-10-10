import { Ellipsis, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioKernelOption } from "../types.js";
import type { WorkbenchTile } from "./workbenchModel.js";
import { canSplitWorkbenchPane } from "./workbenchPlacement.js";
import { useTaskWorkbench } from "./workbenchStore.js";
import { WorkbenchViewToggle } from "./WorkbenchTileBody.js";

/**
 * 格子标题栏按自身宽度自适应（specs/knorvia-workbench-usability-20261008.md）：
 * 宽格显示「左右」「上下」文字按钮；窄格只留标题、视图切换、放大与移出，
 * 分格与「在此格新建任务」始终在「⋯」菜单里。
 */
export function WorkbenchTileHeader({ pane, tile }: { pane: string; tile: WorkbenchTile }) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const state = useTaskWorkbench();
  const board = state.board!;
  const maximized = board.maximized === pane;
  const canRight = !board.maximized && canSplitWorkbenchPane(board, pane, "row");
  const canDown = !board.maximized && canSplitWorkbenchPane(board, pane, "column");
  const icon = "size-3.5";
  const project = tile.scope.workspacePath.split(/[\\/]/).filter(Boolean).pop();
  return (
    <div className="@container shrink-0 border-b border-border">
      <header className="flex h-9 items-center gap-1 px-2 text-ui-xs">
        <span className="min-w-0 flex-1 truncate" title={tile.scope.workspacePath}>
          {studioKernelOption(tile.kernel).name} · {project || (zh ? "待命" : "Ready")}
        </span>
        {tile.opened ? <WorkbenchViewToggle pane={pane} tile={tile} /> : null}
        <Button
          variant="ghost"
          size="sm"
          className="hidden h-7 px-2 text-ui-xs @[520px]:inline-flex"
          disabled={!canRight}
          onClick={() => state.split(pane, "row")}
          aria-label={zh ? "左右分格" : "Split right"}
        >
          {zh ? "左右" : "Right"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="hidden h-7 px-2 text-ui-xs @[520px]:inline-flex"
          disabled={!canDown}
          onClick={() => state.split(pane, "column")}
          aria-label={zh ? "上下分格" : "Split down"}
        >
          {zh ? "上下" : "Down"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={() => state.maximize(pane)}
          aria-label={
            maximized ? (zh ? "返回布局" : "Restore layout") : zh ? "放大格子" : "Maximize tile"
          }
          title={
            maximized ? (zh ? "返回布局" : "Restore layout") : zh ? "放大格子" : "Maximize tile"
          }
        >
          {maximized ? (
            <Minimize2 className={icon} aria-hidden="true" />
          ) : (
            <Maximize2 className={icon} aria-hidden="true" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              aria-label={zh ? "更多格子操作" : "More tile actions"}
              title={zh ? "更多格子操作" : "More tile actions"}
              data-testid="workbench-tile-menu"
            >
              <Ellipsis className={icon} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid="workbench-renew"
              onSelect={() => state.renew(pane, tile.id)}
            >
              {zh ? "在此格新建任务" : "New task in this tile"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canRight} onSelect={() => state.split(pane, "row")}>
              {zh ? "左右分格" : "Split right"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canDown} onSelect={() => state.split(pane, "column")}>
              {zh ? "上下分格" : "Split down"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={() => state.close(pane)}
          data-testid="workbench-remove-tile"
          title={
            zh
              ? "移出工作台：任务继续运行，会话仍在原内核记录中，可随时再添加"
              : "Remove from workbench: the task keeps running and the conversation stays in its kernel history"
          }
          aria-label={zh ? "移出工作台" : "Remove from workbench"}
        >
          <X className={icon} aria-hidden="true" />
        </Button>
      </header>
    </div>
  );
}
