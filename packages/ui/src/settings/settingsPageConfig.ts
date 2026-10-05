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

type SettingsSectionGroupId =
  | "basics"
  | "agentsModels"
  | "agentCapabilities"
  | "tools"
  | "dataAndStats";

interface SettingsSectionDefinition {
  id: SettingsSectionId;
  icon: typeof Settings;
  titleId: string;
  /** 页头下方的一句说明，同时参与导航搜索。 */
  descriptionId: string;
  contentTitleId?: string;
  titleBadgeId?: string;
  groupId: SettingsSectionGroupId;
}

/**
 * 2026-10-05 设置布局重做：导航按「通用 / Agent 与模型 / 扩展 / 工具与权限 / 数据」归类，
 * 分区 ID 与跳转意图不变（specs/knorvia-unified-mode-onboarding-settings.md §3）。
 */
const BASE_SETTINGS_SECTION_GROUPS: Array<{
  id: SettingsSectionGroupId;
  titleId: string;
}> = [
  { id: "basics", titleId: "settings.sidebar.group.basics" },
  { id: "agentsModels", titleId: "settings.sidebar.group.agentsModels" },
  { id: "agentCapabilities", titleId: "settings.sidebar.group.agentCapabilities" },
  { id: "tools", titleId: "settings.sidebar.group.tools" },
  { id: "dataAndStats", titleId: "settings.sidebar.group.dataAndStats" },
];

function section(
  id: SettingsSectionId,
  icon: typeof Settings,
  titleId: string,
  groupId: SettingsSectionGroupId,
  extra: Pick<SettingsSectionDefinition, "contentTitleId" | "titleBadgeId"> = {},
): SettingsSectionDefinition {
  return {
    id,
    icon,
    titleId,
    descriptionId: `settings.sectionDescription.${id}`,
    groupId,
    ...extra,
  };
}

const BASE_SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  section("general", Settings2, "settings.systemTitle", "basics"),
  section("appearance", Palette, "settings.appearanceTitle", "basics"),
  section("shortcuts", Keyboard, "settings.shortcuts.title", "basics"),
  section("agents", Bot, "studio.agents", "agentsModels"),
  section("modelProvider", Package, "settings.modelProviderTitle", "agentsModels"),
  section("subagents", Bot, "settings.subagents.title", "agentsModels"),
  section("memory", Brain, "settings.memory", "agentsModels"),
  section("plugin", Blocks, "settings.plugins.title", "agentCapabilities"),
  section("mcp", Cable, "settings.mcpTitle", "agentCapabilities"),
  section("skill", WandSparkles, "settings.skills.title", "agentCapabilities"),
  section("commands", Terminal, "settings.commands.title", "agentCapabilities"),
  section("hooks", Anchor, "settings.hooks.title", "agentCapabilities"),
  section("automations", AlarmClock, "settings.automations.title", "agentCapabilities", {
    titleBadgeId: "settings.automations.betaBadge",
  }),
  // 浏览器与电脑控制都是给 Agent 用的本机操控入口，与工作区搜索范围一起归入「工具与权限」。
  section("browser", Globe2, "settings.browser.title", "tools"),
  section("computerUse", Monitor, "settings.computerUse.title", "tools"),
  section("workspaceFileSearch", FileSearch, "settings.workspaceFileSearch.title", "tools"),
  section("usage", BarChart3, "settings.usageTitle", "dataAndStats"),
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
  const settingsSectionGroups = BASE_SETTINGS_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: settingsSections.filter((section) => section.groupId === group.id),
  })).filter((group) => group.sections.length > 0);

  return { settingsSectionGroups, settingsSections };
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
