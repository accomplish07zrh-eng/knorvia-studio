import type { ReactNode } from "react";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import { WorkspaceHelpMenuButton } from "@/WorkspaceHelpMenuButton.js";
import { cn } from "@/components/lib/utils.js";

/** New pages share the original desktop caption and content frame. */
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
  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-3 [app-region:drag]",
          !isSidebarVisible && "pl-44",
          isMacDesktop && !isSidebarVisible && "pl-64",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-ui-base font-medium">{label}</span>
        {isDesktop ? (
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
