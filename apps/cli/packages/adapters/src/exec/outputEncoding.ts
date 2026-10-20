// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 输出文本编码的三件事：
// 一、子进程环境里的区域与 Python 编码变量统一成 UTF-8；
// 二、一次性缓冲解码（能按 UTF-8 读就用 UTF-8，否则退回遗留编码）；
// 三、流式解码器——前几块决定本流走哪条路，判断依据是 UTF-8 前缀的完整性。
// Windows 上还会从活动代码页或区域变量推断遗留编码。

import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";
import iconv from "iconv-lite";
import { getWindowsEnvValue } from "./windows-executable.js";

const UTF8_LOCALE = "C.UTF-8";
const CHCP_TIMEOUT_MS = 1_000;
const LOCALE_KEYS = ["LANG", "LC_ALL", "LC_CTYPE"];

// 代码页 → 编码名。65001 用 null 表示「就是 UTF-8，无需遗留解码」。
const CODE_PAGE_ENCODINGS: Record<number, string | null> = {
  65001: null,
  936: "gb18030",
  54936: "gb18030",
  932: "cp932",
  949: "cp949",
  866: "cp866",
};

// 区域前缀 → 默认编码，按顺序取第一个命中的。
const LOCALE_ENCODINGS: ReadonlyArray<{ pattern: RegExp; encoding: string }> = [
  { pattern: /\bzh(?:[-_]|\b)/, encoding: "gb18030" },
  { pattern: /\bja(?:[-_]|\b)/, encoding: "cp932" },
  { pattern: /\bko(?:[-_]|\b)/, encoding: "cp949" },
  { pattern: /\bru(?:[-_]|\b)/, encoding: "cp866" },
];
const WINDOWS_DEFAULT_ENCODING = "cp437";

/** win32 的环境变量名大小写不固定，取值前先按忽略大小写找到真实键名。 */
function keyFor(env: Record<string, string>, key: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return key;
  const lowered = key.toLowerCase();
  for (const candidate of Object.keys(env)) {
    if (candidate.toLowerCase() === lowered) return candidate;
  }
  return key;
}

/** C 与 POSIX 区域（含变体写法）都不指定具体字符集，应当补成 UTF-8。 */
function isLocaleWithoutCharset(value: string | undefined): boolean {
  if (value === undefined) return true;
  return /^(?:c|posix)(?:\.[^@]+)?(?:@.*)?$/i.test(value.trim());
}

/** 把区域与 Python 的编码变量统一成 UTF-8，避免子进程按本地代码页输出。 */
export function applyExecutionTextEnv(ask: {
  env: Record<string, string>;
  platform: NodeJS.Platform;
}): void {
  const { env, platform } = ask;
  for (const key of LOCALE_KEYS) {
    const actual = keyFor(env, key, platform);
    if (isLocaleWithoutCharset(env[actual])) env[actual] = UTF8_LOCALE;
  }
  env[keyFor(env, "PYTHONIOENCODING", platform)] = "utf-8";
  env[keyFor(env, "PYTHONUTF8", platform)] = "1";
}

/** 整块是否严格合法的 UTF-8。 */
function isWholeUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** 一次性解码：空串、合法 UTF-8、或没有遗留编码时都走 UTF-8。 */
export function decodeExecutionOutputBuffer(
  buffer: Buffer,
  legacyOutputEncoding?: string | null,
): string {
  if (buffer.length === 0) return "";
  if (legacyOutputEncoding === undefined || legacyOutputEncoding === null)
    return buffer.toString("utf8");
  if (isWholeUtf8(buffer)) return buffer.toString("utf8");
  try {
    return iconv.decode(buffer, legacyOutputEncoding);
  } catch {
    return buffer.toString("utf8");
  }
}

/**
 * 前缀的 UTF-8 状态：尾部被截断算 incomplete，遇到非法序列算 invalid。
 * 用一张「首字节 → 序列宽度」的表推进，避免逐区间比较。
 */
type PrefixVerdict = "valid" | "incomplete" | "invalid";

/** 首字节能开头的序列宽度；0 表示非法首字节。 */
function sequenceWidth(byte: number): number {
  if (byte <= 0x7f) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

/** 该宽度下允许的最小码点，用来排除超长编码。 */
const SMALLEST_CODE_POINT: readonly number[] = [0, 0, 0x80, 0x800, 0x10000];

function utf8PrefixState(bytes: Buffer): PrefixVerdict {
  let cursor = 0;
  while (cursor < bytes.length) {
    const lead = bytes[cursor] as number;
    const width = sequenceWidth(lead);
    if (width === 0) return "invalid";
    if (cursor + width > bytes.length) return "incomplete";
    if (width === 1) {
      cursor += 1;
      continue;
    }
    let codePoint = lead & (0x7f >> width);
    for (let step = 1; step < width; step += 1) {
      const continuation = bytes[cursor + step] as number;
      if ((continuation & 0xc0) !== 0x80) return "invalid";
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }
    const surrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    const outOfRange = codePoint > 0x10ffff || codePoint < (SMALLEST_CODE_POINT[width] as number);
    if (surrogate || outOfRange) return "invalid";
    cursor += width;
  }
  return "valid";
}

/**
 * 流式解码器：第一块决定本流走 UTF-8 还是遗留编码，之后固定不变。
 * 判断依据是「前缀状态」——尾部不完整就先缓冲等下一块，非法才切遗留编码。
 */
export function createExecutionOutputStreamDecoder(legacyOutputEncoding: string | null): {
  write: (buffer: Buffer) => string;
} {
  let held: Buffer = Buffer.alloc(0);
  let route: "utf8" | "legacy" | undefined;
  const utf8Reader = new TextDecoder("utf-8");
  const legacyReader = legacyOutputEncoding ? iconv.getDecoder(legacyOutputEncoding) : undefined;

  function settle(bytes: Buffer): string {
    const verdict = utf8PrefixState(bytes);
    if (verdict === "incomplete") return "";
    if (verdict === "valid" || legacyReader === undefined) {
      route = "utf8";
      const text = utf8Reader.decode(bytes, { stream: true });
      held = Buffer.alloc(0);
      return text;
    }
    route = "legacy";
    const text = legacyReader.write(bytes);
    held = Buffer.alloc(0);
    return text;
  }

  return {
    write(buffer: Buffer): string {
      if (buffer.length === 0) return "";
      if (route === "utf8") return utf8Reader.decode(buffer, { stream: true });
      if (route === "legacy") return legacyReader?.write(buffer) ?? "";
      held = held.length === 0 ? buffer : Buffer.concat([held, buffer]);
      return settle(held);
    },
  };
}

/** 显式配置的编码；配置了但 iconv 不认就当作没配。 */
function configuredEncoding(processEnv: NodeJS.ProcessEnv): string | undefined {
  const raw = getWindowsEnvValue(processEnv, "KNORVIA_WINDOWS_OUTPUT_ENCODING")?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  try {
    return iconv.encodingExists(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** 问一次控制台的活动代码页；拿不到就返回 undefined。 */
function queryCodePage(processEnv: NodeJS.ProcessEnv): number | undefined {
  const command = getWindowsEnvValue(processEnv, "ComSpec") || "cmd.exe";
  let printed: string;
  try {
    printed = execFileSync(command, ["/d", "/s", "/c", "chcp"], {
      encoding: "utf8",
      env: processEnv,
      timeout: CHCP_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch {
    return undefined;
  }
  const digits = /\b(\d{3,5})\b/.exec(printed);
  return digits === null ? undefined : Number(digits[1]);
}

/** 代码页优先查固定表，其次试 `cp<page>`，都没有则 undefined。 */
function encodingOfCodePage(page: number | undefined): string | null | undefined {
  if (page === undefined) return undefined;
  if (page in CODE_PAGE_ENCODINGS) return CODE_PAGE_ENCODINGS[page];
  const candidate = `cp${page}`;
  return iconv.encodingExists(candidate) ? candidate : undefined;
}

/** 代码页拿不到时按区域变量猜；一个都认不出就用 Windows 默认代码页。 */
function encodingOfLocale(processEnv: NodeJS.ProcessEnv): string {
  const joined = ["LC_ALL", "LC_CTYPE", "LANG", "LANGUAGE"]
    .map((key) => getWindowsEnvValue(processEnv, key))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const rule of LOCALE_ENCODINGS) {
    if (rule.pattern.test(joined)) return rule.encoding;
  }
  return WINDOWS_DEFAULT_ENCODING;
}

/** 入口：推断本机的遗留输出编码；非 win32 一律 null（意为纯 UTF-8）。 */
export function resolveLegacyExecutionOutputEncoding(options: {
  platform: NodeJS.Platform;
  processEnv: NodeJS.ProcessEnv;
}): string | null {
  if (options.platform !== "win32") return null;
  const explicit = configuredEncoding(options.processEnv);
  if (explicit !== undefined) return /^utf-?8$/i.test(explicit) ? null : explicit;
  return (
    encodingOfCodePage(queryCodePage(options.processEnv)) ?? encodingOfLocale(options.processEnv)
  );
}
