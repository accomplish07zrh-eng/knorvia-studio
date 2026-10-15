// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { isNotFoundError, isRecord } from "./helpers.js";
import { diagnostic, validIdentity } from "./discovery-diagnostics.js";
import type { LoadedPlugin, PluginCandidate } from "./types.js";

export function readCandidate(
  /* 待读取候选 */ candidate: PluginCandidate,
  /* 逐条诊断收集器 */ diagnostics: PluginDiagnostic[],
): LoadedPlugin | undefined {
  try {
    if (!statSync(candidate.rootPath).isDirectory()) {
      diagnostic(
        /* 根目录缺失诊断 */ diagnostics,
        "plugin_root_not_found",
        "Plugin root is not a directory",
        undefined,
        candidate.rootPath,
        "error",
      );
      return undefined;
    }
  } catch /* 根目录不可访问：按缺失候选处理 */ {
    diagnostic(
      /* 根目录不可读诊断 */ diagnostics,
      "plugin_root_not_found",
      "Plugin root cannot be read",
      undefined,
      candidate.rootPath,
      "error",
    );
    return undefined;
  }
  for (const directory of [".knorvia-plugin", ".claude-plugin", ".codex-plugin"]) {
    const manifestPath = /* 该候选目录下的清单路径 */ join(
      candidate.rootPath,
      directory,
      "plugin.json",
    );
    let content: string;
    try {
      content = readFileSync(manifestPath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) /* 尚未尝试完全部支持的目录 */ continue;
      diagnostic(
        /* 清单不可读诊断 */ diagnostics,
        "plugin_manifest_invalid",
        "Plugin manifest cannot be read",
        undefined,
        /* 该清单路径 */ manifestPath,
        "error",
      );
      return /* 清单不可读：不再尝试其它目录 */ undefined;
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
        id: /* 标识为 插件名@市场 */ `${manifest.name}@${candidate.marketplace}`,
        /* 已校验清单 */ manifest,
        manifestPath,
        marketplace: candidate.marketplace,
        rootPath: candidate.rootPath,
        source: candidate.source,
      };
    } catch {
      diagnostic(
        /* 清单形状非法诊断 */ diagnostics,
        "plugin_manifest_invalid",
        "Plugin manifest must contain a valid plugin identity and metadata",
        undefined,
        /* 该清单路径 */ manifestPath,
        "error",
      );
      return /* 形状非法：诊断已入列 */ undefined;
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
