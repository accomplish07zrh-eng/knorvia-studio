import { traceContextToLogContext } from "../deps.js";
import type { ToolExecutionResult, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";

export async function steerToolBatchFollowUp(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void> {
  const followUp = result.followUpUserInput;
  if (!followUp) return;
  const input = followUp.input.trim();
  if (!input) return;
  const steering = await runtime.steerTurn({
    delivery: "guide",
    expectedTurnId: state.activeTurn?.turnId,
    input,
    source: followUp.reasonSource,
    traceContext,
  });
  if (steering.kind === "queued") {
    runtime.logger?.debug("Queued follow-up user input from tool result", {
      ...traceContextToLogContext(traceContext),
      event: "tool.follow_up_user_input.queued",
      module: "core.runtime",
      pendingInputId: steering.pendingInputId,
      reasonSource: followUp.reasonSource,
      status: "waiting",
      toolCallId: result.toolCallId,
      toolName: result.toolName,
    });
  } else {
    runtime.logger?.warn("Failed to queue follow-up user input from tool result", {
      ...traceContextToLogContext(traceContext),
      activeTurnId: steering.activeTurnId,
      event: "tool.follow_up_user_input.rejected",
      module: "core.runtime",
      reason: steering.reason,
      reasonSource: followUp.reasonSource,
      status: "failed",
      toolCallId: result.toolCallId,
      toolName: result.toolName,
    });
  }
}
