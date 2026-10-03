import type { SSHConfigAliasOption } from "@knorvia/shared";
import type { Context, Declaration } from "./configuration.js";
import { homeToken } from "./tokens.js";

function matchesOne(pattern: string, alias: string): boolean {
  if (pattern === "*") return true;
  if (!/[*?]/.test(pattern)) return pattern === alias;
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "*") expression += ".*";
    else if (char === "?") expression += ".";
    else expression += /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${expression}$`).test(alias);
}

function matchesContext(patterns: string[], alias: string): boolean {
  let positive = false;
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern.startsWith("!")) {
      const excluded = pattern.slice(1);
      if (excluded && matchesOne(excluded, alias)) return false;
    } else if (matchesOne(pattern, alias)) {
      positive = true;
    }
  }
  return positive;
}

export function validPort(value: string): number | undefined {
  const port = parseInt(value.trim(), 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

export function fallbackOption(
  declaration: Declaration,
  contexts: Context[],
): SSHConfigAliasOption {
  let host: string | undefined;
  let port: number | undefined;
  let username: string | undefined;
  let privateKeyPath: string | undefined;
  for (const context of contexts) {
    if (!matchesContext(context.patterns, declaration.alias)) continue;
    for (const directive of context.directives) {
      if (directive.key === "hostname" && !host) {
        host = directive.value.trim() || undefined;
      } else if (directive.key === "user" && !username) {
        username = directive.value.trim() || undefined;
      } else if (directive.key === "port" && port == null) {
        port = validPort(directive.value);
      } else if (directive.key === "identityfile" && !privateKeyPath) {
        privateKeyPath = homeToken(directive.value).trim() || undefined;
      }
    }
  }
  return {
    alias: declaration.alias,
    host: host ?? declaration.alias,
    port,
    username,
    privateKeyPath,
    source: declaration.source,
  };
}

export function mergeQuery(
  output: string | null,
  fallback: SSHConfigAliasOption,
): SSHConfigAliasOption {
  if (!output) return fallback;
  const parsed: {
    host: string | undefined;
    port: number | undefined;
    username: string | undefined;
  } = {
    host: undefined,
    port: undefined,
    username: undefined,
  };
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "hostname" && !parsed.host) parsed.host = value || undefined;
    else if (key === "user" && !parsed.username) parsed.username = value || undefined;
    else if (key === "port" && parsed.port == null) parsed.port = validPort(value);
  }
  return {
    alias: fallback.alias,
    host: parsed.host ?? fallback.host ?? fallback.alias,
    port: parsed.port ?? fallback.port,
    username: parsed.username ?? fallback.username,
    privateKeyPath: fallback.privateKeyPath,
    source: fallback.source,
  };
}
