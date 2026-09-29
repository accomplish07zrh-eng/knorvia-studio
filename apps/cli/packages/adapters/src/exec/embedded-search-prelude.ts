// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ExecutionEmbeddedSearchPrelude, ExecutionShellSelection } from "@knorvia/contracts";
import { windowsPathToGitBashPath } from "@knorvia/contracts";

type EmbeddedSearchPreludeShellDialect = ExecutionShellSelection["dialect"];
interface EmbeddedSearchPreludeOptions {
  shellDialect?: EmbeddedSearchPreludeShellDialect;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandPath(
  value: string,
  dialect: EmbeddedSearchPreludeShellDialect | undefined,
): string {
  if (dialect === "git-bash" && /^[a-zA-Z]:[\\/]/.test(value)) {
    return windowsPathToGitBashPath(value);
  }
  return value;
}

function environmentPrefix(env: Record<string, string> | undefined): string {
  const entries = Object.entries(env ?? {});
  if (entries.length === 0) return "";
  return `env ${entries.map(([key, value]) => quote(`${key}=${value}`)).join(" ")} `;
}

function assignmentPrefix(env: Record<string, string> | undefined): string {
  const entries = Object.entries(env ?? {});
  return entries.length === 0
    ? ""
    : `export ${entries.map(([key, value]) => quote(`${key}=${value}`)).join(" ")}; `;
}

function backendInvocation(
  prelude: ExecutionEmbeddedSearchPrelude,
  tool: "find" | "grep" | "rg",
  dialect: EmbeddedSearchPreludeShellDialect | undefined,
): string | undefined {
  const backend = prelude.backend;
  if (backend.kind === "native-binaries") {
    const value =
      tool === "find"
        ? backend.findCommand
        : tool === "grep"
          ? backend.grepCommand
          : backend.rgCommand;
    if (!value) return undefined;
    return `${quote(commandPath(value, dialect))} "$@"`;
  }
  if (backend.kind === "internal-cli" && tool === "rg") return undefined;
  if (!backend.command) return undefined;
  const file = quote(commandPath(backend.command, dialect));
  const args = (backend.args ?? []).map(quote).join(" ");
  if (backend.kind === "argv0-dispatch") {
    return `(${assignmentPrefix(backend.env)}exec -a ${quote(tool)} ${file}${args ? ` ${args}` : ""} "$@")`;
  }
  const dispatch = quote(tool);
  return `${environmentPrefix(backend.env)}${file}${args ? ` ${args}` : ""} ${dispatch} "$@"`;
}

function wrapper(name: string, invocation: string): string {
  return `${name}() { ${invocation}; }`;
}

function grepWrapper(invocation: string): string {
  return [
    "grep() {",
    '  case " $* " in',
    '    *" --null-data "*|*" -z "*|*" --config "*|*" --config="*|*" --filter "*|*" --filter="*|*" --view "*|*" --view="*) command grep "$@" ; return $? ;;',
    "  esac",
    `  ${invocation}`,
    "}",
  ].join("\n");
}

export function buildEmbeddedSearchPreludeContent(
  prelude?: ExecutionEmbeddedSearchPrelude,
  options: EmbeddedSearchPreludeOptions = {},
): string | undefined {
  if (!prelude || prelude.kind !== "embedded-search") return undefined;
  const rg = backendInvocation(prelude, "rg", options.shellDialect);
  const find = backendInvocation(prelude, "find", options.shellDialect);
  const grep = backendInvocation(prelude, "grep", options.shellDialect);
  const fragments: string[] = [];
  if (rg) fragments.push(wrapper("rg", rg));
  if (prelude.findAndGrepEnabled !== false) {
    if (find && options.shellDialect !== "git-bash") fragments.push(wrapper("find", find));
    if (grep) fragments.push(grepWrapper(grep));
  }
  return fragments.length > 0 ? `${fragments.join("\n\n")}\n` : undefined;
}
