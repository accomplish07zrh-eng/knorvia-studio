// SPDX-License-Identifier: Apache-2.0
// 默认快捷键表与键名词表的纯数据部分（B22/B23）。
// 只放数据：命令表逐行一条、修饰键顺序、按键别名与命名键清单。
// 解析、序列化与查表逻辑在 shortcutCommands.ts。

/** 通道词表：window = renderer 键盘分发；menu = 桌面菜单 accelerator。 */
export const SHORTCUT_CHANNEL_VALUES = ["window", "menu"] as const;

/** 作用域词表：global = 全局分发；composer = 聊天输入框内消费。 */
export const SHORTCUT_SCOPE_VALUES = ["global", "composer"] as const;

/** 23 条默认快捷键，行序即 SHORTCUT_COMMANDS 顺序；bindings 每条绑定一项。 */
export const SHORTCUT_ROWS = [
  { id: "openCommandCenter", channel: "window", bindings: ["CmdOrCtrl+k", "CmdOrCtrl+Shift+p"] },
  { id: "openSettings", channel: "window", bindings: ["CmdOrCtrl+,"] },
  { id: "findInTask", channel: "window", bindings: ["CmdOrCtrl+f"] },
  { id: "toggleSidebar", channel: "window", bindings: ["CmdOrCtrl+b"] },
  { id: "switchTheme", channel: "window", bindings: ["CmdOrCtrl+Shift+l"] },
  { id: "toggleTerminal", channel: "window", bindings: ["CmdOrCtrl+j"] },
  { id: "toggleSidePane", channel: "window", bindings: ["CmdOrCtrl+Alt+b"] },
  { id: "previousConversation", channel: "window", bindings: ["CmdOrCtrl+Shift+["] },
  { id: "nextConversation", channel: "window", bindings: ["CmdOrCtrl+Shift+]"] },
  { id: "navigateBack", channel: "window", bindings: ["CmdOrCtrl+["] },
  { id: "navigateForward", channel: "window", bindings: ["CmdOrCtrl+]"] },
  { id: "openModelMenu", channel: "window", bindings: ["Ctrl+m"] },
  { id: "cycleSessionMode", channel: "window", bindings: ["Ctrl+Shift+m"] },
  { id: "cycleThoughtLevel", channel: "window", bindings: ["Ctrl+t"] },
  { id: "newTask", channel: "menu", bindings: ["CmdOrCtrl+n"] },
  { id: "openWorkspace", channel: "menu", bindings: ["CmdOrCtrl+o"] },
  { id: "closeActiveContext", channel: "menu", bindings: ["CmdOrCtrl+w"] },
  { id: "zoomIn", channel: "menu", bindings: ["CmdOrCtrl+="] },
  { id: "zoomOut", channel: "menu", bindings: ["CmdOrCtrl+-"] },
  { id: "resetZoom", channel: "menu", bindings: ["CmdOrCtrl+0"] },
  { id: "composerSend", channel: "window", scope: "composer", bindings: ["Enter"] },
  { id: "composerInsertNewline", channel: "window", scope: "composer", bindings: ["Shift+Enter"] },
  { id: "openOnboarding", channel: "window", bindings: ["CmdOrCtrl+Shift+o"] },
] as const;

/** 修饰键的展示顺序与内部标志位一一对应；序列化按此顺序输出。 */
export const MODIFIER_TABLE = [
  { label: "CmdOrCtrl", flag: "cmdOrCtrl" },
  { label: "Ctrl", flag: "ctrl" },
  { label: "Alt", flag: "alt" },
  { label: "Shift", flag: "shift" },
  { label: "AltGr", flag: "altGr" },
] as const;

/** 按键别名：同一物理键的多种写法归一到规范名。 */
export const KEY_ALIASES = { Plus: "=", Equal: "=", Minus: "-" } as const;

/** 命名键清单（F1–F12 与编辑/导航键），逐项一行。 */
export const NAMED_KEY_LIST = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Delete",
  "Insert",
  "Enter",
] as const;
