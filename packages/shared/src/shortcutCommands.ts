// SPDX-License-Identifier: Apache-2.0
// 默认快捷键表与绑定解析/序列化（B22/B23）。
// 命令表、修饰键顺序与按键词表在 shortcutCommands-data.ts；这里只保留查表与解析逻辑。
import {
  KEY_ALIASES,
  MODIFIER_TABLE,
  NAMED_KEY_LIST,
  SHORTCUT_CHANNEL_VALUES,
  SHORTCUT_ROWS,
  SHORTCUT_SCOPE_VALUES,
} from "./shortcutCommands-data.js";

export type ShortcutChannel = (typeof SHORTCUT_CHANNEL_VALUES)[number];
export type ShortcutScope = (typeof SHORTCUT_SCOPE_VALUES)[number];
export type ShortcutCommandId = (typeof SHORTCUT_ROWS)[number]["id"];

type ShortcutRow = (typeof SHORTCUT_ROWS)[number];
type ModifierFlag = (typeof MODIFIER_TABLE)[number]["flag"];

/** 对外条目：id/channel/scope 取自数据行，bindings 换成绑定数组。 */
export type ShortcutCommandEntry = Readonly<{
  id: ShortcutCommandId;
  channel: ShortcutChannel;
  scope?: ShortcutScope;
  defaultBindings: readonly string[];
}>;

/** 解析结果：五个修饰键标志位 + 归一后的按键名。 */
export type ParsedShortcutBinding = Record<ModifierFlag, boolean> & { key: string };

const MODIFIER_FLAG_BY_LABEL: ReadonlyMap<string, ModifierFlag> = new Map(
  MODIFIER_TABLE.map((entry) => [entry.label, entry.flag]),
);

function buildCommandEntry(row: ShortcutRow): ShortcutCommandEntry {
  if ("scope" in row) {
    return { id: row.id, channel: row.channel, scope: row.scope, defaultBindings: row.bindings };
  }
  return { id: row.id, channel: row.channel, defaultBindings: row.bindings };
}

export const SHORTCUT_COMMANDS: readonly ShortcutCommandEntry[] =
  SHORTCUT_ROWS.map(buildCommandEntry);

const COMMAND_ENTRY_BY_ID: ReadonlyMap<string, ShortcutCommandEntry> = new Map(
  SHORTCUT_COMMANDS.map((entry) => [entry.id, entry]),
);

export function getDefaultShortcutBindings(commandId: string): readonly string[] {
  const entry = COMMAND_ENTRY_BY_ID.get(commandId);
  return entry === undefined ? [] : entry.defaultBindings;
}

const SINGLE_CHAR_KEY_PATTERN = /^[a-z0-9[\]=\-,./;'\\`]$/u; // 单字符按键白名单
const NAMED_KEYS = new Set<string>(NAMED_KEY_LIST);
const KEY_ALIAS_LOOKUP: Readonly<Record<string, string>> = KEY_ALIASES;

export function normalizeShortcutKey(candidateKey: string): string | null {
  const resolvedKey = KEY_ALIAS_LOOKUP[candidateKey] ?? candidateKey;
  const acceptable = NAMED_KEYS.has(resolvedKey) || SINGLE_CHAR_KEY_PATTERN.test(resolvedKey);
  return acceptable ? resolvedKey : null;
}

function emptyBinding(normalizedKey: string): ParsedShortcutBinding {
  return {
    cmdOrCtrl: false,
    ctrl: false,
    alt: false,
    shift: false,
    altGr: false,
    key: normalizedKey,
  };
}

function flagOf(modifierLabel: string): ModifierFlag | null {
  return MODIFIER_FLAG_BY_LABEL.get(modifierLabel) ?? null;
}

export function parseShortcutBinding(bindingText: string): ParsedShortcutBinding | null {
  const segments = bindingText.split("+");
  const normalizedKey = normalizeShortcutKey(segments.pop() ?? "");
  if (normalizedKey === null) return null; // 空键或按键不在词表里

  const parsed = emptyBinding(normalizedKey);
  const claimedFlags = new Set<ModifierFlag>();
  for (const segment of segments) {
    const flag = flagOf(segment);
    if (flag === null || claimedFlags.has(flag)) return null; // 未知修饰键或重复修饰键
    claimedFlags.add(flag);
    parsed[flag] = true;
  }
  return parsed;
}

export function serializeShortcutBinding(bindingParts: ParsedShortcutBinding): string | null {
  const normalizedKey = normalizeShortcutKey(bindingParts.key);
  if (normalizedKey === null) return null; // 按键不可序列化
  const orderedLabels = MODIFIER_TABLE.filter((modifier) => bindingParts[modifier.flag]).map(
    (modifier) => modifier.label,
  );
  return [...orderedLabels, normalizedKey].join("+");
}

export function isValidShortcutBinding(bindingText: string): boolean {
  const outcome = parseShortcutBinding(bindingText);
  if (outcome === null) return false;
  return serializeShortcutBinding(outcome) === bindingText;
}
