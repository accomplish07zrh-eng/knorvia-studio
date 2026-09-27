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

/** 审批返回后统一应用可记忆规则；仅本次用户授权永不写入项目或会话规则。 */
export async function applyResolvedPermissionGrants({
  deps,
  toolCall,
  entry,
  resolvedPermission,
  requestId,
  traceContext,
}: {
  deps: ToolExecutorDeps;
  toolCall: ExecutableToolCall;
  entry: ToolEntry;
  resolvedPermission: PermissionBrokerResult;
  requestId: string;
  traceContext: TraceContext;
}): Promise<ToolExecutionResult | undefined> {
  if (entry.approvalAuthority === "user") return undefined;
  if (resolvedPermission.permissionUpdates?.length) {
    try {
      await persistProjectPermissionUpdates(
        deps,
        resolvedPermission.permissionUpdates,
        traceContext,
      );
    } catch (error) {
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
  }

  if (resolvedPermission.sessionPermissionUpdates?.length) {
    // 会话免确认：只进内存里的会话 ruleset，
    // 与上面的项目级持久化互不可见。
    deps.permissionService.grantSessionPermission(resolvedPermission.sessionPermissionUpdates);
    deps.logger?.info("Session permission granted", {
      ...traceContextToLogContext(traceContext),
      event: "tool.permission.session_grant.applied",
      module: "core.tool.executor",
      requestId,
      status: "completed",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      updateCount: resolvedPermission.sessionPermissionUpdates.length,
    });
  }

  return undefined;
}
