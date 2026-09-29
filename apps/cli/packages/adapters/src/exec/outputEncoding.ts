// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";
import iconv from "iconv-lite";
import { getWindowsEnvValue } from "./windows-executable.js";

const UTF8_LOCALE = "C.UTF-8";
const ACTIVE_CODE_PAGE_TIMEOUT_MS = 1_000;
const LOCALE_KEYS = ["LANG", "LC_ALL", "LC_CTYPE"];

function findKey(env: Record<string, string>, key: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return key;
  return Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase()) ?? key;
}

function shouldSupplyUtf8(value: string | undefined): boolean {
  return value === undefined || /^(?:c|posix)(?:\.[^@]+)?(?:@.*)?$/i.test(value.trim());
}

export function applyExecutionTextEnv(
  env: Record<string, string>,
  platform: NodeJS.Platform,
): void {
  for (const key of LOCALE_KEYS) {
    const actual = findKey(env, key, platform);
    if (shouldSupplyUtf8(env[actual])) env[actual] = UTF8_LOCALE;
  }
  env[findKey(env, "PYTHONIOENCODING", platform)] = "utf-8";
  env[findKey(env, "PYTHONUTF8", platform)] = "1";
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export function decodeExecutionOutputBuffer(
  buffer: Buffer,
  legacyOutputEncoding?: string | null,
): string {
  if (buffer.length === 0) return "";
  if (isValidUtf8(buffer) || !legacyOutputEncoding) return buffer.toString("utf8");
  try {
    return iconv.decode(buffer, legacyOutputEncoding);
  } catch {
    return buffer.toString("utf8");
  }
}

type Utf8PrefixState = "valid" | "incomplete" | "invalid";

function utf8PrefixState(buffer: Buffer): Utf8PrefixState {
  let index = 0;
  while (index < buffer.length) {
    const first = buffer[index]!;
    if (first <= 0x7f) {
      index += 1;
      continue;
    }
    let width = 0;
    let minimum = 0;
    if (first >= 0xc2 && first <= 0xdf) {
      width = 2;
      minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      width = 3;
      minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      width = 4;
      minimum = 0x10000;
    } else {
      return "invalid";
    }
    if (index + width > buffer.length) return "incomplete";
    let codePoint = first & (0x7f >> width);
    for (let offset = 1; offset < width; offset += 1) {
      const next = buffer[index + offset]!;
      if ((next & 0xc0) !== 0x80) return "invalid";
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (
      codePoint < minimum ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return "invalid";
    }
    index += width;
  }
  return "valid";
}

export function createExecutionOutputStreamDecoder(legacyOutputEncoding: string | null): {
  write: (buffer: Buffer) => string;
} {
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let selected: "utf8" | "legacy" | undefined;
  const utf8 = new TextDecoder("utf-8");
  const legacy = legacyOutputEncoding ? iconv.getDecoder(legacyOutputEncoding) : undefined;
  return {
    write(buffer: Buffer): string {
      if (buffer.length === 0) return "";
      if (selected === "utf8") return utf8.decode(buffer, { stream: true });
      if (selected === "legacy" && legacy) return legacy.write(buffer);
      pending = pending.length === 0 ? buffer : Buffer.concat([pending, buffer]);
      const state = utf8PrefixState(pending);
      if (state === "incomplete") return "";
      if (state === "valid" || !legacy) {
        selected = "utf8";
        const output = utf8.decode(pending, { stream: true });
        pending = Buffer.alloc(0);
        return output;
      }
      selected = "legacy";
      const output = legacy.write(pending);
      pending = Buffer.alloc(0);
      return output;
    },
  };
}

function explicitEncoding(processEnv: NodeJS.ProcessEnv): string | undefined {
  const configured = getWindowsEnvValue(processEnv, "KNORVIA_WINDOWS_OUTPUT_ENCODING")?.trim();
  if (!configured) return undefined;
  try {
    return iconv.encodingExists(configured) ? configured : undefined;
  } catch {
    return undefined;
  }
}

function queryActiveCodePage(processEnv: NodeJS.ProcessEnv): number | undefined {
  const command = getWindowsEnvValue(processEnv, "ComSpec") || "cmd.exe";
  try {
    const output = execFileSync(command, ["/d", "/s", "/c", "chcp"], {
      encoding: "utf8",
      env: processEnv,
      timeout: ACTIVE_CODE_PAGE_TIMEOUT_MS,
      windowsHide: true,
    });
    const match = /\b(\d{3,5})\b/.exec(output);
    return match ? Number(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function encodingForCodePage(codePage: number | undefined): string | null | undefined {
  if (codePage === 65001) return null;
  if (codePage === 936 || codePage === 54936) return "gb18030";
  if (codePage === 932) return "cp932";
  if (codePage === 949) return "cp949";
  if (codePage === 866) return "cp866";
  if (codePage !== undefined && iconv.encodingExists(`cp${codePage}`)) return `cp${codePage}`;
  return undefined;
}

function localeFallback(processEnv: NodeJS.ProcessEnv): string {
  const locale = ["LC_ALL", "LC_CTYPE", "LANG", "LANGUAGE"]
    .map((key) => getWindowsEnvValue(processEnv, key))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bzh(?:[-_]|\b)/.test(locale)) return "gb18030";
  if (/\bja(?:[-_]|\b)/.test(locale)) return "cp932";
  if (/\bko(?:[-_]|\b)/.test(locale)) return "cp949";
  if (/\bru(?:[-_]|\b)/.test(locale)) return "cp866";
  return "cp437";
}

export function resolveLegacyExecutionOutputEncoding(options: {
  platform: NodeJS.Platform;
  processEnv: NodeJS.ProcessEnv;
}): string | null {
  if (options.platform !== "win32") return null;
  const configured = explicitEncoding(options.processEnv);
  if (configured) return /^utf-?8$/i.test(configured) ? null : configured;
  return (
    encodingForCodePage(queryActiveCodePage(options.processEnv)) ??
    localeFallback(options.processEnv)
  );
}
