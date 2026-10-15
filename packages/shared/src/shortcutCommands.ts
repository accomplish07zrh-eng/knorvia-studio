// SPDX-License-Identifier: Apache-2.0
// 默认快捷键表与绑定解析/序列化（B22/B23）。

const SHORTCUT_CHANNEL_TABLE = { window: "window", menu: "menu" } as const;
export type ShortcutChannel = (typeof SHORTCUT_CHANNEL_TABLE)[keyof typeof SHORTCUT_CHANNEL_TABLE];

const SHORTCUT_ID_TABLE = {
  openOnboarding: true,
  openCommandCenter: true,
  openSettings: true,
  findInTask: true,
  toggleSidebar: true,
  switchTheme: true,
  toggleTerminal: true,
  toggleSidePane: true,
  previousConversation: true,
  nextConversation: true,
  navigateBack: true,
  navigateForward: true,
  openModelMenu: true,
  cycleSessionMode: true,
  cycleThoughtLevel: true,
  newTask: true,
  openWorkspace: true,
  closeActiveContext: true,
  zoomIn: true,
  zoomOut: true,
  resetZoom: true,
  composerSend: true,
  composerInsertNewline: true,
} as const;
export type ShortcutCommandId = keyof typeof SHORTCUT_ID_TABLE;

const SHORTCUT_SCOPE_TABLE = { global: "global", composer: "composer" } as const;
export type ShortcutScope = (typeof SHORTCUT_SCOPE_TABLE)[keyof typeof SHORTCUT_SCOPE_TABLE];

export type ShortcutCommandEntry = {
  readonly id: /* 命令标识 */ ShortcutCommandId;
  readonly channel: /* 承载通道 */ ShortcutChannel;
  readonly scope?: /* 作用域；缺省为全局 */ ShortcutScope;
  readonly defaultBindings: /* 默认绑定（绑定文本无空格） */ readonly string[];
};

type ShortcutRow = {
  id: ShortcutCommandId;
  channel: ShortcutChannel;
  scope?: ShortcutScope;
  bindings: string; // 多个绑定用空格分隔
};

// 行序即 SHORTCUT_COMMANDS 顺序（B22 默认快捷键表 23 条逐字冻结）。
const SHORTCUT_ROWS: readonly ShortcutRow[] = [
  { id: "openCommandCenter", channel: "window", bindings: "CmdOrCtrl+k CmdOrCtrl+Shift+p" },
  { id: "openSettings", channel: "window", bindings: "CmdOrCtrl+," },
  { id: "findInTask", channel: "window", bindings: "CmdOrCtrl+f" },
  { id: "toggleSidebar", channel: "window", bindings: "CmdOrCtrl+b" },
  { id: "switchTheme", channel: "window", bindings: "CmdOrCtrl+Shift+l" },
  { id: "toggleTerminal", channel: "window", bindings: "CmdOrCtrl+j" },
  { id: "toggleSidePane", channel: "window", bindings: "CmdOrCtrl+Alt+b" },
  { id: "previousConversation", channel: "window", bindings: "CmdOrCtrl+Shift+[" },
  { id: "nextConversation", channel: "window", bindings: "CmdOrCtrl+Shift+]" },
  { id: "navigateBack", channel: "window", bindings: "CmdOrCtrl+[" },
  { id: "navigateForward", channel: "window", bindings: "CmdOrCtrl+]" },
  { id: "openModelMenu", channel: "window", bindings: "Ctrl+m" },
  { id: "cycleSessionMode", channel: "window", bindings: "Ctrl+Shift+m" },
  { id: "cycleThoughtLevel", channel: "window", bindings: "Ctrl+t" },
  { id: "newTask", channel: "menu", bindings: "CmdOrCtrl+n" },
  { id: "openWorkspace", channel: "menu", bindings: "CmdOrCtrl+o" },
  { id: "closeActiveContext", channel: "menu", bindings: "CmdOrCtrl+w" },
  { id: "zoomIn", channel: "menu", bindings: "CmdOrCtrl+=" },
  { id: "zoomOut", channel: "menu", bindings: "CmdOrCtrl+-" },
  { id: "resetZoom", channel: "menu", bindings: "CmdOrCtrl+0" },
  { id: "composerSend", channel: "window", scope: "composer", bindings: "Enter" },
  { id: "composerInsertNewline", channel: "window", scope: "composer", bindings: "Shift+Enter" },
  { id: "openOnboarding", channel: "window", bindings: "CmdOrCtrl+Shift+o" },
];

export const SHORTCUT_COMMANDS: readonly ShortcutCommandEntry[] = SHORTCUT_ROWS.map((row) => {
  const defaultBindings = row.bindings.split(" ");
  const entry: ShortcutCommandEntry = row.scope
    ? { id: row.id, channel: row.channel, scope: row.scope, defaultBindings }
    : { id: row.id, channel: row.channel, defaultBindings };
  return entry;
});

export function getDefaultShortcutBindings(commandId: string): readonly string[] {
  const matched = SHORTCUT_COMMANDS.find((entry) => entry.id === commandId);
  return matched ? matched.defaultBindings : [];
}

export type ParsedShortcutBinding = {
  cmdOrCtrl: /* CmdOrCtrl 修饰键 */ boolean;
  ctrl: /* Ctrl 修饰键 */ boolean;
  alt: /* Alt 修饰键 */ boolean;
  shift: /* Shift 修饰键 */ boolean;
  altGr: /* AltGr 修饰键 */ boolean;
  key: /* 归一后的按键名 */ string;
};

// 修饰键的展示顺序与内部标志位一一对应；序列化时按此顺序输出。
const MODIFIER_TABLE = [
  { label: "CmdOrCtrl", flag: "cmdOrCtrl" },
  { label: "Ctrl", flag: "ctrl" },
  { label: "Alt", flag: "alt" },
  { label: "Shift", flag: "shift" },
  { label: "AltGr", flag: "altGr" },
] as const satisfies ReadonlyArray<{ label: string; flag: keyof ParsedShortcutBinding }>;

const KEY_ALIASES: Readonly<Record<string, string>> = { Plus: "=", Equal: "=", Minus: "-" };

const SINGLE_CHAR_KEY_PATTERN = /^[a-z0-9[\]=\-,./;'\\`]$/; // 单字符按键白名单

const NAMED_KEY_LIST = [
  ...Array.from({ length: 12 }, (_unused, ordinal) => `F${ordinal + 1}`),
  ..."ArrowUp ArrowDown ArrowLeft ArrowRight Home End PageUp PageDown Delete Insert Enter".split(
    " ",
  ),
];
const NAMED_KEYS: ReadonlySet<string> = new Set(NAMED_KEY_LIST);

export function normalizeShortcutKey(candidateKey: string): string | null {
  const aliased = KEY_ALIASES[candidateKey] ?? candidateKey;
  if (SINGLE_CHAR_KEY_PATTERN.test(aliased)) {
    return aliased; // 命中单字符白名单
  }
  const namedHit = NAMED_KEYS.has(aliased);
  return namedHit ? aliased : null;
}

function createEmptyBinding(): ParsedShortcutBinding {
  return { cmdOrCtrl: false, ctrl: false, alt: false, shift: false, altGr: false, key: "" };
}

export function parseShortcutBinding(bindingText: string): ParsedShortcutBinding | null {
  const tokens = bindingText.split("+");
  const keyToken = tokens[tokens.length - 1];
  if (keyToken === undefined || keyToken === "") {
    return null; // 末段必须是按键
  }

  const parsed = createEmptyBinding();

  for (const modifierToken of tokens.slice(0, -1)) {
    const modifier = MODIFIER_TABLE.find((entry) => entry.label === modifierToken);
    if (modifier === undefined || parsed[modifier.flag]) {
      return null; // 未知修饰键或重复修饰键都不接受
    }
    parsed[modifier.flag] = true;
  }

  const normalizedKey = normalizeShortcutKey(keyToken);
  if (normalizedKey === null) {
    return null; // 按键不在词表里
  }
  parsed.key = normalizedKey;
  return parsed; // 修饰键按解析顺序置位
}

export function serializeShortcutBinding(bindingParts: ParsedShortcutBinding): string | null {
  const normalizedKey = normalizeShortcutKey(bindingParts.key);
  if (normalizedKey === null) {
    return null; // 按键不可序列化
  }

  const segments: string[] = [];
  for (const modifier of MODIFIER_TABLE) {
    if (bindingParts[modifier.flag]) {
      segments.push(modifier.label);
    }
  }
  segments.push(normalizedKey);
  return segments.join("+");
}

export function isValidShortcutBinding(bindingText: string): boolean {
  const outcome = parseShortcutBinding(bindingText);
  return outcome !== null && serializeShortcutBinding(outcome) === bindingText;
}
