// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginDiagnostic, PluginDiagnosticCode } from "@knorvia/contracts";
import { isRecord, resolveInside } from "./helpers.js";
import { diagnostic, text } from "./discovery-diagnostics.js";
import type { LoadedPlugin } from "./types.js";

function commandName(name: string): string | undefined {
  const safe = name.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,127}$/.test(safe) ? safe : undefined;
}

class CommandDeclarationError extends Error {
  constructor(
    message: string,
    readonly code: PluginDiagnosticCode = "plugin_manifest_invalid",
  ) {
    super(message);
  }
}

function frontmatterScalar(value: string): string {
  return /^[a-zA-Z0-9<][a-zA-Z0-9 _,./<>-]*$/.test(value) ? value : JSON.stringify(value);
}

function markdown(value: Record<string, unknown>, loaded: LoadedPlugin): string {
  const source = text(value.source);
  const content = typeof value.content === "string" ? value.content : undefined;
  if ((source === undefined) === (content === undefined))
    throw new CommandDeclarationError("Command requires exactly one source or content");
  let body: string;
  if (source) {
    const path = resolveInside(loaded.rootPath, source);
    if (!path)
      throw new CommandDeclarationError(
        "Command source escapes plugin root",
        "plugin_component_path_invalid",
      );
    body = readFileSync(path, "utf8");
  } else body = content ?? "";
  const fields: string[] = [];
  for (const [key, alias] of [
    ["description", "description"],
    ["argument-hint", "argumentHint"],
    ["model", "model"],
    ["allowed-tools", "allowedTools"],
  ] as const) {
    const entry = value[key] ?? value[alias];
    if (typeof entry === "string" && key !== "allowed-tools")
      fields.push(`${key}: ${frontmatterScalar(entry)}`);
    else if (
      key === "allowed-tools" &&
      Array.isArray(entry) &&
      entry.every((item) => typeof item === "string")
    )
      fields.push(`${key}: ${frontmatterScalar(entry.join(", "))}`);
  }
  return fields.length ? `---\n${fields.join("\n")}\n---\n\n${body}` : body;
}

export function materializeCommands(
  loaded: LoadedPlugin,
  dataPath: string,
  enabled: boolean,
  diagnostics: PluginDiagnostic[],
): string | undefined {
  const commands = loaded.manifest.commands;
  if (!isRecord(commands)) return undefined;
  const outputRoot = join(dataPath, "generated-commands");
  const names = new Set<string>();
  let written = false;
  for (const [rawName, value] of Object.entries(commands)) {
    const name = commandName(rawName);
    try {
      if (!name || names.has(name) || !isRecord(value))
        throw new CommandDeclarationError("Invalid or colliding command name");
      names.add(name);
      const output = resolveInside(outputRoot, `${name}.md`);
      if (!output)
        throw new CommandDeclarationError(
          "Invalid command output path",
          "plugin_component_path_invalid",
        );
      const body = markdown(value, loaded);
      if (enabled) {
        mkdirSync(outputRoot, { recursive: true });
        writeFileSync(output, body, "utf8");
        written = true;
      }
    } catch (error) {
      diagnostic(
        diagnostics,
        error instanceof CommandDeclarationError ? error.code : "plugin_manifest_invalid",
        `Invalid command declaration ${rawName}`,
        loaded,
        loaded.manifestPath,
        "error",
      );
    }
  }
  return written ? outputRoot : undefined;
}
