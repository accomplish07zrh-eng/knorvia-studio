// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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

type GrantContext = {
  deps: ToolExecutorDeps;
  toolCall: ExecutableToolCall;
  entry: ToolEntry;
  resolvedPermission: PermissionBrokerResult;
  requestId: string;
  traceContext: TraceContext;
};
const GRANT_PHASES = [
  { destination: "project", field: "permissionUpdates" },
  { destination: "session", field: "sessionPermissionUpdates" },
] as const;

function* selectedPhases(reply: PermissionBrokerResult) {
  for (const phase of GRANT_PHASES) {
    // 每一阶段开始时才读取存在性；项目 await 期间替换的会话更新应在下一阶段生效。
    if (reply[phase.field]?.length) yield phase;
  }
}

function projectFailure(
  { deps, toolCall, requestId }: GrantContext,
  error: unknown,
): ToolExecutionResult {
  return createErrorResult(
    toolCall,
    createCoreError(CoreErrorType.StorageError, "Failed to persist project permission update", {
      cause: error instanceof Error ? error : undefined,
      context: {
        requestId,
        sessionId: deps.sessionId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      },
      recoverable: true,
    }),
  );
}

function sessionPhase({
  deps,
  resolvedPermission,
  traceContext,
  toolCall,
  requestId,
}: GrantContext): void {
  deps.permissionService.grantSessionPermission(resolvedPermission.sessionPermissionUpdates!);
  deps.logger?.info("Session permission granted", {
    ...traceContextToLogContext(traceContext),
    event: "tool.permission.session_grant.applied",
    module: "core.tool.executor",
    requestId,
    status: "completed",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    updateCount: resolvedPermission.sessionPermissionUpdates!.length,
  });
}

export async function applyResolvedPermissionGrants({
  deps,
  toolCall,
  entry,
  resolvedPermission,
  requestId,
  traceContext,
}: GrantContext): Promise<ToolExecutionResult | undefined> {
  if (entry.approvalAuthority === "user") return undefined;
  // 调用参数引用在入口捕获；保存等待期间修改参数容器不能把会话授权转给另一 owner。
  const context = { deps, toolCall, entry, resolvedPermission, requestId, traceContext };
  for (const phase of selectedPhases(resolvedPermission)) {
    if (phase.destination === "session") {
      sessionPhase(context);
    } else {
      try {
        // 只等待实际项目阶段一次；额外 async 包装会改变会话授权接续的微任务顺序。
        await persistProjectPermissionUpdates(
          deps,
          resolvedPermission.permissionUpdates!,
          traceContext,
        );
      } catch (error) {
        return projectFailure(context, error);
      }
    }
  }
  return undefined;
}
