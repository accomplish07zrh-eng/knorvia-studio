export type ShortcutChannel = "window" | "menu";

export type ShortcutCommandId =
  | "openOnboarding"
  | "openCommandCenter"
  | "openSettings"
  | "findInTask"
  | "toggleSidebar"
  | "switchTheme"
  | "toggleTerminal"
  | "toggleSidePane"
  | "previousConversation"
  | "nextConversation"
  | "navigateBack"
  | "navigateForward"
  | "openModelMenu"
  | "cycleSessionMode"
  | "cycleThoughtLevel"
  | "newTask"
  | "openWorkspace"
  | "closeActiveContext"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "composerSend"
  | "composerInsertNewline";

export type ShortcutScope = "global" | "composer";

export interface ShortcutCommandEntry {
  readonly id: ShortcutCommandId;
  readonly channel: ShortcutChannel;
  readonly scope?: ShortcutScope;
  readonly defaultBindings: readonly string[];
}

export const SHORTCUT_COMMANDS: readonly ShortcutCommandEntry[] = [
  {
    id: "openCommandCenter",
    channel: "window",
    defaultBindings: ["CmdOrCtrl+k", "CmdOrCtrl+Shift+p"],
  },
  { id: "openSettings", channel: "window", defaultBindings: ["CmdOrCtrl+,"] },
  { id: "findInTask", channel: "window", defaultBindings: ["CmdOrCtrl+f"] },
  { id: "toggleSidebar", channel: "window", defaultBindings: ["CmdOrCtrl+b"] },
  { id: "switchTheme", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+l"] },
  { id: "toggleTerminal", channel: "window", defaultBindings: ["CmdOrCtrl+j"] },
  { id: "toggleSidePane", channel: "window", defaultBindings: ["CmdOrCtrl+Alt+b"] },
  { id: "previousConversation", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+["] },
  { id: "nextConversation", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+]"] },
  { id: "navigateBack", channel: "window", defaultBindings: ["CmdOrCtrl+["] },
  { id: "navigateForward", channel: "window", defaultBindings: ["CmdOrCtrl+]"] },
  { id: "openModelMenu", channel: "window", defaultBindings: ["Ctrl+m"] },
  { id: "cycleSessionMode", channel: "window", defaultBindings: ["Ctrl+Shift+m"] },
  { id: "cycleThoughtLevel", channel: "window", defaultBindings: ["Ctrl+t"] },
  { id: "newTask", channel: "menu", defaultBindings: ["CmdOrCtrl+n"] },
  { id: "openWorkspace", channel: "menu", defaultBindings: ["CmdOrCtrl+o"] },
  { id: "closeActiveContext", channel: "menu", defaultBindings: ["CmdOrCtrl+w"] },
  { id: "zoomIn", channel: "menu", defaultBindings: ["CmdOrCtrl+="] },
  { id: "zoomOut", channel: "menu", defaultBindings: ["CmdOrCtrl+-"] },
  { id: "resetZoom", channel: "menu", defaultBindings: ["CmdOrCtrl+0"] },
  { id: "composerSend", channel: "window", scope: "composer", defaultBindings: ["Enter"] },
  {
    id: "composerInsertNewline",
    channel: "window",
    scope: "composer",
    defaultBindings: ["Shift+Enter"],
  },
  { id: "openOnboarding", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+o"] },
];

export function getDefaultShortcutBindings(id: string): readonly string[] {
  const command = SHORTCUT_COMMANDS.find((entry) => entry.id === id);
  return command ? command.defaultBindings : [];
}

export interface ParsedShortcutBinding {
  cmdOrCtrl: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  altGr: boolean;
  key: string;
}

const MODIFIER_ORDER = [
  ["CmdOrCtrl", "cmdOrCtrl"],
  ["Ctrl", "ctrl"],
  ["Alt", "alt"],
  ["Shift", "shift"],
  ["AltGr", "altGr"],
] as const satisfies ReadonlyArray<readonly [string, keyof ParsedShortcutBinding]>;

const KEY_ALIASES: Readonly<Record<string, string>> = {
  Plus: "=",
  Equal: "=",
  Minus: "-",
};

const SINGLE_CHAR_KEY = /^[a-z0-9[\]=\-,./;'\\`]$/;

const NAMED_KEYS: ReadonlySet<string> = new Set([
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
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
]);

export function normalizeShortcutKey(rawKey: string): string | null {
  const aliased = KEY_ALIASES[rawKey] ?? rawKey;
  if (SINGLE_CHAR_KEY.test(aliased)) {
    return aliased;
  }
  return NAMED_KEYS.has(aliased) ? aliased : null;
}

export function parseShortcutBinding(binding: string): ParsedShortcutBinding | null {
  const tokens = binding.split("+");
  const rawKey = tokens[tokens.length - 1];
  if (rawKey === undefined || rawKey === "") {
    return null;
  }

  const parsed: ParsedShortcutBinding = {
    cmdOrCtrl: false,
    ctrl: false,
    alt: false,
    shift: false,
    altGr: false,
    key: "",
  };

  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIER_ORDER.find(([name]) => name === token);
    if (modifier === undefined || parsed[modifier[1]]) {
      return null;
    }
    parsed[modifier[1]] = true;
  }

  const key = normalizeShortcutKey(rawKey);
  if (key === null) {
    return null;
  }
  parsed.key = key;
  return parsed;
}

export function serializeShortcutBinding(parsed: ParsedShortcutBinding): string | null {
  const key = normalizeShortcutKey(parsed.key);
  if (key === null) {
    return null;
  }

  const tokens: string[] = [];
  for (const [name, flag] of MODIFIER_ORDER) {
    if (parsed[flag]) {
      tokens.push(name);
    }
  }
  tokens.push(key);
  return tokens.join("+");
}

export function isValidShortcutBinding(binding: string): boolean {
  const parsed = parseShortcutBinding(binding);
  return parsed !== null && serializeShortcutBinding(parsed) === binding;
}
