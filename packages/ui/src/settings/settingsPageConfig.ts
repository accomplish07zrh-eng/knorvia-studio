import {
  Monitor,
  Moon,
  Settings,
  Settings2,
  Package,
  Bot,
  Palette,
  Sun,
  BarChart3,
  Terminal,
  AlarmClock,
  Anchor,
  Brain,
  Blocks,
  Globe2,
  Cable,
  WandSparkles,
  Keyboard,
  FileSearch,
} from "lucide-react";
import { isSettingsSectionEnabled, type SettingsSectionId } from "@/lib/settingsNavigation.js";
import type { Theme } from "@/useTheme.js";

export const THEME_MODES: Array<{
  mode: Theme;
  icon: typeof Sun;
}> = [
  { mode: "system", icon: Monitor },
  { mode: "knorvia-dark", icon: Moon },
  { mode: "knorvia-light", icon: Sun },
];

interface SettingsSectionDefinition {
  id: SettingsSectionId;
  icon: typeof Settings;
  titleId: string;
  /** 页头下方的一句说明，同时参与导航搜索。 */
  descriptionId: string;
  contentTitleId?: string;
  titleBadgeId?: string;
}

/**
 * 2026-10-05 设置布局重做第二轮：导航改为不分组的单列表（用户要求取消「通用 / Agent 与模型 /
 * 扩展 / 工具与权限 / 数据」等分隔），顺序即下方数组顺序；分区 ID 与跳转意图不变。
 */
function section(
  id: SettingsSectionId,
  icon: typeof Settings,
  titleId: string,
  extra: Pick<SettingsSectionDefinition, "contentTitleId" | "titleBadgeId"> = {},
): SettingsSectionDefinition {
  return { id, icon, titleId, descriptionId: `settings.sectionDescription.${id}`, ...extra };
}

const BASE_SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  section("general", Settings2, "settings.systemTitle"),
  section("appearance", Palette, "settings.appearanceTitle"),
  section("shortcuts", Keyboard, "settings.shortcuts.title"),
  section("agents", Bot, "studio.agents"),
  section("modelProvider", Package, "settings.modelProviderTitle"),
  section("usage", BarChart3, "settings.usageTitle"),
  section("subagents", Bot, "settings.subagents.title"),
  section("memory", Brain, "settings.memory"),
  section("plugin", Blocks, "settings.plugins.title"),
  section("mcp", Cable, "settings.mcpTitle"),
  section("skill", WandSparkles, "settings.skills.title"),
  section("commands", Terminal, "settings.commands.title"),
  section("hooks", Anchor, "settings.hooks.title"),
  section("automations", AlarmClock, "settings.automations.title", {
    titleBadgeId: "settings.automations.betaBadge",
  }),
  // 浏览器与电脑控制都是给 Agent 用的本机操控入口，与工作区搜索范围一起归入「工具与权限」。
  section("browser", Globe2, "settings.browser.title"),
  section("computerUse", Monitor, "settings.computerUse.title"),
  section("workspaceFileSearch", FileSearch, "settings.workspaceFileSearch.title"),
];

// 兼容既有只读消费者：默认配置代表不带桌面平台能力的 Web 视图；
// macOS/Windows/Linux 必须继续通过 createSettingsPageConfig 动态加入 Computer Use。
export const SETTINGS_SECTIONS = BASE_SETTINGS_SECTIONS.filter(
  (section) => section.id !== "computerUse" && isSettingsSectionEnabled(section.id),
);

interface SettingsPageConfigOptions {
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
}

export function createSettingsPageConfig({
  isDesktop = false,
  isMacDesktop = false,
  isWindowsDesktop = false,
}: SettingsPageConfigOptions = {}) {
  const showComputerUse = isDesktop || isMacDesktop || isWindowsDesktop;
  const settingsSections = BASE_SETTINGS_SECTIONS.filter((section) => {
    if (section.id === "computerUse" && !showComputerUse) return false;
    return isSettingsSectionEnabled(section.id);
  });
  return { settingsSections };
}

export function resolveSettingsSectionForPlatform(
  section: SettingsSectionId,
  visibleSections: ReadonlyArray<Pick<SettingsSectionDefinition, "id">>,
  fallbackSection: SettingsSectionId = "general",
): SettingsSectionId {
  if (visibleSections.some((candidate) => candidate.id === section)) return section;
  if (visibleSections.some((candidate) => candidate.id === fallbackSection)) {
    return fallbackSection;
  }
  return visibleSections[0]?.id ?? "general";
}

export type { SettingsSectionId };
