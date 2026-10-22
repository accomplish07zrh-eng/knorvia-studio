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
    ["black", ["Ansi 0 Color", "ANSI 0 Color"]],
    ["red", ["Ansi 1 Color", "ANSI 1 Color"]],
    ["green", ["Ansi 2 Color", "ANSI 2 Color"]],
    ["yellow", ["Ansi 3 Color", "ANSI 3 Color"]],
    ["blue", ["Ansi 4 Color", "ANSI 4 Color"]],
    ["magenta", ["Ansi 5 Color", "ANSI 5 Color"]],
    ["cyan", ["Ansi 6 Color", "ANSI 6 Color"]],
    ["white", ["Ansi 7 Color", "ANSI 7 Color"]],
    ["brightBlack", ["Ansi 8 Color", "ANSI 8 Color"]],
    ["brightRed", ["Ansi 9 Color", "ANSI 9 Color"]],
    ["brightGreen", ["Ansi 10 Color", "ANSI 10 Color"]],
    ["brightYellow", ["Ansi 11 Color", "ANSI 11 Color"]],
    ["brightBlue", ["Ansi 12 Color", "ANSI 12 Color"]],
    ["brightMagenta", ["Ansi 13 Color", "ANSI 13 Color"]],
    ["brightCyan", ["Ansi 14 Color", "ANSI 14 Color"]],
    ["brightWhite", ["Ansi 15 Color", "ANSI 15 Color"]],
  ],
  "macos-terminal": [
    ["foreground", ["TextColor"]],
    ["background", ["BackgroundColor"]],
    ["cursor", ["CursorColor"]],
    ["selectionBackground", ["SelectionColor"]],
    ["black", ["ANSIBlackColor"]],
    ["red", ["ANSIRedColor"]],
    ["green", ["ANSIGreenColor"]],
    ["yellow", ["ANSIYellowColor"]],
    ["blue", ["ANSIBlueColor"]],
    ["magenta", ["ANSIMagentaColor"]],
    ["cyan", ["ANSICyanColor"]],
    ["white", ["ANSIWhiteColor"]],
    ["brightBlack", ["ANSIBrightBlackColor"]],
    ["brightRed", ["ANSIBrightRedColor"]],
    ["brightGreen", ["ANSIBrightGreenColor"]],
    ["brightYellow", ["ANSIBrightYellowColor"]],
    ["brightBlue", ["ANSIBrightBlueColor"]],
    ["brightMagenta", ["ANSIBrightMagentaColor"]],
    ["brightCyan", ["ANSIBrightCyanColor"]],
    ["brightWhite", ["ANSIBrightWhiteColor"]],
  ],
};

// ── 值提取：所有「从 unknown 里取出某类标量」的判定集中在这里，
//    避免每种类型各写一份守卫，也便于统一处理「非字符串输入」的边缘情形。

/** 非 null 的普通对象（排除数组）。 */
const asRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 去空白后的非空字符串。 */
function asText(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/** 宽松数值：数字原样，字符串按 parseFloat，其余 NaN。 */
function asNumber(value: unknown): number {
  return typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value.trim())
      : Number.NaN;
}

/**
 * 取「第一个存在值的别名键」。
 *
 * plist 同一语义常有多个键名（如 `Red Component` / `red` / `Red`），
 * 统一走这张别名表，调用点不必重复写「依次尝试」的循环。
 */
function pickAlias(recordValue: RecordValue, names: readonly string[]): unknown {
  const hit = names.find((name) => recordValue[name] !== undefined);
  return hit === undefined ? undefined : recordValue[hit];
}

// ── 字体：三处来源（显式 FontName / Font 字符串 / 归档 base64）汇成一个描述符。

/** 字号合法区间（6–72）。 */
const isFontSizeInRange = (candidate: number): boolean => candidate >= 6 && candidate <= 72;

/** 去掉字体名尾部的字号后缀与连字符，归一成可读族名。 */
function displayFamilyOf(value: unknown): string | undefined {
  const name = asText(value);
  if (name === undefined) return undefined;
  const sizeSuffix = /\s+\d+(?:\.\d+)?$/.exec(name);
  const withoutSize = sizeSuffix === null ? name : name.slice(0, sizeSuffix.index);
  return asText(withoutSize.split("-").join(" "));
}

/**
 * 从 iTerm2 的 `Normal Font` 值解析字体描述符。
 *
 * value 可能是字符串（`"MesloLGS-NF-Regular 13"`）或带 `toString` 的对象；
 * 「非字符串也尝试 toString」是既有可观测行为，必须保留。
 */
function fontDescriptorOf(
  value: unknown,
): Pick<TerminalDetectedProfile, "fontFamily" | "fontSize"> {
  const raw = typeof value === "string" ? value : (value as { toString?(): string })?.toString?.();
  const sizeText = raw?.match(/\s+(\d+(?:\.\d+)?)$/)?.[1];
  const parsedSize = asNumber(sizeText);
  return {
    fontFamily: displayFamilyOf(raw),
    fontSize: isFontSizeInRange(parsedSize) ? parsedSize : undefined,
  };
}

/** 归档字体：从 base64 里按已知等宽字体标记挑选族名。 */
const ARCHIVE_FAMILY_MARKERS =
  /([A-Za-z][A-Za-z0-9 ._-]*(?:Mono|Code|Nerd|Powerline|Console|Menlo|Monaco|Courier|Cascadia|Consolas|Hack|Meslo)[A-Za-z0-9 ._-]*)/i;

function archivedFamilyOf(value: unknown): string | undefined {
  const encoded = asText(
    typeof value === "string" ? value : asRecord(value) ? value.NS?.toString() : undefined,
  );
  if (encoded === undefined) return undefined;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("latin1");
    return displayFamilyOf(ARCHIVE_FAMILY_MARKERS.exec(decoded)?.[1]);
  } catch {
    return undefined;
  }
}

/** 按 app 选择字体来源：iTerm2 走 `Normal Font`，macOS Terminal 走三级回退。 */
function projectFont(
  profile: RecordValue,
  app: TerminalProfileMacOsApp,
): Pick<TerminalDetectedProfile, "fontFamily" | "fontSize"> {
  if (app === "iterm2") return fontDescriptorOf(profile["Normal Font"]);
  const sizeFromDescriptor = fontDescriptorOf(profile.Font).fontSize;
  const explicitSize = asNumber(profile.FontSize);
  return {
    fontFamily:
      asText(profile.FontName) ??
      displayFamilyOf(asText(profile.Font)) ??
      archivedFamilyOf(profile.Font),
    fontSize: isFontSizeInRange(explicitSize) ? explicitSize : sizeFromDescriptor,
  };
}

// ── 颜色：支持十六进制 / rgb() / rgba() 字符串，以及分量对象。

/** 分量对象里各通道的取值上限 —— 用于识别 0–1、0–255、0–65535 三种量纲。 */
const COMPONENT_SCALES = [1, 255, 65_535] as const;

/** 把原始分量归一化到 0–1；超出量纲或负数返回 undefined。 */
function normalizeComponent(value: unknown): number | undefined {
  const parsed = asNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const scale = COMPONENT_SCALES.find((limit) => parsed <= limit);
  return scale === undefined ? undefined : parsed / scale;
}

/** 字符串颜色：`#rgb` / `#rrggbb` 等十六进制，或 `rgb(...)` / `rgba(...)`。 */
function colorFromString(candidate: string): string | undefined {
  const trimmed = candidate.trim();
  const lowercase = trimmed.toLowerCase();
  const isHex =
    trimmed.startsWith("#") &&
    [3, 5, 6, 8].includes(trimmed.length - 1) &&
    /^[0-9a-f]+$/i.test(trimmed.slice(1));
  if (isHex || lowercase.startsWith("rgb(") || lowercase.startsWith("rgba(")) return trimmed;
  return undefined;
}

/** 分量对象颜色：读三个通道 + 可选 alpha，输出 `#rrggbb` 或 `rgba(...)`。 */
function colorFromComponents(value: RecordValue): string | undefined {
  const channels: number[] = [];
  for (const channel of ["Red", "Green", "Blue"]) {
    const normalized = normalizeComponent(
      pickAlias(value, [`${channel} Component`, channel.toLowerCase(), channel]),
    );
    if (normalized === undefined) return undefined;
    channels.push(Math.round(normalized * 255));
  }
  const alpha =
    normalizeComponent(pickAlias(value, ["Alpha Component", "alpha", "Alpha", "Opacity"])) ?? 1;
  if (alpha >= 1) {
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${channels.join(", ")}, ${Number(alpha.toFixed(3))})`;
}

function colorOf(value: unknown): string | undefined {
  if (typeof value === "string") return colorFromString(value);
  return asRecord(value) ? colorFromComponents(value) : undefined;
}

/** 主题投影：每个目标字段按候选键名依次尝试，取第一个能解析的颜色。 */
function projectTheme(
  profile: RecordValue,
  app: TerminalProfileMacOsApp,
): TerminalThemeProfile | undefined {
  // 每个目标字段取其候选键里第一个能解析出颜色的；找不到就不出现在结果里。
  const resolved = fields[app].flatMap(
    ([target, names]): Array<[keyof TerminalThemeProfile, string]> => {
      const match = names
        .map((name) => colorOf(profile[name]))
        .find((value) => value !== undefined);
      return match === undefined ? [] : [[target, match]];
    },
  );
  return resolved.length === 0 ? undefined : Object.fromEntries(resolved);
}

// ── 候选档案：两种 app 的「从 plist 定位到具体档案对象」规则。

/** macOS Terminal：先 Startup 后 Default，两者都可能指向命名档案。 */
function* macTerminalCandidates(plist: RecordValue): Generator<RecordValue> {
  const references = ["Startup Window Settings", "Default Window Settings"];
  for (const settings of references.map((reference) => plist[asText(plist[reference]) ?? ""])) {
    if (asRecord(settings)) yield settings;
  }
}

/** iTerm2：优先标记为 Default Bookmark 的项，其余按原顺序。 */
function* itermCandidates(plist: RecordValue): Generator<RecordValue> {
  const bookmarks = plist["New Bookmarks"];
  if (!Array.isArray(bookmarks)) return;
  const preferred = bookmarks.find(
    (value: unknown) => asRecord(value) && value["Default Bookmark"] === true,
  );
  if (preferred !== undefined) yield preferred as RecordValue;
  const rest = bookmarks.filter((value) => value !== preferred && asRecord(value));
  yield* rest as RecordValue[];
}

/** 按 app 选择候选来源。 */
function* candidateProfiles(
  plist: RecordValue,
  app: TerminalProfileMacOsApp,
): Generator<RecordValue> {
  if (app === "macos-terminal") {
    yield* macTerminalCandidates(plist);
    return;
  }
  yield* itermCandidates(plist);
}

export function decodeTerminalProfileMacOs(
  plist: RecordValue | null,
  app: TerminalProfileMacOsApp,
): TerminalDetectedProfile | null {
  if (plist === null) return null;
  for (const candidate of candidateProfiles(plist, app)) {
    const profile: TerminalDetectedProfile = {
      ...projectFont(candidate, app),
      theme: projectTheme(candidate, app),
    };
    // 三者全空视为「这份档案没有可用的终端配置」，继续看下一个候选。
    if (profile.fontFamily || profile.fontSize || profile.theme) return profile;
  }
  return null;
}
