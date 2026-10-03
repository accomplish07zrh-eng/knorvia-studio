import {
  CoreErrorType,
  EXIT_PLAN_MODE_TOOL_NAME,
  createCoreError,
  isFileSystemPortError,
} from "@knorvia/contracts";
import { writeApprovedPlanFile } from "../../runtime/helpers/plan-file-continuity.js";
import type { ToolExecutionContext } from "../types.js";
import { planModeToolTrace } from "./plan-mode-projection.js";

const CANCELLED_MESSAGE = "ExitPlanMode was cancelled before plan mode was exited";
function writeIntent(context: ToolExecutionContext, plan: string) {
  return {
    abortSignal: context.abortSignal,
    fileSystemPort: context.fileSystemPort!,
    plan,
    sessionId: context.sessionId,
    traceContext: planModeToolTrace(context),
    workspaceRoot: context.workspaceRoot,
  };
}

function cancellation(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (isFileSystemPortError(error) && error.code === "cancelled");
}

/** The operation waits for this one persistence effect before any exit transition. */
export async function persistPlanBeforeExit(
  context: ToolExecutionContext,
  plan: string,
): Promise<void> {
  if (!context.fileSystemPort) return;
  try {
    await writeApprovedPlanFile(writeIntent(context, plan));
  } catch (error) {
    // 旧边界只把取消升级为工具错误；其他写入失败继续退出，不在实现替换中重设计策略。
    if (!cancellation(error, context.abortSignal)) return;
    throw createCoreError(CoreErrorType.ToolCancelled, CANCELLED_MESSAGE, {
      cause: error instanceof Error ? error : undefined,
      context: { toolCallId: context.toolCallId, toolName: EXIT_PLAN_MODE_TOOL_NAME },
      recoverable: true,
    });
  }
}
