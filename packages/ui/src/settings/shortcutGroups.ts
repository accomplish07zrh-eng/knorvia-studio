import type { ShortcutCommandEntry, ShortcutCommandId } from "@knorvia/shared";

export type ShortcutGroupId = "general" | "navigation" | "conversation" | "view";

/**
 * 快捷键设置页的分组展示（2026-10-05 设置布局重做）。只影响展示顺序与分组，
 * 命令表、默认键与冲突语义仍以 shared 的 SHORTCUT_COMMANDS 为唯一事实源。
 */
const SHORTCUT_GROUP_MEMBERS: Record<ShortcutGroupId, readonly ShortcutCommandId[]> = {
  general: ["openCommandCenter", "newTask", "openWorkspace", "openSettings", "switchTheme"],
  navigation: [
    "previousConversation",
    "nextConversation",
    "navigateBack",
    "navigateForward",
    "findInTask",
  ],
  conversation: [
    "composerSend",
    "composerInsertNewline",
    "openModelMenu",
    "cycleSessionMode",
    "cycleThoughtLevel",
  ],
  view: [
    "toggleSidebar",
    "toggleSidePane",
    "toggleTerminal",
    "closeActiveContext",
    "zoomIn",
    "zoomOut",
    "resetZoom",
  ],
};

export const SHORTCUT_GROUP_ORDER: readonly ShortcutGroupId[] = [
  "general",
  "navigation",
  "conversation",
  "view",
];

/** 按分组归类；未登记的新命令落入「通用」，避免新增命令在设置页消失。 */
export function groupShortcutCommands(
  commands: readonly ShortcutCommandEntry[],
): Array<{ id: ShortcutGroupId; commands: ShortcutCommandEntry[] }> {
  const byId = new Map(commands.map((entry) => [entry.id, entry]));
  const assigned = new Set<ShortcutCommandId>();
  const groups = SHORTCUT_GROUP_ORDER.map((id) => {
    const members = SHORTCUT_GROUP_MEMBERS[id].flatMap((commandId) => {
      const entry = byId.get(commandId);
      if (!entry) return [];
      assigned.add(commandId);
      return [entry];
    });
    return { id, commands: members };
  });
  const unassigned = commands.filter((entry) => !assigned.has(entry.id));
  groups[0]!.commands.push(...unassigned);
  return groups.filter((group) => group.commands.length > 0);
}
