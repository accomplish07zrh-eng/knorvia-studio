import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import { WorkspaceHelpMenuButton } from "@/WorkspaceHelpMenuButton.js";
import { cn } from "@/components/lib/utils.js";

interface StudioWindowChrome {
  navigationHost: HTMLDivElement | null;
}

const StudioWindowChromeContext = createContext<StudioWindowChrome | null>(null);

export const useStudioWindowChrome = () => useContext(StudioWindowChromeContext);

/** 外框只属于整个工作面；标题栏挂载点不接管原导航和窗口状态。 */
export function StudioWorkspaceFrame({
  enabled,
  isDesktop,
  isMacDesktop,
  children,
}: {
  enabled: boolean;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  children: ReactNode;
}) {
  const [navigationHost, setNavigationHost] = useState<HTMLDivElement | null>(null);
  const chrome = useMemo(() => ({ navigationHost }), [navigationHost]);
  // 跨越 Web 宽度断点时保留相同的父节点，不能因替换 Provider 而重挂聊天和草稿。
  return (
    <StudioWindowChromeContext.Provider value={enabled ? chrome : null}>
      <div className={cn("relative flex h-full min-w-0 flex-1 flex-col", enabled && "pb-1 pr-1")}>
        {enabled ? (
          <header
            data-testid="studio-window-titlebar"
            className="flex h-10 shrink-0 items-center [app-region:drag]"
          >
            <div ref={setNavigationHost} className="relative h-full min-w-0 flex-1" />
            {isDesktop ? (
              <div className="flex shrink-0 items-center gap-1 pr-2 [app-region:no-drag]">
                <WorkspaceHelpMenuButton isDesktop />
                {!isMacDesktop ? <DesktopWindowControls /> : null}
              </div>
            ) : null}
          </header>
        ) : null}
        <div
          data-studio-workspace-sheet={enabled ? "true" : undefined}
          className={cn(
            "relative min-h-0 flex-1",
            enabled && "overflow-hidden rounded-xl border border-border bg-background",
          )}
        >
          {children}
        </div>
      </div>
    </StudioWindowChromeContext.Provider>
  );
}
