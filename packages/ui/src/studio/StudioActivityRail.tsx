import { CalendarClock, Images, MessageSquare, Puzzle, Users, Workflow } from "lucide-react";
import { TID_AUTOMATIONS_OPEN } from "@knorvia/shared";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  setPendingSettingsPluginIntent,
  setPendingSettingsSection,
} from "@/lib/settingsNavigation.js";
import { useKnorviaStore } from "@/store/StoreProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { StudioKernelRail } from "./agents/StudioKernelRail.js";
import type { StudioNavigation } from "./useStudioNavigation.js";

export function StudioActivityRail({
  navigation,
  settingsActive,
  onReturnToWorkspace,
  isDesktop = false,
  isMacDesktop = false,
}: {
  navigation: StudioNavigation;
  settingsActive: boolean;
  onReturnToWorkspace: () => void;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
}) {
  const { intl, localePreference, setLocalePreference } = useKnorviaIntl();
  const theme = useKnorviaStore((state) => state.theme);
  const setTheme = useKnorviaStore((state) => state.setTheme);
  const openSettings = useTabStore((state) => state.openSettingsTab);
  const returnToWorkspace = () => {
    if (settingsActive) onReturnToWorkspace();
  };
  const isChat = navigation.route.view === "chat" || navigation.route.view === "external-chat";
  const tools = [
    { id: "chat", label: "studio.single", icon: MessageSquare, testId: "studio-chats-open" },
    { id: "groups", label: "studio.groups", icon: Users, testId: "studio-groups-open" },
    {
      id: "automations",
      label: "workspace.openScheduledSettings",
      icon: CalendarClock,
      testId: TID_AUTOMATIONS_OPEN,
    },
    { id: "workflows", label: "studio.workflows", icon: Workflow, testId: "studio-workflows-open" },
    {
      id: "creation",
      label: "studio.creation.title",
      icon: Images,
      testId: "studio-creation-open",
    },
  ] as const;

  return (
    <aside
      data-testid="studio-activity-rail"
      className="flex h-full w-14 shrink-0 flex-col items-center bg-sidebar text-foreground"
    >
      <div className={cn("h-14 w-full shrink-0 [app-region:drag]", isMacDesktop && "h-16")} />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-auto px-1 pb-3 [scrollbar-width:none]">
        <nav
          aria-label={intl.formatMessage({ id: "studio.rail.tools" })}
          className="flex shrink-0 flex-col gap-1"
        >
          {tools.map(({ id, label, icon: Icon, testId }) => {
            const active =
              !settingsActive && (id === "chat" ? isChat : navigation.route.view === id);
            const title = intl.formatMessage({ id: label });
            return (
              <ControlHintTooltip key={id} title={title} side="right">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className={cn(
                    "size-9 text-foreground-subtle",
                    active && "bg-selected text-foreground",
                  )}
                  aria-label={title}
                  aria-pressed={active}
                  data-testid={testId}
                  onClick={() => {
                    returnToWorkspace();
                    if (id === "chat") navigation.openKernel(navigation.route.kernelId);
                    else if (id === "groups") navigation.selectGroup(navigation.route.groupId);
                    else navigation.navigate({ view: id });
                  }}
                >
                  <Icon className="size-5" />
                </Button>
              </ControlHintTooltip>
            );
          })}
          <ControlHintTooltip
            title={intl.formatMessage({ id: "settings.plugins.title" })}
            side="right"
          >
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-9 text-foreground-subtle"
              aria-label={intl.formatMessage({ id: "settings.plugins.title" })}
              data-testid="studio-plugins-open"
              onClick={() => {
                setPendingSettingsPluginIntent("plugins");
                openSettings();
              }}
            >
              <Puzzle className="size-5" />
            </Button>
          </ControlHintTooltip>
        </nav>
        <div className="w-5 shrink-0 border-t border-border" />
        <StudioKernelRail
          value={navigation.route.kernelId}
          active={!settingsActive && isChat}
          onSelect={(id) => {
            returnToWorkspace();
            navigation.openKernel(id);
          }}
          onManage={() => {
            setPendingSettingsSection("agents");
            openSettings();
          }}
        />
      </div>
      <WorkspaceSidebarFooter
        compact
        settingsActive={settingsActive}
        theme={theme}
        localeMenuValue={localePreference}
        onLocaleChange={(value) => {
          if (value === "system" || value === "zh-CN" || value === "en-US")
            setLocalePreference(value);
        }}
        onThemeChange={(value) => {
          if (value === "system" || value === "knorvia-light" || value === "knorvia-dark")
            setTheme(value);
        }}
        onSettingsButtonClick={() => {
          // 插件管理不显示设置目录；齿轮始终能回到完整设置入口。
          setPendingSettingsSection("general");
          openSettings();
        }}
        isDesktop={isDesktop}
      />
    </aside>
  );
}
