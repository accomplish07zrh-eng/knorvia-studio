// Reconstruct formats from frozen behavior, retaining grammar and existing parser libraries.
import { parse as toml } from "smol-toml";
import { parse as yaml } from "yaml";
import type { TerminalDetectedProfile } from "./terminalProfileTypes.js";
import type { TerminalProfileFormat } from "./terminalProfilePortablePlan.js";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function textAt(value: unknown, ...keys: string[]): string | null {
  const leaf = keys.reduce<unknown>((current, key) => object(current)?.[key], value);
  return typeof leaf === "string" && leaf.trim() ? leaf.trim() : null;
}

// Lexical spans preserve quoted text. Only the last significant comma is discarded at
// a closing delimiter; comments/whitespace do not change that pending separator.
function jsoncSpans(raw: string): string {
  const spans: string[] = [];
  let cursor = 0;
  let comma: number | null = null;
  while (cursor < raw.length) {
    if (raw.startsWith("//", cursor)) {
      const newline = raw.indexOf("\n", cursor + 2);
      cursor = newline < 0 ? raw.length : newline + 1;
      spans.push("\n");
      continue;
    }
    if (raw.startsWith("/*", cursor)) {
      const end = raw.indexOf("*/", cursor + 2);
      cursor = end < 0 ? raw.length : end + 2;
      continue;
    }
    const start = cursor;
    const character = raw[cursor++]!;
    if (character === '"') {
      while (cursor < raw.length) {
        const next = raw[cursor++]!;
        if (next === "\\") cursor++;
        else if (next === '"') break;
      }
      spans.push(raw.slice(start, cursor));
      comma = null;
    } else if (/\s/u.test(character)) {
      while (cursor < raw.length && /\s/u.test(raw[cursor]!)) cursor++;
      spans.push(raw.slice(start, cursor));
    } else if (character === ",") {
      comma = spans.push(character) - 1;
    } else if (character === "}" || character === "]") {
      if (comma !== null) spans[comma] = "";
      spans.push(character);
      comma = null;
    } else {
      while (cursor < raw.length && !/[\s",}\]/]/u.test(raw[cursor]!)) cursor++;
      spans.push(raw.slice(start, cursor));
      comma = null;
    }
  }
  return spans.join("");
}

function jsonObject(raw: string): Record<string, unknown> | null {
  const attempt = (text: string) => {
    try {
      return object(JSON.parse(text));
    } catch {
      return null;
    }
  };
  return attempt(raw) ?? attempt(jsoncSpans(raw));
}
function windowsFont(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const profiles = object(config.profiles);
  const list = Array.isArray(profiles?.list) ? profiles.list : [];
  const defaultId = textAt(config, "defaultProfile");
  const ranked = [
    defaultId ? list.filter((item) => object(item)?.guid === defaultId) : [],
    [profiles?.defaults],
    list,
  ];
  for (const tier of ranked) {
    for (const item of tier) {
      const font = textAt(item, "font", "face");
      if (font) return font;
    }
  }
  return null;
}

export function interpretTerminalProfile(
  format: TerminalProfileFormat,
  raw: string,
): TerminalDetectedProfile | null {
  if (format === "kitty") {
    const captured = raw.match(/^\s*font_family\s+(.+)$/m)?.[1]?.trim();
    return captured ? { fontFamily: captured.replace(/^"|"$/g, "") } : null;
  }
  const config =
    format === "toml" ? object(toml(raw)) : format === "yaml" ? object(yaml(raw)) : jsonObject(raw);
  const font =
    format === "windows-jsonc"
      ? windowsFont(config)
      : format === "vscode-jsonc"
        ? textAt(config, "terminal.integrated.fontFamily")
        : textAt(config, "font", "normal", "family");
  return font ? { fontFamily: font } : null;
}
