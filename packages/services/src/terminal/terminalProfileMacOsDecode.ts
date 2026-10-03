// Source-exposed reconstruction; plist keys, archive grammar and conversion values need rights review.
import type { TerminalDetectedProfile, TerminalThemeProfile } from "./terminalProfileTypes.js";

export type TerminalProfileMacOsApp = "iterm2" | "macos-terminal";
type RecordValue = Record<string, unknown>;
type ColorField = readonly [keyof TerminalThemeProfile, readonly string[]];
const palette = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;
const fields: Record<TerminalProfileMacOsApp, readonly ColorField[]> = {
  iterm2: [
    ["foreground", ["Foreground Color"]],
    ["background", ["Background Color"]],
    ["cursor", ["Cursor Color"]],
    ["cursorAccent", ["Cursor Text Color"]],
    ["selectionBackground", ["Selection Color"]],
    ...palette.map(
      (key, index): ColorField => [key, [`Ansi ${index} Color`, `ANSI ${index} Color`]],
    ),
  ],
  "macos-terminal": [
    ["foreground", ["TextColor"]],
    ["background", ["BackgroundColor"]],
    ["cursor", ["CursorColor"]],
    ["selectionBackground", ["SelectionColor"]],
    ...palette.map(
      (key): ColorField => [key, [`ANSI${key[0]!.toUpperCase()}${key.slice(1)}Color`]],
    ),
  ],
};
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value.trim() || undefined : undefined;
function numeric(value: unknown): number {
  return typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.trim())
      : Number.NaN;
}
function fontSize(value: unknown): number | undefined {
  const number = numeric(value);
  return Number.isFinite(number) && number >= 6 && number <= 72 ? number : undefined;
}
function displayFamily(value: unknown): string | undefined {
  const name = text(value);
  if (!name) return undefined;
  const suffix = /\s+\d+(?:\.\d+)?$/.exec(name);
  return text((suffix ? name.slice(0, suffix.index) : name).split("-").join(" "));
}
function descriptor(value: unknown): Pick<TerminalDetectedProfile, "fontFamily" | "fontSize"> {
  // Optional coercion and untrimmed size matching are observable legacy behavior.
  const raw = typeof value === "string" ? value : value?.toString();
  return {
    fontFamily: displayFamily(raw),
    fontSize: fontSize(raw?.match(/\s+(\d+(?:\.\d+)?)$/)?.[1]),
  };
}
function archiveFamily(value: unknown): string | undefined {
  const data = text(
    typeof value === "string" ? value : record(value) ? value.NS?.toString() : undefined,
  );
  if (!data) return undefined;
  try {
    const bytes = Buffer.from(data, "base64").toString("latin1");
    const found =
      /([A-Za-z][A-Za-z0-9 ._-]*(?:Mono|Code|Nerd|Powerline|Console|Menlo|Monaco|Courier|Cascadia|Consolas|Hack|Meslo)[A-Za-z0-9 ._-]*)/i.exec(
        bytes,
      );
    return displayFamily(found?.[1]);
  } catch {
    return undefined;
  }
}
function projectedFont(
  profile: RecordValue,
  app: TerminalProfileMacOsApp,
): Pick<TerminalDetectedProfile, "fontFamily" | "fontSize"> {
  if (app === "iterm2") return descriptor(profile["Normal Font"]);
  return {
    fontFamily:
      text(profile.FontName) ?? displayFamily(text(profile.Font)) ?? archiveFamily(profile.Font),
    fontSize: fontSize(profile.FontSize) ?? descriptor(profile.Font).fontSize,
  };
}
function component(value: unknown): number | undefined {
  const number = numeric(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  const scale = [1, 255, 65_535].find((limit) => number <= limit);
  return scale === undefined ? undefined : number / scale;
}
function alias(recordValue: RecordValue, names: readonly string[]): unknown {
  const key = names.find((name) => recordValue[name] !== undefined);
  return key === undefined ? undefined : recordValue[key];
}
function color(value: unknown): string | undefined {
  if (typeof value === "string") {
    const candidate = value.trim();
    const lower = candidate.toLowerCase();
    const hex =
      candidate.startsWith("#") &&
      [3, 5, 6, 8].includes(candidate.length - 1) &&
      /^[0-9a-f]+$/i.test(candidate.slice(1));
    return hex || lower.startsWith("rgb(") || lower.startsWith("rgba(") ? candidate : undefined;
  }
  if (!record(value)) return undefined;
  const rgb: number[] = [];
  for (const channel of ["Red", "Green", "Blue"]) {
    const fraction = component(
      alias(value, [`${channel} Component`, channel.toLowerCase(), channel]),
    );
    if (fraction === undefined) return undefined;
    rgb.push(Math.round(fraction * 255));
  }
  const alpha = component(alias(value, ["Alpha Component", "alpha", "Alpha", "Opacity"])) ?? 1;
  return alpha < 1
    ? `rgba(${rgb.join(", ")}, ${Number(alpha.toFixed(3))})`
    : `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
function projectedTheme(
  profile: RecordValue,
  app: TerminalProfileMacOsApp,
): TerminalThemeProfile | undefined {
  const entries: Array<[keyof TerminalThemeProfile, string]> = [];
  for (const [target, names] of fields[app]) {
    for (const name of names) {
      const decoded = color(profile[name]);
      if (decoded !== undefined) {
        entries.push([target, decoded]);
        break;
      }
    }
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}
function* candidates(plist: RecordValue, app: TerminalProfileMacOsApp): Generator<RecordValue> {
  if (app === "macos-terminal") {
    for (const reference of ["Startup Window Settings", "Default Window Settings"]) {
      const name = text(plist[reference]);
      if (name && record(plist[name])) yield plist[name];
    }
    return;
  }
  const bookmarks = plist["New Bookmarks"];
  if (!Array.isArray(bookmarks)) return;
  const preferred = bookmarks.find(
    (value: unknown) => record(value) && value["Default Bookmark"] === true,
  );
  if (preferred) yield preferred;
  for (const value of bookmarks) {
    if (value !== preferred && record(value)) yield value;
  }
}
export function decodeTerminalProfileMacOs(
  plist: RecordValue | null,
  app: TerminalProfileMacOsApp,
): TerminalDetectedProfile | null {
  if (!plist) return null;
  for (const candidate of candidates(plist, app)) {
    const profile: TerminalDetectedProfile = {
      ...projectedFont(candidate, app),
      theme: projectedTheme(candidate, app),
    };
    if (profile.fontFamily || profile.fontSize || profile.theme) return profile;
  }
  return null;
}
