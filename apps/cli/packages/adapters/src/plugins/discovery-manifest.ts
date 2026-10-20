// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 从候选目录读出一份可用的插件清单。读取顺序固定：先确认根是可读目录，再按三个约定
// 目录依次找 plugin.json；第一个能读出且形状合法的清单即为结果。
// 失败一律折成一条 error 级诊断，调用方只需看返回是否 undefined。

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { isNotFoundError, isRecord } from "./helpers.js";
import { diagnostic, validIdentity } from "./discovery-diagnostics.js";
import type { LoadedPlugin, PluginCandidate } from "./types.js";

/** 清单所在的约定目录，按优先级排列。 */
const MANIFEST_DIRECTORIES = [".knorvia-plugin", ".claude-plugin", ".codex-plugin"] as const;

/** 清单里必须为字符串的元数据字段（缺省允许，出现就必须是字符串）。 */
const STRING_METADATA_FIELDS = ["version", "description", "homepage", "license", "repository"];

/** 缺省版本：清单未声明时使用，避免下游拿到 undefined。 */
const FALLBACK_VERSION = "0.0.0";

/** 诊断目录：把「错误码 + 文案」与具体路径分开，避免每处重复写六参数调用。 */
const PROBLEM = {
  rootMissing: ["plugin_root_not_found", "Plugin root is not a directory"],
  rootUnreadable: ["plugin_root_not_found", "Plugin root cannot be read"],
  manifestUnreadable: ["plugin_manifest_invalid", "Plugin manifest cannot be read"],
  manifestMalformed: [
    "plugin_manifest_invalid",
    "Plugin manifest must contain a valid plugin identity and metadata",
  ],
  manifestAbsent: ["plugin_manifest_not_found", "No supported plugin manifest was found"],
} as const satisfies Record<string, readonly [string, string]>;

/** 记一条 error 级诊断并返回 undefined，供「出错即退出」的分支直接 `return`。 */
function fail(
  diagnostics: PluginDiagnostic[],
  problem: readonly [string, string],
  path: string,
): undefined {
  diagnostic(diagnostics, problem[0] as never, problem[1], undefined, path, "error");
  return undefined;
}

/** 根是否为可读目录；不可读与不是目录分成两条不同诊断。 */
function checkRoot(
  candidate: PluginCandidate,
  diagnostics: PluginDiagnostic[],
): "ok" | "missing" | "unreadable" {
  let isDirectory: boolean;
  try {
    isDirectory = statSync(candidate.rootPath).isDirectory();
  } catch {
    return "unreadable";
  }
  return isDirectory ? "ok" : "missing";
}

/** 清单内容是否满足最小形状：身份合法、元数据字段类型正确、userConfig 是对象。 */
function shapeIsValid(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw) || !validIdentity(raw.name)) return false;
  for (const field of STRING_METADATA_FIELDS) {
    const value = raw[field];
    if (value !== undefined && typeof value !== "string") return false;
  }
  if (raw.userConfig !== undefined && !isRecord(raw.userConfig)) return false;
  return true;
}

/** 由已校验的原文组装清单对象。 */
function toManifest(raw: Record<string, unknown>): PluginManifest {
  const version = typeof raw.version === "string" ? raw.version : FALLBACK_VERSION;
  return { ...raw, name: raw.name, version } as PluginManifest;
}

/** 由候选与清单组装已装载插件记录。 */
function toLoadedPlugin(
  candidate: PluginCandidate,
  manifest: PluginManifest,
  manifestPath: string,
): LoadedPlugin {
  const loaded = {} as LoadedPlugin;
  loaded.id = `${manifest.name}@${candidate.marketplace}`;
  loaded.manifest = manifest;
  loaded.manifestPath = manifestPath;
  loaded.marketplace = candidate.marketplace;
  loaded.rootPath = candidate.rootPath;
  loaded.source = candidate.source;
  return loaded;
}

export function readCandidate(
  /* 待读取候选 */ candidate: PluginCandidate,
  /* 逐条诊断收集器 */ diagnostics: PluginDiagnostic[],
): LoadedPlugin | undefined {
  const rootState = checkRoot(candidate, diagnostics);
  if (rootState === "missing") return fail(diagnostics, PROBLEM.rootMissing, candidate.rootPath);
  if (rootState === "unreadable")
    return fail(diagnostics, PROBLEM.rootUnreadable, candidate.rootPath);

  for (const directory of MANIFEST_DIRECTORIES) {
    const manifestPath = join(candidate.rootPath, directory, "plugin.json");
    let content: string;
    try {
      content = readFileSync(manifestPath, "utf8");
    } catch (error) {
      // 该目录没有清单属于正常情况，继续找下一个约定目录。
      if (isNotFoundError(error)) continue;
      return fail(diagnostics, PROBLEM.manifestUnreadable, manifestPath);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return fail(diagnostics, PROBLEM.manifestMalformed, manifestPath);
    }
    if (!shapeIsValid(raw)) return fail(diagnostics, PROBLEM.manifestMalformed, manifestPath);
    return toLoadedPlugin(candidate, toManifest(raw), manifestPath);
  }

  return fail(diagnostics, PROBLEM.manifestAbsent, candidate.rootPath);
}
