// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：目录类与账户类方法（plugins / skills / mcp / workflows / usage / provider）。
//
// 事实源全部是既有领域模块（`bootstrap/src/plugins.ts`、`skills.ts`，
// `@knorvia/shared/saved-workflows` 的已保存工作流 codec）。它们不随 kernel-switch 删除
// （规格「现有包的去向」只删旧运行时端口），因此这里直接调用；
// 本文件只做「协议参数 → 领域调用 → 协议结果」转换。
//
// 2026-10-23 kernel-switch 前置：已保存工作流的 6 个符号原先从 `@knorvia/core` 导入。
// 但本文件在**新引擎路径上**（`kernel/process.ts` 动态 import `kernel-bridge/entry.js`），
// 而新引擎路径必须零 `@knorvia/core` 依赖，否则「删 core」会打断新引擎。
// 那些实现只依赖 node:fs / node:path / yaml / @knorvia/contracts / @knorvia/shared/node，
// 零 core 内部依赖，所以整体提到 `@knorvia/shared/saved-workflows`，这里改指新位置。

import { rm, writeFile } from "node:fs/promises";
import {
  buildPluginReferenceCatalog,
  listSavedWorkflows,
  moveSavedWorkflow,
  resolveSavedWorkflow,
  savedWorkflowRoot,
  serializeSavedWorkflow,
} from "../saved-workflows/index.js";
import { resolveKnorviaPlugins } from "../../plugins.js";
import { listKnorviaSkills } from "../../skills.js";
import { getPluginOverview, listPluginCatalog, toProtocolDiagnostic } from "./plugin-catalog.js";
import { parseParams } from "./parse.js";
import { LEGACY_ERROR_CODES, protocolError, result as ok } from "./errors.js";
import type { LegacyMethodOutcome } from "./types.js";
import type { LegacyRouterDeps } from "./router-deps.js";
import type { SavedWorkflowScope } from "./contracts.js";

/** 目录类方法的公共入参（workspace 引用）。 */
interface WorkspaceParams {
  readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
}

/** 领域错误折叠为既有 -32603（D2）：Host 侧已按该码适配，不得细化为新码。 */
function domainError(error: unknown): LegacyMethodOutcome {
  return protocolError(-32603, error instanceof Error ? error.message : String(error));
}

/** `plugins/list`：目录发现 + 诊断。 */
export function listPlugins(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { configScope?: "user" | "workspace" }>(
    "plugins/list",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  // B13 触发点：插件目录刷新是长操作，起止各发一条进度（operationId 由工作区派生）。
  const operationId = `plugin-catalog:${parsed.value.workspace.workspaceKey}`;
  try {
    deps.notify?.pluginOperationProgress(operationId, "running");
    const catalog = listPluginCatalog({
      workingDirectory: parsed.value.workspace.workspacePath,
      ...(deps.domainLogger !== undefined ? { logger: deps.domainLogger } : {}),
    });
    deps.notify?.pluginOperationProgress(operationId, "done");
    return ok(catalog);
  } catch (error) {
    deps.notify?.pluginOperationProgress(operationId, "failed");
    return domainError(error);
  }
}

/** `plugins/overview`：市场 / 可安装 / 已安装 / 可恢复内置。 */
export function pluginOverview(deps: LegacyRouterDeps, params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { configScope?: "user" | "workspace" }>(
    "plugins/overview",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  try {
    return ok(
      getPluginOverview({
        workingDirectory: parsed.value.workspace.workspacePath,
        ...(deps.domainLogger !== undefined ? { logger: deps.domainLogger } : {}),
      }),
    );
  } catch (error) {
    return domainError(error);
  }
}

/** `plugins/referenceCatalog` 与 `plugins/referenceCatalogWithCategory`。 */
export function pluginReferenceCatalog(
  deps: LegacyRouterDeps,
  params: unknown,
  includeCategory: boolean,
): LegacyMethodOutcome {
  const method = includeCategory
    ? "plugins/referenceCatalogWithCategory"
    : "plugins/referenceCatalog";
  const parsed = parseParams<WorkspaceParams & { sessionId?: string }>(method, params);
  if (!parsed.ok) return parsed.outcome;
  try {
    if (parsed.value.sessionId !== undefined) {
      // session-owned catalog：会话不存在按协议错误 fail closed，禁止静默回退 workspace 权威。
      const record = deps.sessions.get(parsed.value.sessionId);
      if (record === undefined) {
        return protocolError(
          LEGACY_ERROR_CODES.sessionNotActive,
          `Session is not active: ${parsed.value.sessionId}`,
        );
      }
      return ok({ authority: "session", plugins: [] });
    }
    const outcome = resolveKnorviaPlugins({
      workingDirectory: parsed.value.workspace.workspacePath,
      ...(deps.domainLogger !== undefined ? { logger: deps.domainLogger } : {}),
    });
    const catalog = buildPluginReferenceCatalog(outcome.plugins);
    return ok({
      authority: "workspace",
      plugins: catalog.plugins.map((entry) => ({
        ...(includeCategory ? { category: "other" } : {}),
        pluginId: entry.pluginId,
        name: entry.name,
        marketplace: entry.marketplace,
        enabled: entry.enabled,
        conflictingPluginIds: [...entry.conflictingPluginIds],
        skillQualifiedNames: [...entry.skillQualifiedNames],
        mcpServerNames: [...entry.mcpServerNames],
        subagentNames: [...entry.subagentNames],
      })),
    });
  } catch (error) {
    return domainError(error);
  }
}

/** `skills/referenceCatalog`：技能发现走既有 skills 引擎。 */
export async function skillReferenceCatalog(
  deps: LegacyRouterDeps,
  params: unknown,
): Promise<LegacyMethodOutcome> {
  const parsed = parseParams<WorkspaceParams & { sessionId?: string }>(
    "skills/referenceCatalog",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  try {
    const outcome = await listKnorviaSkills({
      workingDirectory: parsed.value.workspace.workspacePath,
      ...(deps.domainLogger !== undefined ? { logger: deps.domainLogger } : {}),
    });
    return ok({
      authority: "workspace",
      skills: outcome.skills.map((skill) => ({
        id: skill.qualifiedName ?? skill.name,
        name: skill.name,
        ...(skill.description !== undefined ? { description: skill.description } : {}),
      })),
      diagnostics: outcome.diagnostics.map(toProtocolDiagnostic),
    });
  } catch (error) {
    return domainError(error);
  }
}

/**
 * `mcp/list`：dsh 引擎不托管 MCP 连接（MCP 客户端归 kernel-dsh-builtins），
 * 因此返回空状态表。形状与默认引擎一致（`{ statuses: {} }`）。
 */
export function listMcpServers(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { mode?: "connect" | "status" }>("mcp/list", params);
  if (!parsed.ok) return parsed.outcome;
  return ok({ statuses: {} });
}

function scopeOf(scope: SavedWorkflowScope | undefined): SavedWorkflowScope {
  return scope ?? "project";
}

/** `workflows/list`。 */
export function listWorkflows(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { scope?: SavedWorkflowScope }>(
    "workflows/list",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  const scope = scopeOf(parsed.value.scope);
  const cwd = parsed.value.workspace.workspacePath;
  const listed = listSavedWorkflows({ cwd, scope });
  return ok({
    workflows: listed.entries,
    invalid: listed.invalid,
    dir: savedWorkflowRoot(cwd, scope).dir,
  });
}

/** `workflows/get`。 */
export function getWorkflow(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { name: string; scope?: SavedWorkflowScope }>(
    "workflows/get",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  const resolved = resolveSavedWorkflow({
    cwd: parsed.value.workspace.workspacePath,
    name: parsed.value.name,
    scope: scopeOf(parsed.value.scope),
  });
  if (!resolved.ok) return ok(failureOf(resolved));
  return ok({
    ok: true,
    name: resolved.name,
    path: resolved.path,
    scope: resolved.scope,
    meta: resolved.meta,
    script: resolved.script,
  });
}

/** `workflows/delete`：按 scope 选根删除。 */
export async function deleteWorkflow(
  deps: LegacyRouterDeps,
  params: unknown,
): Promise<LegacyMethodOutcome> {
  const parsed = parseParams<WorkspaceParams & { name: string; scope?: SavedWorkflowScope }>(
    "workflows/delete",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  const cwd = parsed.value.workspace.workspacePath;
  const resolved = resolveSavedWorkflow({
    cwd,
    name: parsed.value.name,
    scope: scopeOf(parsed.value.scope),
  });
  if (!resolved.ok) return ok(failureOf(resolved));
  try {
    await rm(resolved.path, { force: true });
    deps.logger?.info("kernel.bridge.legacy.workflow.deleted", { name: resolved.name });
    return ok({ ok: true, path: resolved.path });
  } catch (error) {
    return ok({ ok: false, reason: "write_error", detail: String(error) });
  }
}

/** `workflows/move`：全局档 → 项目根，只此一向。 */
export function moveWorkflow(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { name: string }>("workflows/move", params);
  if (!parsed.ok) return parsed.outcome;
  const moved = moveSavedWorkflow({
    cwd: parsed.value.workspace.workspacePath,
    name: parsed.value.name,
  });
  if (moved.ok) return ok({ ok: true, from: moved.from, to: moved.to });
  return ok({
    ok: false,
    reason: moved.reason,
    ...(moved.reason === "invalid_name" ? { detail: moved.detail } : {}),
    ...(moved.reason === "target_exists" ? { path: moved.path } : {}),
    ...(moved.reason === "read_error" || moved.reason === "write_error"
      ? { path: moved.path, detail: moved.detail }
      : {}),
  });
}

/** `workflows/updateMeta`：读回正文，整文件覆写为 `serialize(newMeta, script)`。 */
export async function updateWorkflowMeta(
  deps: LegacyRouterDeps,
  params: unknown,
): Promise<LegacyMethodOutcome> {
  const parsed = parseParams<
    WorkspaceParams & { name: string; scope?: SavedWorkflowScope; meta: unknown }
  >("workflows/updateMeta", params);
  if (!parsed.ok) return parsed.outcome;
  const cwd = parsed.value.workspace.workspacePath;
  const resolved = resolveSavedWorkflow({
    cwd,
    name: parsed.value.name,
    scope: scopeOf(parsed.value.scope),
  });
  if (!resolved.ok) return ok(failureOf(resolved));
  try {
    // meta 已由协议 schema 校验；codec 认的是共享类型，这里按输出形状直接序列化。
    const serialized = serializeSavedWorkflow(
      parsed.value.meta as Parameters<typeof serializeSavedWorkflow>[0],
      resolved.script,
    );
    await writeFile(resolved.path, serialized, "utf8");
    deps.logger?.info("kernel.bridge.legacy.workflow.meta.updated", { name: resolved.name });
    return ok({ ok: true, path: resolved.path });
  } catch (error) {
    return ok({ ok: false, reason: "write_error", detail: String(error) });
  }
}

/**
 * `workflows/runs`：运行历史。
 *
 * 运行日志（dwf-journal）归动态工作流包；dsh 引擎下没有旧 journal store，
 * 返回空列表——形状与「本项目还没有 run」一致，不是能力缺席。
 */
export function listWorkflowRuns(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<WorkspaceParams & { limit: number; name?: string }>(
    "workflows/runs",
    params,
  );
  if (!parsed.ok) return parsed.outcome;
  return ok({ runs: [] });
}

/** 解析失败 → 协议失败结果（`ok:false` + 既有 reason 词表）。 */
function failureOf(failure: {
  readonly reason: string;
  readonly detail?: string;
  readonly path?: string;
}) {
  return {
    ok: false as const,
    reason: failure.reason,
    ...(failure.path !== undefined ? { path: failure.path } : {}),
    ...(failure.detail !== undefined ? { detail: failure.detail } : {}),
  };
}

/**
 * `usage/stats`：用量统计。
 *
 * dsh 引擎不写旧 `<数据根>/cli/db/db.sqlite`（D1），用量库因此没有数据源。
 * 返回**零值快照**而不是错误：形状与「本地还没有用量记录」一致，Host 侧照常渲染。
 */
export function usageStats(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<{ range: string; timeZone?: string }>("usage/stats", params);
  if (!parsed.ok) return parsed.outcome;
  const now = Date.now();
  const day = 86_400_000;
  const days = parsed.value.range === "today" ? 1 : parsed.value.range === "30d" ? 30 : 7;
  const today = Math.floor(now / day) * day;
  const startMs = today - (days - 1) * day;
  const cells = Array.from({ length: days }, (_unused, index) => ({
    date: new Date(startMs + index * day).toISOString().slice(0, 10),
    level: 0 as const,
    totalTokens: 0,
    turnCount: 0,
    toolCallCount: 0,
  }));
  return ok({
    range: parsed.value.range,
    generatedAt: now,
    timeZone: parsed.value.timeZone ?? "UTC",
    source: "agent-db" as const,
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 0,
      totalTurns: 0,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 0,
      currentStreakDays: 0,
      longestSessionMs: 0,
      longestStreakDays: 0,
      peakDayTokens: 0,
      favoriteModel: null,
    },
    heatmap: {
      startDate: cells[0]?.date ?? null,
      endDate: cells.at(-1)?.date ?? null,
      maxTokens: 0,
      weeks: [{ weekIndex: 0, days: cells }],
    },
    dailyModelUsage: cells.map((cell) => ({ date: cell.date, models: [] })),
    models: [],
    tools: [],
  });
}

/**
 * `provider/updateAccountConfig`：账户 Provider 配置。
 *
 * dsh 引擎下供应商表由 Knorvia 供应商配置生成（归 `kernel-plugin-credentials`），
 * 本包只冻结协议边界：确认收到 revision，不谎称已生效。
 */
export function updateAccountConfig(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<{
    revision: string;
    providers: Record<string, unknown>;
  }>("provider/updateAccountConfig", params);
  if (!parsed.ok) return parsed.outcome;
  return ok({
    receivedRevision: parsed.value.revision,
    providerCount: Object.keys(parsed.value.providers).length,
    status: "received" as const,
  });
}

/**
 * `workspace/cancelGenerateText`：取消一次 workspace 文本生成。
 *
 * 生成能力归模型适配（`kernel-plugin-credentials` / `kernel-switch`）；没有该 operation
 * 在跑时按既有语义回 `cancelled: false`，与默认引擎一致。
 */
export function cancelGenerateText(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<{ operationId: string }>("workspace/cancelGenerateText", params);
  if (!parsed.ok) return parsed.outcome;
  return ok({ operationId: parsed.value.operationId, cancelled: false });
}

/**
 * `plugins/cancelOperation`：取消插件长操作。
 *
 * 旧引擎在没有该 operation 时回 `cancelled: false`。新引擎的插件操作同步执行、
 * 不登记 controller，因此同样恒为 false——这是等价行为，不是丢功能。
 */
export function cancelPluginOperation(params: unknown): LegacyMethodOutcome {
  const parsed = parseParams<{ operationId: string }>("plugins/cancelOperation", params);
  if (!parsed.ok) return parsed.outcome;
  return ok({ operationId: parsed.value.operationId, cancelled: false });
}
