import type { AgentRuntimeInternal } from "../internal.js";
import type { TraceContext } from "../deps.js";

/** 即使用户在模型思考期间停止（没有在途 MCP 请求），也要释放当轮桌面驱动。 */
export async function endWindowsComputerTurn(
  runtime: AgentRuntimeInternal,
  trace: TraceContext,
): Promise<void> {
  const port = runtime.mcpPort;
  const config = runtime.config;
  if (
    !port ||
    !runtime.mcpInitialized ||
    !trace.turnId ||
    config.runtimeFeatures?.computerUse !== true ||
    config.taskType === "subagent_child" ||
    config.remoteSessionId ||
    config.clientMode === "web-remote-replayable" ||
    config.deliveryKind === "web-remote-replayable"
  )
    return;
  for (const serverName of config.mcp?.trustedWindowsComputerUseServerNames ?? []) {
    // 生命周期清理不受模型工具可见性控制；用户规则隐藏 stop 也不能留下已授权驱动。
    const workspaceIdentity = config.workspaceIdentity?.toString().trim();
    try {
      const result = await port.callTool(
        {
          serverName,
          toolName: "computer_stop",
          arguments: {},
          trace,
          runtimeScope: "main",
          workspacePath: runtime.workingDirectory,
          workspaceKey: workspaceIdentity || runtime.workingDirectory,
          ...(workspaceIdentity ? { workspaceIdentity } : {}),
          turnId: String(trace.turnId),
          clientMode: "desktop-continuous",
          deliveryKind: "desktop-continuous",
        },
        { timeoutMs: 5000, signal: AbortSignal.timeout(5000) },
      );
      if (result.isError) throw new Error("Computer turn cleanup was rejected");
    } catch {
      // 清理错误不能覆盖原任务结果；驱动另有空闲期限和宿主关闭释放。
      runtime.logger?.warn("Computer turn cleanup failed", {
        event: "computer.turn_cleanup.failed",
        turnId: String(trace.turnId),
      });
    }
  }
}
