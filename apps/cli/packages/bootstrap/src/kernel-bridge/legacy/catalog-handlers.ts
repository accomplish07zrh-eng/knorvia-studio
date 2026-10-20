// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：workspace 快照、插件引用解析、插件启停、Hook 信任。
//
// 与 domain-handlers 分开的理由：这四件事各有独立事实源（workspace 快照、官方目录信任、
// 配置文件写入、Hook 信任存储），混在一个文件会超过单文件 400 行上限，也会让
// 「哪条方法读了什么」变得难追。

import { BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES } from "@knorvia/shared";
import { setKnorviaPluginEnabled } from "../../plugins.js";
import { listBuiltinSlashCommands } from "./workspace.js";
import { parseParams, type ParsedParams } from "./parse.js";
import { LEGACY_ERROR_CODES, protocolError, result as ok } from "./errors.js";
import type { LegacyMethodOutcome } from "./types.js";
import type { LegacyRouterDeps } from "./router-deps.js";
import type { WorkspaceRef } from "./contracts.js";

interface WorkspaceParams {
  readonly workspace: WorkspaceRef;
}

interface SetEnabledParams extends WorkspaceParams {
  readonly pluginId: string;
  readonly enabled: boolean;
  readonly scope?: "user" | "workspace";
  readonly operationId: string;
}

interface ResolveSuggestedParams extends WorkspaceParams {
  readonly stableId: string;
  readonly operationId: string;
}

interface HookTrustParams extends WorkspaceParams {
  readonly bundleDigest: string;
  readonly hookDeclarationDigest: string;
}

/**
 * `workspace/readPresentation` 的实现。
 *
 * 用 hooks 对象导出而不导出裸函数，是为了让 router 的 switch 保持一行一句，
 * 同时不把 16 个方法的实现全塞进 router.ts（单文件行数上限）。
 */
export const presentationHooks = {
  buildPresentationUnchecked(params: unknown): LegacyMethodOutcome {
    const parsed: ParsedParams<WorkspaceParams> = parseParams<WorkspaceParams>(
      "workspace/readPresentation",
      params,
    );
    if (!parsed.ok) return parsed.outcome;
    return ok({
      workspace: parsed.value.workspace,
      mode: "build" as const,
      slashCommands: listBuiltinSlashCommands(BUILTIN_KNORVIA_SLASH_COMMAND_HELP_ENTRIES),
    });
  },
};

/**
 * `plugins/setEnabled`。
 *
 * 启用态写入配置文件（`setKnorviaPluginEnabled` 的真实落盘路径）。插件不存在时
 * 领域层抛错 → 既有 -32603 折叠（与默认引擎实测一致，D2）。
 */
export async function setPluginEnabled(
  deps: LegacyRouterDeps,
  params: unknown,
): Promise<LegacyMethodOutcome> {
  const parsed = parseParams<SetEnabledParams>("plugins/setEnabled", params);
  if (!parsed.ok) return parsed.outcome;
  try {
    const outcome = await setKnorviaPluginEnabled({
      enabled: parsed.value.enabled,
      plugin: parsed.value.pluginId,
      workingDirectory: parsed.value.workspace.workspacePath,
      ...(parsed.value.scope !== undefined ? { scope: parsed.value.scope } : {}),
      ...(deps.domainLogger !== undefined ? { logger: deps.domainLogger } : {}),
    });
    return ok({
      plugin: {
        id: outcome.plugin.id,
        name: outcome.plugin.name,
        enabled: outcome.plugin.enabled,
        source: outcome.plugin.source,
        marketplace: outcome.plugin.marketplace,
        skillRootCount: outcome.plugin.skillRootCount,
        commandRootCount: outcome.plugin.commandRootCount,
        mcpServerNames: outcome.plugin.mcpServerNames,
        declaredMcpServerNames: outcome.plugin.declaredMcpServerNames,
        hookDetails: outcome.plugin.hookDetails,
        rootPath: outcome.plugin.rootPath,
        enabledSource: parsed.value.scope ?? "user",
      },
      enabled: outcome.enabled,
    });
  } catch (error) {
    return protocolError(-32603, error instanceof Error ? error.message : String(error));
  }
}

/**
 * `plugins/resolveSuggestedReference`。
 *
 * 只认官方 `knorvia-plugins-bundled` 来源（fail closed）。刷新官方目录需要网络，
 * 归 `kernel-plugin-*`；离线时按既有诊断返回 unavailable，与默认引擎在非官方 id 上的
 * 行为一致，不谎称可安装。
 */
export function resolveSuggestedReference(
  deps: LegacyRouterDeps,
  params: unknown,
): LegacyMethodOutcome {
  const parsed = parseParams<ResolveSuggestedParams>("plugins/resolveSuggestedReference", params);
  if (!parsed.ok) return parsed.outcome;
  const stableId = parsed.value.stableId.trim();
  const at = stableId.lastIndexOf("@");
  const pluginName = at > 0 ? stableId.slice(0, at) : "";
  const marketplace = at > 0 ? stableId.slice(at + 1) : "";
  const officialMarketplace = "knorvia-plugins-bundled";
  const validShape = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(stableId);
  if (!pluginName || marketplace !== officialMarketplace || !validShape) {
    deps.logger?.debug("kernel.bridge.legacy.suggested-reference.untrusted", { stableId });
    return ok({
      stableId,
      status: "unavailable" as const,
      diagnostics: [
        {
          code: "plugin_suggested_reference_untrusted_source",
          message: "推荐插件不是受信任的官方 knorvia-plugins-bundled 来源",
          severity: "error" as const,
          pluginId: stableId,
        },
      ],
    });
  }
  // 官方来源但本进程无法刷新目录：按 unavailable 返回，交由后续包的目录事实补齐。
  return ok({
    stableId,
    status: "unavailable" as const,
    pluginName,
    marketplace,
    sourceTrust: "official" as const,
    diagnostics: [
      {
        code: "marketplace_refresh_failed",
        message: "Official plugin catalog is not available offline",
        severity: "error" as const,
        pluginId: stableId,
      },
    ],
  });
}

/**
 * `workspace/hooks/trustGrant`。
 *
 * Hook 信任存储归 `kernel-plugin-hooks`（规格「旧数据」：工作区 Hook 信任存储随
 * Knorvia Hook 插件保留）。本包只冻结协议边界：在插件落地前 trust store 不可读 →
 * 回既有 reasonCode `workspace_hooks_config_unreadable`（与默认引擎在空白工作区的实测值一致）。
 */
export function grantWorkspaceHookTrust(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<HookTrustParams>("workspace/hooks/trustGrant", params);
  if (!parsed.ok) return parsed.outcome;
  return ok({ accepted: false, reasonCode: "workspace_hooks_config_unreadable" });
}

/** 未实现能力的统一拒绝（既有 -32603 折叠；不用 -32031，那是端口缺席专用）。 */
export function unimplementedCapability(method: string): LegacyMethodOutcome {
  return protocolError(-32603, `${method} is not available on this engine yet`, {
    reasonCode: "unsupported",
  });
}

void LEGACY_ERROR_CODES;
