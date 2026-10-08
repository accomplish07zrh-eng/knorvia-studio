import { AppWindow, MessageSquare, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import type { StudioDraftProjectMenuProps } from "../agents/StudioDraftProjectMenu.js";
import { WorkbenchConversation } from "./WorkbenchConversation.js";
import { canRenderWorkbenchPreview, WorkbenchPreview } from "./WorkbenchPreview.js";
import { WorkbenchTileSetup } from "./WorkbenchTileSetup.js";
import { workbenchTileView, type WorkbenchTile, type WorkbenchTileView } from "./workbenchModel.js";
import { useTaskWorkbench } from "./workbenchStore.js";

const VIEWS: Array<{
  view: WorkbenchTileView;
  icon: typeof PanelRight;
  zh: string;
  en: string;
}> = [
  { view: "split", icon: PanelRight, zh: "聊天＋预览", en: "Chat and preview" },
  { view: "chat", icon: MessageSquare, zh: "仅聊天", en: "Chat only" },
  { view: "preview", icon: AppWindow, zh: "仅预览", en: "Preview only" },
];

/** 标题栏三态视图切换（specs/knorvia-workbench-artifact-preview-20261008.md）；只改显示。 */
export function WorkbenchViewToggle({ pane, tile }: { pane: string; tile: WorkbenchTile }) {
  const { locale } = useKnorviaIntl(),
    zh = locale.startsWith("zh");
  const update = useTaskWorkbench((state) => state.update);
  const current = workbenchTileView(tile);
  return (
    <div
      role="group"
      aria-label={zh ? "格子视图" : "Tile view"}
      className="flex shrink-0 items-center rounded-full border border-border p-0.5"
    >
      {VIEWS.map(({ view, icon: Icon, zh: zhLabel, en }) => (
        <Button
          key={view}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={zh ? zhLabel : en}
          title={zh ? zhLabel : en}
          aria-pressed={current === view}
          data-testid={`workbench-view-${view}`}
          className={cn(
            "h-6 w-6 rounded-full p-0",
            current === view && "bg-card text-foreground shadow-sm",
          )}
          onClick={() => update(pane, { view }, tile.id)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}

/**
 * 格子主体：聊天始终保持挂载（仅预览时只从布局隐藏），预览按视图显示；
 * 宽度 ≥ 760px 左右并排，更窄时上下排列。
 */
export function WorkbenchTileBody({
  pane,
  tile,
  focused,
  visible,
  isDesktop,
  workspaceMenuProps,
  onOpenAgentSettings,
}: {
  pane: string;
  tile: WorkbenchTile;
  focused: boolean;
  visible: boolean;
  isDesktop: boolean;
  workspaceMenuProps: StudioDraftProjectMenuProps;
  onOpenAgentSettings(): void;
}) {
  if (!tile.opened) return <WorkbenchTileSetup pane={pane} tile={tile} />;
  const view = workbenchTileView(tile);
  const showChat = view !== "preview";
  // 不能渲染网页的环境（Web、远程项目）里，并排模式不占用半格显示说明，只在仅预览时说明原因。
  const showPreview =
    view === "preview" || (view === "split" && canRenderWorkbenchPreview(tile, isDesktop));
  return (
    <div className="@container h-full min-h-0">
      <div
        data-testid="workbench-tile-body"
        data-view={view}
        className="flex h-full min-h-0 flex-col @[760px]:flex-row"
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            !showChat && "hidden",
            showPreview && "border-b border-border @[760px]:border-r @[760px]:border-b-0",
          )}
        >
          <WorkbenchConversation
            pane={pane}
            tile={tile}
            focused={focused}
            visible={visible && showChat}
            isDesktop={isDesktop}
            workspaceMenuProps={workspaceMenuProps}
            onOpenAgentSettings={onOpenAgentSettings}
          />
        </div>
        <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", !showPreview && "hidden")}>
          <WorkbenchPreview tile={tile} visible={visible && showPreview} isDesktop={isDesktop} />
        </div>
      </div>
    </div>
  );
}
