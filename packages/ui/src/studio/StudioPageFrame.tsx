import type { ReactNode } from "react";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import { WorkspaceHelpMenuButton } from "@/WorkspaceHelpMenuButton.js";
import { cn } from "@/components/lib/utils.js";
import { useStudioWindowChrome } from "./StudioWorkspaceFrame.js";

/** 工具页共用窗口标题区，阅读底色由外层工作面提供，避免内部再铺不透明白块。 */
export function StudioPageFrame({
  label,
  isDesktop,
  isMacDesktop,
  isSidebarVisible,
  children,
}: {
  label: string;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isSidebarVisible: boolean;
  children: ReactNode;
}) {
  const sharedChrome = useStudioWindowChrome();
  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col">
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-3 [app-region:drag]",
          !sharedChrome && !isSidebarVisible && "pl-44",
          !sharedChrome && isMacDesktop && !isSidebarVisible && "pl-64",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-ui-base font-medium">{label}</span>
        {isDesktop && !sharedChrome ? (
          <div className="flex shrink-0 items-center gap-0.5 [app-region:no-drag]">
            <WorkspaceHelpMenuButton isDesktop />
            {!isMacDesktop ? <DesktopWindowControls /> : null}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </main>
  );
}
