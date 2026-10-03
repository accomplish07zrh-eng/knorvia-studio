Fresh internal author: read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No source bodies/tests/deps/history/config/env/other outputs/additional repository reads. User explicitly defers ordinary validation; do NOT run architecture/runtime/tests/typechecks/formatting/network/native operations or write repository. Author entire target file at designated tmp path using whole literal heredoc or apply_patch. Do not inspect/re-read output (sha256sum permitted). Report exact read/write/patch/hash/access limits. Whole draft frozen/hash-bound before curator review. No novelty requirement; exact public declarations/static data below retained uncounted. Curator source-exposed; shared filesystem not OS isolation. No user data/credentials/account/Library/native IO/security actions.

Target packages/shared/src/shortcutCommands.ts; output /tmp/knorvia-telemetry-shortcutCommands-authored.ts

Whole strict shortcut grammar/canonicalization owner. Retain EXACT command/defaults/modifier/alias/regex/namedkey tables and types shown. Data initializer expressions supplied for static generated namedkeys are retained uncounted, not behavioral authoring. getDefaultShortcutBindings exactcase ID nativefind current exported table, return original defaultBindings arrayreference; unknownfreshemptyarray, no copyknown. normalizeShortcutKey aliased=KEY_ALIASES[rawKey]??rawKey, then SINGLE_CHAR_KEY.test(aliased) return aliased, else NAMED_KEYS.has(aliased)?aliased:null. Existing ordinary-object alias lookup/inheritedkeys unchanged, don't harden (typedstring normally). case-sensitive, no trim/lowernewbehavior. parse: split '+'; lasttoken undefined/empty=>null; initial parsed keys insertion cmdOrCtrl false,ctrl false,alt false,shift false,altGr false,key empty. Native tokens.slice(0,-1) each lookup modifier exactname; invalid/duplicate alreadytrue=>null; setflag; normalizelastkey; invalid=>null; assignkeyreturn. No modifier-order restrictionparse; duplicate unknownempty modifier invalid; Plus/Equal aliases acceptedkey, bare+invalid, uppercasealpha invalid, F1..F12 namedonly. serialize: normalize parsed.key first =>nullinvalid; fixed MODIFIER_ORDER order, include token when corresponding flagtruthy (no strictboolschema), appendkey join '+'. isValid parse AND serialize===originalstring, so aliases/noncanonical modifier ordering parsebutinvalidcanonical. Preserve exportedtable mutable runtime reference semantics and inputimmutability. No keyboardevent/DOM/Electronaction, olddata bytes grammar unchanged.

Retained API/static declarations (behavior owner bodies removed):
```ts
export type ShortcutChannel = "window" | "menu";

export type ShortcutCommandId = "toggleInterfaceMode" | "openOnboarding" | "openCommandCenter" | "openSettings" | "findInTask" | "toggleSidebar" | "switchTheme" | "toggleTerminal" | "toggleSidePane" | "previousConversation" | "nextConversation" | "navigateBack" | "navigateForward" | "openModelMenu" | "cycleSessionMode" | "cycleThoughtLevel" | "newTask" | "openWorkspace" | "closeActiveContext" | "zoomIn" | "zoomOut" | "resetZoom" | "composerSend" | "composerInsertNewline";

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
    { id: "toggleInterfaceMode", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+u"] },
    { id: "openOnboarding", channel: "window", defaultBindings: ["CmdOrCtrl+Shift+o"] },
];

export function getDefaultShortcutBindings(id: string): readonly string[];

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
] as const satisfies ReadonlyArray<readonly [
    string,
    keyof ParsedShortcutBinding
]>;

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

export function normalizeShortcutKey(rawKey: string): string | null;

export function parseShortcutBinding(binding: string): ParsedShortcutBinding | null;

export function serializeShortcutBinding(parsed: ParsedShortcutBinding): string | null;

export function isValidShortcutBinding(binding: string): boolean;
```
