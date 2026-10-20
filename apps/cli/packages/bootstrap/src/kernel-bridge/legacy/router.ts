// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：legacy 路由器（合同的中心入口）。
//
// 冻结签名见 interface.md §四：
//   routeLegacyMethod(context, method, params, trace?) => Promise<LegacyMethodOutcome | undefined>
//
// 职责边界（Lead 2026-10-20 裁决）：
//   1. 只回答「是不是本包应答的旧协议方法」与「怎么应答」；
//   2. 非回合方法分派给各域处理器；
//   3. 回合类方法转执行端口（kernel-bridge-02/03 注册），未注册按 B10 返回 capability 缺席；
//   4. Host 方向方法（14 个）与借名通知返回 undefined，由调用方回 -32601（B8/L4）。
//
// 不 import 任何 kernel-bridge-02/03 模块（依赖方向固定为 02/03 → 本包）。

import type { Context } from "@deepseek-ai/cordis";
import { currentLegacyExecutionPort, legacyBridgeFor } from "./types.js";
import type { LegacyMethodOutcome } from "./types.js";
import {
  capabilityAbsent,
  JSONRPC_INTERNAL_ERROR,
  protocolError,
  result as ok,
  sessionNotActive,
} from "./errors.js";
import { PORT_BACKED_METHODS, isClientMethod, isLegacyMethodName } from "./method-table.js";
import { parseParams } from "./parse.js";
import type { LegacyRouterDeps } from "./router-deps.js";
import {
  grantWorkspaceHookTrust,
  presentationHooks,
  resolveSuggestedReference,
  setPluginEnabled,
} from "./catalog-handlers.js";
import {
  cancelGenerateText,
  cancelPluginOperation,
  deleteWorkflow,
  getWorkflow,
  listMcpServers,
  listPlugins,
  listWorkflowRuns,
  listWorkflows,
  moveWorkflow,
  pluginOverview,
  pluginReferenceCatalog,
  skillReferenceCatalog,
  updateAccountConfig,
  updateWorkflowMeta,
  usageStats,
} from "./domain-handlers.js";
import {
  createSession,
  listSessions,
  listSubagents,
  readEvents,
  readMessages,
  readSession,
  readSessionDebug,
  readSessionUsage,
  subscribeSession,
  updateDynamicWorkflowPolicy,
  updateInteractionPreferences,
  updateModelIoPreferences,
  updateOffPeakToolPolicy,
} from "./session-handlers.js";

/**
 * 旧协议路由入口（合同冻结签名）。
 *
 * @returns `undefined` = 不是本包应答的旧协议方法（调用方继续原逻辑 → -32601）。
 */
export async function routeLegacyMethod(
  context: Context,
  method: string,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome | undefined> {
  const bridge = legacyBridgeFor(context);
  if (bridge === undefined) return undefined;
  return await routeWithDeps(bridge.deps, method, params, trace);
}

/**
 * 带依赖集合的路由实现（桥实例与测试复用；合同的冻结签名指向上面那个）。
 *
 * 分成两层的原因：合同签名只带 `context`（entry.ts 只有 context），而路由器需要
 * 会话登记表等状态——状态挂在桥实例上，由 `legacyBridgeFor(context)` 取回。
 * 这一层让测试可以不经 context 直接驱动路由器。
 */
export async function routeWithDeps(
  deps: LegacyRouterDeps,
  method: string,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome | undefined> {
  // 不是旧协议方法名 → 交给调用方的原逻辑（真正的未知方法仍回 -32601）。
  if (!isLegacyMethodName(method)) return undefined;
  // 是旧协议方法名但方向为 CLI→Host（含借名通知）：对客户端仍是未知方法（B8/L4）。
  if (!isClientMethod(method)) return undefined;

  if (PORT_BACKED_METHODS.has(method)) {
    return await routeToExecutionPort(deps, method, params, trace);
  }

  try {
    return await dispatch(deps, method, params, trace);
  } catch (error) {
    // 分派表与方法表不同步等编码错误：折叠为既有 -32603，不静默放行。
    deps.logger?.error("kernel.bridge.legacy.method.failed", {
      method,
      error: error instanceof Error ? error.message : String(error),
    });
    return protocolError(
      JSONRPC_INTERNAL_ERROR,
      error instanceof Error ? error.message : `Method failed: ${method}`,
    );
  }
}

/**
 * 回合类方法：先做协议边界的两件事（参数校验、会话存在性），再转执行端口。
 *
 * 为什么要先查会话：默认引擎实测（B5 固定脚本）对**不存在的会话**一律回 -32004，
 * 而不是能力错误。若这里直接回 -32031，就把「会话不存在」误报成「引擎不支持」——
 * 那是给 Host 的错误信号（它会以为该功能永久缺失）。因此顺序固定为：
 *   参数非法 → -32602；会话不存在 → -32004；端口未注册 → -32031；否则交端口。
 */
async function routeToExecutionPort(
  deps: LegacyRouterDeps,
  method: string,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome> {
  // 参数校验：端口方法的参数 schema 同样由共享表提供（interface.md §六.1）。
  const parsed = parseParams<unknown>(method, params);
  if (!parsed.ok) return parsed.outcome;

  // 会话存在性先于端口检查：不存在 → -32004（两引擎一致，B5 的 outcome=error 分支）。
  const sessionId = sessionIdOf(parsed.value);
  if (sessionId !== undefined && deps.sessions.get(sessionId) === undefined) {
    return sessionNotActive(sessionId);
  }

  const port = currentLegacyExecutionPort();
  if (port === undefined) return capabilityAbsent(method);
  try {
    return await port.execute({
      method,
      params: parsed.value,
      ...(trace !== undefined ? { trace } : {}),
    });
  } catch (error) {
    // 端口抛错 = 内部失败：折叠为既有 -32603（interface.md §四）。
    return protocolError(
      JSONRPC_INTERNAL_ERROR,
      error instanceof Error ? error.message : `Method failed: ${method}`,
    );
  }
}

/** 从已校验的参数里取 sessionId（这 12 个方法的参数都带它）。 */
function sessionIdOf(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const value = (params as { sessionId?: unknown }).sessionId;
  return typeof value === "string" ? value : undefined;
}

/** 插件安装/市场写操作需要官方目录与网络：归 kernel-plugin-* 与后续包。 */
const MARKETPLACE_METHODS: ReadonlySet<string> = new Set([
  "plugins/uninstall",
  "plugins/update",
  "plugins/restoreBuiltin",
  "plugins/configure",
  "plugins/resetConfig",
  "plugins/validate",
  "plugins/describe",
  "plugins/marketplace/add",
  "plugins/marketplace/remove",
  "plugins/marketplace/update",
  "plugins/install",
]);

/** 非回合方法分派。 */
async function dispatch(
  deps: LegacyRouterDeps,
  method: string,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome> {
  switch (method) {
    // ── 能力与进程 ─────────────────────────────────────────────
    case "runtime/capabilities":
      // 旧运行时固定声明支持独立计划状态（默认引擎实测恒为 true）。
      return ok({ independentPlanState: true });

    case "process/childProcesses":
      // dsh 引擎不托管 MCP 子进程（MCP 客户端归 kernel-dsh-builtins）→ 空进程表。
      return ok({ processes: [] });

    // ── workspace 只读与策略 ───────────────────────────────────
    case "workspace/readPresentation":
      return presentationHooks.buildPresentationUnchecked(params);

    case "workspace/updateInteractionPreferences":
      return updateInteractionPreferences(deps, params);

    case "workspace/updateModelIoPreferences":
      return updateModelIoPreferences(deps, params);

    case "workspace/updateOffPeakToolPolicy":
      return updateOffPeakToolPolicy(deps, params);

    case "workspace/updateDynamicWorkflowPolicy":
      return updateDynamicWorkflowPolicy(deps, params);

    case "workspace/cancelGenerateText":
      return cancelGenerateText(params);

    case "workspace/hooks/trustGrant":
      return grantWorkspaceHookTrust(params);

    case "workspace/generateText":
      // 需要真实模型与凭据：离线只冻结协议边界（验收文档「未覆盖」列明归 kernel-switch）。
      return protocolError(
        JSONRPC_INTERNAL_ERROR,
        "workspace/generateText requires a configured model provider",
      );

    // ── 会话 ─────────────────────────────────────────────────
    case "session/create":
      return await createSession(deps, params, trace);

    case "session/list":
      return listSessions(deps, params);

    case "session/read":
      return readSession(deps, params);

    case "session/messages":
      return readMessages(deps, params);

    case "session/events":
      return readEvents(deps, params);

    case "session/debug":
      return readSessionDebug(deps, params);

    case "session/usage":
      return readSessionUsage(deps, params);

    case "session/subagents":
      return listSubagents(deps, params);

    case "session/subscribe":
      return subscribeSession(deps, params);

    // ── 目录类 ───────────────────────────────────────────────
    case "mcp/list":
      return listMcpServers(params);

    case "plugins/list":
      return listPlugins(deps, params);

    case "plugins/overview":
      return pluginOverview(deps, params);

    case "plugins/referenceCatalog":
      return pluginReferenceCatalog(deps, params, false);

    case "plugins/referenceCatalogWithCategory":
      return pluginReferenceCatalog(deps, params, true);

    case "skills/referenceCatalog":
      return await skillReferenceCatalog(deps, params);

    case "plugins/cancelOperation":
      return cancelPluginOperation(params);

    case "plugins/resolveSuggestedReference":
      return resolveSuggestedReference(deps, params);

    case "plugins/setEnabled":
      return await setPluginEnabled(deps, params);

    // ── 工作流 ───────────────────────────────────────────────
    case "workflows/list":
      return listWorkflows(params);

    case "workflows/get":
      return getWorkflow(params);

    case "workflows/delete":
      return await deleteWorkflow(deps, params);

    case "workflows/move":
      return moveWorkflow(params);

    case "workflows/updateMeta":
      return await updateWorkflowMeta(deps, params);

    case "workflows/runs":
      return listWorkflowRuns(params);

    // ── 账户与用量 ────────────────────────────────────────────
    case "provider/updateAccountConfig":
      return updateAccountConfig(params);

    case "provider/testModelConnectivity":
      return protocolError(
        JSONRPC_INTERNAL_ERROR,
        "Provider Registry 中不存在 Provider: provider/testModelConnectivity requires the credentials plugin",
      );

    case "usage/stats":
      return usageStats(params);

    default:
      if (MARKETPLACE_METHODS.has(method)) {
        return protocolError(
          JSONRPC_INTERNAL_ERROR,
          `${method} requires the plugin marketplace runtime`,
        );
      }
      // 方法表与分派表不同步是编码错误：抛出让上层折叠为 -32603。
      throw new Error(`kernel-bridge-legacy: no handler for ${method}`);
  }
}
