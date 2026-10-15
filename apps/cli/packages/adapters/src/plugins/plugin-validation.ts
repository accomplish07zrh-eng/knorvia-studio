// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

export function diagnosticForError(
  /* 被包装的原始异常 */ error: unknown,
  /* 归属插件 */ pluginId?: string,
  /* 相关文件路径 */ path?: string,
): PluginValidationDiagnostic {
  /* 诊断对象：错误码优先取来源分类，其次取目录错误的专用码 */
  return {
    code:
      getPluginSourceDiagnosticCode(error) ??
      (error instanceof CatalogOperationError
        ? error.diagnosticCode
        : "plugin_marketplace_invalid"),
    message: /* 保留原始错误文本，不改写 */ error instanceof Error ? error.message : String(error),
    severity: /* 硬失败 */ "error",
    ...(pluginId !== undefined ? { pluginId } : {}),
    ...(path !== undefined ? { path } : {}),
  };
}

function hasUnsupportedBundle(value: unknown): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<unknown[]>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string" && (item.endsWith(".mcpb") || item.endsWith(".dxt"))) return true;
    if (Array.isArray(item) && !visited.has(item)) {
      visited.add(item);
      for (const nested of item) pending.push(nested);
    }
  }
  return /* 遍历完没有发现捆绑包引用 */ false;
}

export function appendCompatibilityDiagnostics(
  /* 清单（原文或合成） */ manifest: Record<string, unknown> | PluginManifest,
  /* 归属插件 */ pluginId: string,
  /* 定位路径 */ path: string | undefined,
  /* 逐条累积的诊断 */ diagnostics: PluginValidationDiagnostic[],
): void {
  const add = (code: PluginValidationDiagnostic["code"], message: string) =>
    /* 统一补上归属后追加 */
    diagnostics.push({
      code,
      message,
      severity: /* 非阻断警告 */ "warning",
      pluginId: /* 透传归属 */ pluginId,
      ...(path !== undefined ? { path } : {}),
    });
  for (const key of ["channels", "lspServers", "outputStyles", "settings"]) {
    if (key in manifest)
      add("plugin_unsupported_component", `Plugin component ${key} is diagnostic-only`);
  }
  if (isRecord(manifest.userConfig)) {
    for (const [name, option] of Object.entries(manifest.userConfig)) {
      if (isRecord(option) && option.required === true && option.default === undefined) {
        add("plugin_variable_missing", `Plugin configuration ${name} requires a value`);
      }
    }
  }
  if (hasUnsupportedBundle(manifest.mcpServers))
    add(
      "plugin_marketplace_source_unsupported",
      "MCP bundle sources (.mcpb/.dxt) are not supported",
    );
}

export function loadedForRoot(
  /* 插件根目录 */ pluginRoot: string,
  /* 所属市场 */ market: string,
  /* 规范化清单 */ manifest: PluginManifest,
  manifestPath?: string,
): LoadedPlugin {
  /* 组装可装载上下文 */
  return {
    id: `${manifest.name}@${market}`,
    marketplace: market,
    rootPath: pluginRoot,
    manifest,
    manifestPath: manifestPath ?? join(pluginRoot, ".claude-plugin", "plugin.json"),
    source: isOfficialMarketplaceId(market) ? "official" : "cache",
  };
}

export function validatePluginRoot(input: {
  /* 插件根目录 */ root: string;
  /* 所属市场 */ marketplace: string;
  /* 目录条目 */ entry: PluginMarketplaceEntry;
  /* 插件数据根 */ storageRoot: string;
  /* 已读到的清单文档 */ document?: PluginDocument;
}): /* 校验产出的诊断列表 */ PluginValidationDiagnostic[] {
  const id = `${input.entry.name}@${input.marketplace}`;
  const diagnostics: PluginDiagnostic[] = [];
  let document: PluginDocument | undefined;
  try {
    document = input.document ?? readPluginDocument(input.root);
  } catch (failure) {
    /* 清单读不出来直接判定为无效 */
    return [
      {
        code: /* 清单不可解析 */ "plugin_manifest_invalid",
        severity: /* 硬失败 */ "error",
        message:
          /* 保留原始错误文本 */ failure instanceof Error ? failure.message : String(failure),
        path: /* 定位到插件根 */ input.root,
        pluginId: id,
      },
    ];
  }
  const resolved =
    document?.manifest ??
    (input.entry.strict === false ? syntheticPluginManifest(input.entry) : undefined);
  if (!resolved)
    /* 宽松模式之外读不到清单即失败 */
    return [
      {
        code: /* 清单缺失 */ "plugin_manifest_not_found",
        severity: /* 硬失败 */ "error",
        message: `Plugin manifest not found: ${id}`,
        path: input.root,
        pluginId: id,
      },
    ];
  if (resolved.name !== input.entry.name)
    diagnostics.push({
      code: /* 清单名不匹配 */ "plugin_manifest_invalid",
      severity: /* 硬失败 */ "error",
      message: `Plugin manifest name does not match ${input.entry.name}`,
      path: input.root,
      pluginId: id,
    });
  appendCompatibilityDiagnostics(resolved, id, input.root, diagnostics);
  const loaded = loadedForRoot(input.root, input.marketplace, resolved, document?.path);
  try {
    const definitions = loadPluginMcpServerDefinitions({ diagnostics, loaded });
    resolvePluginMcpServers({
      dataPath: getPluginDataDir(input.storageRoot, id),
      definitions,
      diagnostics,
      env: {},
      options: {},
      loaded,
      workingDirectory: process.cwd(),
    });
  } catch (failure) {
    diagnostics.push(diagnosticForError(failure, id, input.root));
  }
  return diagnostics;
}
