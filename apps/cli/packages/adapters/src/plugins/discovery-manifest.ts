// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { isNotFoundError, isRecord } from "./helpers.js";
import { diagnostic, validIdentity } from "./discovery-diagnostics.js";
import type { LoadedPlugin, PluginCandidate } from "./types.js";

export function readCandidate(
  candidate: PluginCandidate,
  diagnostics: PluginDiagnostic[],
): LoadedPlugin | undefined {
  try {
    if (!statSync(candidate.rootPath).isDirectory()) {
      diagnostic(
        diagnostics,
        "plugin_root_not_found",
        "Plugin root is not a directory",
        undefined,
        candidate.rootPath,
        "error",
      );
      return undefined;
    }
  } catch {
    diagnostic(
      diagnostics,
      "plugin_root_not_found",
      "Plugin root cannot be read",
      undefined,
      candidate.rootPath,
      "error",
    );
    return undefined;
  }
  for (const directory of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    const manifestPath = join(candidate.rootPath, directory, "plugin.json");
    let content: string;
    try {
      content = readFileSync(manifestPath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) continue;
      diagnostic(
        diagnostics,
        "plugin_manifest_invalid",
        "Plugin manifest cannot be read",
        undefined,
        manifestPath,
        "error",
      );
      return undefined;
    }
    try {
      const raw: unknown = JSON.parse(content);
      if (!isRecord(raw) || !validIdentity(raw.name)) throw new Error("Invalid identity");
      for (const field of ["version", "description", "homepage", "license", "repository"])
        if (raw[field] !== undefined && typeof raw[field] !== "string")
          throw new Error("Invalid manifest field");
      if (raw.userConfig !== undefined && !isRecord(raw.userConfig))
        throw new Error("Invalid user configuration");
      const manifest = {
        ...raw,
        name: raw.name,
        version: typeof raw.version === "string" ? raw.version : "0.0.0",
      } as PluginManifest;
      return {
        id: `${manifest.name}@${candidate.marketplace}`,
        manifest,
        manifestPath,
        marketplace: candidate.marketplace,
        rootPath: candidate.rootPath,
        source: candidate.source,
      };
    } catch {
      diagnostic(
        diagnostics,
        "plugin_manifest_invalid",
        "Plugin manifest must contain a valid plugin identity and metadata",
        undefined,
        manifestPath,
        "error",
      );
      return undefined;
    }
  }
  diagnostic(
    diagnostics,
    "plugin_manifest_not_found",
    "No supported plugin manifest was found",
    undefined,
    candidate.rootPath,
    "error",
  );
  return undefined;
}
