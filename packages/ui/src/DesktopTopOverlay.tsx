import { cn } from "@/components/lib/utils.js";
import { DesktopTopOverlayActionButton } from "@/DesktopTopOverlayActionButton.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { createWindowsCaptionControlsStyle } from "@/windowCaptionControls.js";
import type { IPlatformService } from "@knorvia/shared";
import { createPortal } from "react-dom";
import { useStudioWindowChrome } from "@/studio/StudioWorkspaceFrame.js";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MessageCirclePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";

interface DesktopTopOverlayProps {
  visible?: boolean;
  showBrandLogo?: boolean;
  showSidebarToggle?: boolean;
  sidebarWidthPx?: number;
  workspaceAbsPath: string;
  isMacDesktop?: boolean;
  isMacFullscreen?: boolean;
  isWindowsDesktop?: boolean;
  isDesktop?: boolean;
  macWindowControlsLeftPaddingPx?: number;
  windowsWindowControlsRightPaddingPx?: number;
  isSidebarVisible: boolean;
  toggleSidebarShortcutLabel: string;
  newTaskShortcutLabel: string;
  goBackShortcutLabel: string;
  goForwardShortcutLabel: string;
  canTaskNavBack: boolean;
  canTaskNavForward: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  showNewTaskButton?: boolean;
  appLogoUrl: string;
  platform: IPlatformService;
  onToggleSidebar: () => void;
  onCreateTask: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  hideTaskNavigationButtons?: boolean;
  newTaskDisabledReason?: string;
  onOpenSearch?: () => void;
  searchShortcutLabel?: string;
}

export function DesktopTopOverlay({
  visible = true,
  showBrandLogo = true,
  showSidebarToggle = true,
  sidebarWidthPx,
  workspaceAbsPath: _workspaceAbsPath,
  isMacDesktop,
  isMacFullscreen,
  isWindowsDesktop,
  isDesktop,
  macWindowControlsLeftPaddingPx,
  windowsWindowControlsRightPaddingPx,
  isSidebarVisible,
  toggleSidebarShortcutLabel,
  newTaskShortcutLabel,
  goBackShortcutLabel,
  goForwardShortcutLabel,
  canTaskNavBack,
  canTaskNavForward,
  canGoBack: _canGoBack,
  canGoForward: _canGoForward,
  showNewTaskButton,
  appLogoUrl,
  onToggleSidebar,
  onCreateTask,
  onGoBack,
  onGoForward,
  hideTaskNavigationButtons = false,
  newTaskDisabledReason,
  onOpenSearch,
  searchShortcutLabel,
}: DesktopTopOverlayProps) {
  const { intl } = useKnorviaIntl();
  const sharedChrome = useStudioWindowChrome();
  const SidebarToggleIcon = isSidebarVisible ? PanelLeftClose : PanelLeftOpen;
  const isLinuxDesktop = Boolean(isDesktop && !isMacDesktop && !isWindowsDesktop);
  const usesCustomCaptionArea = isWindowsDesktop || isLinuxDesktop;
  const toggleSidebarTitle = intl.formatMessage({
    id: "workspaceSidebar.toggleSidebar",
  });
  const newTaskTitle = intl.formatMessage({ id: "sidebar.newTask" });
  const taskBackTitle = intl.formatMessage({ id: "taskNav.back" });
  const taskForwardTitle = intl.formatMessage({ id: "taskNav.forward" });
  const isNewTaskButtonVisible = showNewTaskButton ?? !isSidebarVisible;
  const macTopOverlayPaddingStyle =
    isMacDesktop && !isMacFullscreen && Number.isFinite(macWindowControlsLeftPaddingPx)
      ? {
          paddingLeft: `${Math.max(0, Math.round(macWindowControlsLeftPaddingPx ?? 96) - (sharedChrome ? 56 : 0))}px`,
        }
      : undefined;
  const windowsTopOverlayPaddingStyle = isWindowsDesktop
    ? {
        ...createWindowsCaptionControlsStyle(windowsWindowControlsRightPaddingPx),
        // 此处工具组位于左侧；预留右侧窗控宽度会把新搜索按钮挤出侧栏。
        paddingRight: 0,
      }
    : undefined;
  const topOverlayWidthStyle = isSidebarVisible
    ? { width: sharedChrome ? sidebarWidthPx : "var(--workspace-sidebar-panel-width)" }
    : undefined;

  const overlay = (
    <div
      style={topOverlayWidthStyle}
      className={cn(
        "@container/topoverlayer pointer-events-none flex left-0 top-0 z-20 w-fit max-w-full",
        sharedChrome ? "relative h-10" : "absolute h-14",
        // Windows/Linux 主面板新增 4px 留白及 1px 边框，左侧工具组需同步偏移才能对齐 Header 中心线。
        !sharedChrome && usesCustomCaptionArea && "top-1 mt-px",
      )}
    >
      <div
        style={{
          ...macTopOverlayPaddingStyle,
          ...windowsTopOverlayPaddingStyle,
        }}
        className={cn(
          "flex items-center",
          sharedChrome ? "h-10" : isMacDesktop ? "h-14" : "h-12",
          // Windows/Linux 工具组计入 4px 外沿留白和 1px 边框，较 8px 左边距右移 5px。
          usesCustomCaptionArea && "pl-3 ml-px",
          !sharedChrome &&
            isMacDesktop &&
            (isMacFullscreen ? (!isSidebarVisible ? "pl-5 pt-1" : "pl-3 pt-1") : "pt-1"),
        )}
      >
        <div
          className={cn(
            // 顶部浮层按钮虽然单个按钮打了 no-drag，但外层容器本身仍悬在窗口标题区上方。
            // Electron 在这类覆盖层上会优先按父级命中拖拽区域，导致点击被窗口拖动吞掉。
            // 这里把整块交互容器一起标成 no-drag，确保展开/收起和新建 task 都能稳定点击。
            "pointer-events-auto flex items-center gap-1 shrink-0 [app-region:no-drag]",
          )}
        >
          {showSidebarToggle && usesCustomCaptionArea && (
            <DesktopTopOverlayActionButton
              title={toggleSidebarTitle}
              shortcut={toggleSidebarShortcutLabel}
              ariaLabel={toggleSidebarTitle}
              buttonClassName="group relative overflow-hidden rounded-lg"
              onClick={onToggleSidebar}
            >
              {showBrandLogo ? (
                <img
                  src={appLogoUrl}
                  alt="Knorvia Studio"
                  className="size-5 transition-opacity duration-150 group-hover:opacity-0"
                  draggable={false}
                />
              ) : null}
              <SidebarToggleIcon
                className={cn(
                  "absolute inset-0 m-auto size-4",
                  showBrandLogo &&
                    "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                )}
              />
            </DesktopTopOverlayActionButton>
          )}

          {showSidebarToggle && isMacDesktop && (
            <DesktopTopOverlayActionButton
              title={toggleSidebarTitle}
              shortcut={toggleSidebarShortcutLabel}
              ariaLabel={toggleSidebarTitle}
              onClick={onToggleSidebar}
            >
              <SidebarToggleIcon className="size-4" />
            </DesktopTopOverlayActionButton>
          )}

          {/* 远程控制移动端左上角空间有限，任务前进/后退在这里会与主操作拥挤重叠。*/}
          {hideTaskNavigationButtons ? null : (
            <>
              <DesktopTopOverlayActionButton
                title={taskBackTitle}
                shortcut={goBackShortcutLabel}
                ariaLabel={taskBackTitle}
                testId="desktop-top-nav-back"
                disabled={!canTaskNavBack}
                onClick={onGoBack}
              >
                <ArrowLeftIcon className="size-4" />
              </DesktopTopOverlayActionButton>
              <DesktopTopOverlayActionButton
                title={taskForwardTitle}
                shortcut={goForwardShortcutLabel}
                ariaLabel={taskForwardTitle}
                disabled={!canTaskNavForward}
                onClick={onGoForward}
              >
                <ArrowRightIcon className="size-4" />
              </DesktopTopOverlayActionButton>
            </>
          )}

          <div
            aria-hidden={!isNewTaskButtonVisible}
            inert={!isNewTaskButtonVisible ? true : undefined}
            className={cn(
              "inline-flex overflow-hidden transition-[opacity,width] duration-300 ease-out",
              isNewTaskButtonVisible ? "w-7 opacity-100" : "pointer-events-none w-0 opacity-0",
            )}
          >
            <DesktopTopOverlayActionButton
              title={newTaskDisabledReason ?? newTaskTitle}
              shortcut={newTaskShortcutLabel}
              ariaLabel={newTaskTitle}
              disabled={Boolean(newTaskDisabledReason)}
              onClick={onCreateTask}
            >
              <MessageCirclePlus className="size-4" />
            </DesktopTopOverlayActionButton>
          </div>

          {/* <div className="flex items-center [app-region:no-drag]"> */}
          {/* 侧栏收起后，更新按钮之前会跟着“展开态的容器宽度阈值”一起被隐藏。
                  但收起态本身已经改成把操作集中到顶部浮层里，如果这里还继续依赖侧栏宽度判断，
                  用户就会在最需要全局入口的时候反而看不到更新按钮。
                  所以展开态继续走容器查询，收起态则强制显示。 */}

          {/* </div> */}
        </div>
      </div>
      {onOpenSearch ? (
        <div className="pointer-events-auto ml-auto flex h-full shrink-0 items-center pr-3 [app-region:no-drag]">
          <DesktopTopOverlayActionButton
            title={intl.formatMessage({ id: "commandCenter.open" })}
            shortcut={searchShortcutLabel}
            ariaLabel={intl.formatMessage({ id: "commandCenter.open" })}
            testId="studio-search-open"
            onClick={onOpenSearch}
          >
            <Search className="size-4" />
          </DesktopTopOverlayActionButton>
        </div>
      ) : null}
    </div>
  );
  // Portal 只改变几何归属；展开、历史和搜索仍调用工作区的原动作。
  return !visible
    ? null
    : sharedChrome
      ? sharedChrome.navigationHost
        ? createPortal(overlay, sharedChrome.navigationHost)
        : null
      : overlay;
}
