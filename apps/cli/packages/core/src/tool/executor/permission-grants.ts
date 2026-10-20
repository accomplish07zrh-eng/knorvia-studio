// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 权限授权的落盘：Broker 批准后，把「项目级」与「会话级」两档授权分别落地。
//
// 两档语义不同，不能合并处理：
//   - 项目级要写配置，可能失败（失败即返回错误结果，不再继续）；
//   - 会话级只改内存，不会失败。
// 顺序由 GRANT_PHASES 固定；两档各自只在「有更新项」时才执行。
//
// 一个刻意的细节：每档开始时才读它的存在性。项目 await 期间若会话更新被替换，
// 应在下一档生效，而不是沿用进入函数时的快照。
import {
  CoreErrorType,
  createCoreError,
  traceContextToLogContext,
  type PermissionBrokerResult,
  type TraceContext,
} from "@knorvia/contracts";
import type { ExecutableToolCall, ToolEntry, ToolExecutionResult } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { createErrorResult } from "./errors.js";
import { persistProjectPermissionUpdates } from "./permission-rules-persistence.js";

/** 一次授权落盘的全部输入。 */
export interface GrantContext {
  deps: ToolExecutorDeps;
  entry: ToolEntry;
  requestId: string;
  resolvedPermission: PermissionBrokerResult;
  toolCall: ExecutableToolCall;
  traceContext: TraceContext;
}

/**
 * 授权链路的身份三元组。
 * 日志与错误上下文都要带这三项，抽出来避免两处各写一遍、也保证两处永远一致。
 */
const identityOf = (context: GrantContext): Record<string, string> => ({
  requestId: context.requestId,
  toolCallId: context.toolCall.id,
  toolName: context.toolCall.name,
});

/** 会话级授权的落盘：只改内存，附一条日志。 */
function applySessionPhase(context: GrantContext): void {
  const { deps, resolvedPermission, traceContext } = context;
  const updates = resolvedPermission.sessionPermissionUpdates ?? [];
  deps.permissionService.grantSessionPermission(updates);
  deps.logger?.info("Session permission granted", {
    ...traceContextToLogContext(traceContext),
    ...identityOf(context),
    event: "tool.permission.session_grant.applied",
    module: "core.tool.executor",
    status: "completed",
    updateCount: updates.length,
  });
}

/** 项目级授权的失败结果：写盘失败要能定位到请求与工具。 */
function projectFailure(context: GrantContext, error: unknown): ToolExecutionResult {
  return createErrorResult(
    context.toolCall,
    createCoreError(CoreErrorType.StorageError, "Failed to persist project permission update", {
      cause: error instanceof Error ? error : undefined,
      context: { ...identityOf(context), sessionId: context.deps.sessionId },
      recoverable: true,
    }),
  );
}

/**
 * 阶段表：每档声明「更新的来源字段」与「怎么执行」。
 * 顺序与既有行为一致：项目档在前（可能失败、且需要 await），会话档在后。
 */
const GRANT_PHASES = [
  {
    destination: "project" as const,
    field: "permissionUpdates" as const,
    run: (context: GrantContext) =>
      persistProjectPermissionUpdates(
        context.deps,
        context.resolvedPermission.permissionUpdates ?? [],
        context.traceContext,
      ),
  },
  {
    destination: "session" as const,
    field: "sessionPermissionUpdates" as const,
    run: (context: GrantContext) => {
      applySessionPhase(context);
      return Promise.resolve();
    },
  },
];

export async function applyResolvedPermissionGrants(
  context: GrantContext,
): Promise<ToolExecutionResult | undefined> {
  // 用户亲自授权时，Broker 的更新项不落盘：那是本次决策，不是可复用的授权。
  if (context.entry.approvalAuthority === "user") return undefined;

  for (const phase of GRANT_PHASES) {
    // 每档实时读取：项目档 await 期间被替换的会话更新应在下一档生效。
    if (!context.resolvedPermission[phase.field]?.length) continue;
    try {
      await phase.run(context);
    } catch (error) {
      // 只有项目档会抛；会话档是纯内存操作。
      return projectFailure(context, error);
    }
  }
  return undefined;
}
