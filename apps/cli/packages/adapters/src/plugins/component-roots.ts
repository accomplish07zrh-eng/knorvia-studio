// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { join } from "node:path";
import type { PluginDiagnostic } from "@knorvia/contracts";
import { scanSkillFilesUnderRootSync } from "../skills/scan.js";
import {
  directoryExists,
  fileExists,
  isMissingPath,
  parsePathList,
  resolveInside,
} from "./helpers.js";
import { diagnostic } from "./discovery-diagnostics.js";
import type { LoadedPlugin } from "./types.js";

export function componentPaths(
  loaded: LoadedPlugin,
  kind: "agents" | "commands" | "skills",
  diagnostics: PluginDiagnostic[],
): string[] {
  const roots = new Set<string>();
  const conventional = join(loaded.rootPath, kind);
  if (directoryExists(conventional)) roots.add(conventional);
  for (const raw of parsePathList(loaded.manifest[kind])) {
    const path = resolveInside(loaded.rootPath, raw);
    if (!path) {
      diagnostic(
        diagnostics,
        "plugin_component_path_invalid",
        `${kind} path escapes plugin root`,
        loaded,
        loaded.manifestPath,
      );
      continue;
    }
    if (directoryExists(path) || (kind !== "skills" && fileExists(path))) roots.add(path);
    else if (isMissingPath(path))
      diagnostic(
        diagnostics,
        kind === "skills" ? "plugin_skill_root_empty" : "plugin_component_path_invalid",
        `Declared ${kind} path does not exist`,
        loaded,
        path,
      );
  }
  return [...roots];
}

export function skillFiles(
  loaded: LoadedPlugin,
  roots: string[],
  diagnostics: PluginDiagnostic[],
): string[] {
  const found = new Set<string>();
  try {
    for (const path of roots) {
      const files = scanSkillFilesUnderRootSync(path, { followSymbolicLinks: false });
      for (const file of files) found.add(file);
      if (files.length === 0 && !isMissingPath(path))
        diagnostic(
          diagnostics,
          "plugin_skill_root_empty",
          "Plugin skill root contains no skill files",
          loaded,
          path,
        );
    }
  } catch {
    // 扫描权限异常不能等同于路径不存在；概览降级为零，保留根供后续宿主诊断。
    return [];
  }
  return [...found];
}
