// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 单个插件根目录的校验：读清单 → 比对名字 → 收集兼容性提示 → 试解析 MCP 声明。
// 校验只产出诊断列表，不抛错（清单读不出来也算一条诊断）；diagnosticForError 是
// 全模块把任意异常折成诊断的唯一入口，错误码优先取来源分类、其次取目录专用码。

import { join } from "node:path";
import {
  isOfficialMarketplaceId,
  type PluginDiagnostic,
  type PluginManifest,
} from "@knorvia/contracts";
import { CatalogOperationError } from "./catalog-dependencies.js";
import { getPluginDataDir } from "./catalog-repository.js";
import type { PluginMarketplaceEntry, PluginValidationDiagnostic } from "./catalog-types.js";
import { isRecord } from "./helpers.js";
import { loadPluginMcpServerDefinitions, resolvePluginMcpServers } from "./mcp.js";
import {
  readPluginDocument,
  syntheticPluginManifest,
  type PluginDocument,
} from "./plugin-document.js";
import { getPluginSourceDiagnosticCode } from "./source-errors.js";
import type { LoadedPlugin } from "./types.js";

/** 只做诊断、不参与运行时不支持的组件名。 */
const DIAGNOSTIC_ONLY_COMPONENTS = ["channels", "lspServers", "outputStyles", "settings"];

/** 无法直接执行的打包来源后缀：需要先物化才有意义。 */
const UNSUPPORTED_BUNDLE_SUFFIXES = [".mcpb", ".dxt"];

/** 清单缺失时默认的清单位置（官方约定目录）。 */
const DEFAULT_MANIFEST_DIRECTORY = ".claude-plugin";

/** 校验入参。 */
type RootValidationAsk = {
  root: string;
  marketplace: string;
  entry: PluginMarketplaceEntry;
  storageRoot: string;
  document?: PluginDocument;
};

/** 造一条硬失败诊断（校验里所有「立即失败」的分支都走这里）。 */
function failure(
  code: PluginValidationDiagnostic["code"],
  message: string,
  path: string,
  pluginId: string,
): PluginValidationDiagnostic {
  return { code, message, severity: "error", path, pluginId };
}

export function diagnosticForError(
  /* 被包装的原始异常 */ error: unknown,
  /* 归属插件 */ pluginId?: string,
  /* 相关文件路径 */ path?: string,
): PluginValidationDiagnostic {
  const fromSource = getPluginSourceDiagnosticCode(error);
  const fromCatalog = error instanceof CatalogOperationError ? error.diagnosticCode : undefined;
  const diagnostic = {} as PluginValidationDiagnostic;
  diagnostic.code = fromSource ?? fromCatalog ?? "plugin_marketplace_invalid";
  // 保留原始错误文本，不在诊断层改写。
  diagnostic.message = error instanceof Error ? error.message : String(error);
  diagnostic.severity = "error";
  if (pluginId !== undefined) diagnostic.pluginId = pluginId;
  if (path !== undefined) diagnostic.path = path;
  return diagnostic;
}

/** 清单里是否引用了需要物化的打包来源（可能是嵌套数组）。 */
function hasUnsupportedBundle(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seenArrays = new Set<unknown[]>();
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === "string") {
      if (UNSUPPORTED_BUNDLE_SUFFIXES.some((suffix) => item.endsWith(suffix))) return true;
      continue;
    }
    if (!Array.isArray(item) || seenArrays.has(item)) continue;
    seenArrays.add(item);
    for (const nested of item) pending.push(nested);
  }
  return false;
}

/** 必需但没给默认值的配置项：逐个报缺失。 */
function missingRequiredOptions(userConfig: unknown, report: (message: string) => void): void {
  if (!isRecord(userConfig)) return;
  for (const [name, option] of Object.entries(userConfig)) {
    if (!isRecord(option)) continue;
    if (option.required === true && option.default === undefined) {
      report(`Plugin configuration ${name} requires a value`);
    }
  }
}

export function appendCompatibilityDiagnostics(
  /* 清单（原文或合成） */ manifest: Record<string, unknown> | PluginManifest,
  /* 归属插件 */ pluginId: string,
  /* 定位路径 */ path: string | undefined,
  /* 逐条累积的诊断 */ diagnostics: PluginValidationDiagnostic[],
): void {
  const report = (code: PluginValidationDiagnostic["code"], message: string): void => {
    const diagnostic = {} as PluginValidationDiagnostic;
    diagnostic.code = code;
    diagnostic.message = message;
    diagnostic.severity = "warning";
    diagnostic.pluginId = pluginId;
    if (path !== undefined) diagnostic.path = path;
    diagnostics.push(diagnostic);
  };
  for (const component of DIAGNOSTIC_ONLY_COMPONENTS) {
    if (component in manifest) {
      report("plugin_unsupported_component", `Plugin component ${component} is diagnostic-only`);
    }
  }
  missingRequiredOptions(manifest.userConfig, (message) =>
    report("plugin_variable_missing", message),
  );
  if (hasUnsupportedBundle(manifest.mcpServers)) {
    report(
      "plugin_marketplace_source_unsupported",
      "MCP bundle sources (.mcpb/.dxt) are not supported",
    );
  }
}

/** 组装可装载上下文；清单路径缺省时落到官方约定目录。 */
export function loadedForRoot(
  /* 插件根目录 */ pluginRoot: string,
  /* 所属市场 */ market: string,
  /* 规范化清单 */ manifest: PluginManifest,
  manifestPath?: string,
): LoadedPlugin {
  const loaded = {} as LoadedPlugin;
  loaded.id = `${manifest.name}@${market}`;
  loaded.marketplace = market;
  loaded.rootPath = pluginRoot;
  loaded.manifest = manifest;
  loaded.manifestPath = manifestPath ?? join(pluginRoot, DEFAULT_MANIFEST_DIRECTORY, "plugin.json");
  loaded.source = isOfficialMarketplaceId(market) ? "official" : "cache";
  return loaded;
}

/** 试解析 MCP 声明：失败只记一条诊断，不影响其余校验结论。 */
function probeMcpDeclarations(
  ask: RootValidationAsk,
  loaded: LoadedPlugin,
  pluginId: string,
  diagnostics: PluginDiagnostic[],
): void {
  try {
    const definitions = loadPluginMcpServerDefinitions({ diagnostics, loaded });
    resolvePluginMcpServers({
      dataPath: getPluginDataDir(ask.storageRoot, pluginId),
      definitions,
      diagnostics,
      env: {},
      options: {},
      loaded,
      workingDirectory: process.cwd(),
    });
  } catch (failureCause) {
    diagnostics.push(diagnosticForError(failureCause, pluginId, ask.root));
  }
}

export function validatePluginRoot(
  ask: RootValidationAsk,
): /* 校验产出的诊断列表 */ PluginValidationDiagnostic[] {
  const id = `${ask.entry.name}@${ask.marketplace}`;
  const diagnostics: PluginDiagnostic[] = [];

  let document: PluginDocument | undefined;
  try {
    document = ask.document ?? readPluginDocument(ask.root);
  } catch (readFailure) {
    const message = readFailure instanceof Error ? readFailure.message : String(readFailure);
    return [failure("plugin_manifest_invalid", message, ask.root, id)];
  }

  const resolved =
    document?.manifest ??
    (ask.entry.strict === false ? syntheticPluginManifest(ask.entry) : undefined);
  if (resolved === undefined) {
    return [failure("plugin_manifest_not_found", `Plugin manifest not found: ${id}`, ask.root, id)];
  }

  // 名字不匹配是可继续的失败：记一条硬诊断后仍收集兼容性提示。
  if (resolved.name !== ask.entry.name) {
    diagnostics.push(
      failure(
        "plugin_manifest_invalid",
        `Plugin manifest name does not match ${ask.entry.name}`,
        ask.root,
        id,
      ),
    );
  }
  appendCompatibilityDiagnostics(resolved, id, ask.root, diagnostics);
  probeMcpDeclarations(
    ask,
    loadedForRoot(ask.root, ask.marketplace, resolved, document?.path),
    id,
    diagnostics,
  );
  return diagnostics;
}
