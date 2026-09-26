import { useState, type ReactNode } from "react";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import { WorkspaceHelpMenuButton } from "@/WorkspaceHelpMenuButton.js";
import { cn } from "@/components/lib/utils.js";
import { useStudioWindowChrome } from "@/studio/StudioWorkspaceFrame.js";
import {
  SettingsBreadcrumbProvider,
  SettingsHeaderBreadcrumb,
  type SettingsBreadcrumbItem,
} from "@/settings/SettingsHeaderBreadcrumb.js";

/**
 * 工作区 Automations 不经过 SettingsPage，编辑页的面包屑上报需要 Provider 接收，
 * 所以桌面顶栏只剩空拖拽区；这里让工作区入口复用设置页的同一套面包屑合同。
 */
export function AutomationsMainBreadcrumbFrame({
  ariaLabel,
  children,
  isDesktop,
  isMacDesktop,
  isSidebarVisible,
  sectionLabel,
}: {
  ariaLabel: string;
  children: ReactNode;
  isDesktop: boolean;
  isMacDesktop?: boolean;
  isSidebarVisible: boolean;
  sectionLabel: string;
}) {
  const [items, setItems] = useState<readonly SettingsBreadcrumbItem[]>([]);
  const sharedChrome = useStudioWindowChrome();

  return (
    <SettingsBreadcrumbProvider onItemsChange={setItems} sectionLabel={sectionLabel}>
      <div className="flex min-h-0 flex-1 flex-col">
        {isDesktop ? (
          <div
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 pr-3 [app-region:drag]",
              !sharedChrome && !isSidebarVisible && (isMacDesktop ? "pl-64" : "pl-44"),
            )}
            data-testid="automations-main-drag-region"
          >
            <div className="h-full min-w-0 flex-1">
              <SettingsHeaderBreadcrumb ariaLabel={ariaLabel} items={items} />
            </div>
            {/* 自动化使用独立面包屑顶栏，不经过聊天 Header，必须保留帮助和原生窗控入口。 */}
            {!sharedChrome ? (
              <div className="flex shrink-0 items-center gap-0.5 [app-region:no-drag]">
                <WorkspaceHelpMenuButton isDesktop />
                {!isMacDesktop ? <DesktopWindowControls /> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </SettingsBreadcrumbProvider>
  );
}
