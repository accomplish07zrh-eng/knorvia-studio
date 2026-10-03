import { createMessageId } from "../deps.js";
import type { ModelToolContract } from "../deps.js";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";
import { isTurnCancellationError } from "../helpers/index.js";
import type { DrainedPendingInputDiagnostics, RunModelTextRequestOptions } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { performModelStep } from "./turn-model-step-operation.js";

type ModelStepResult = "continue" | "output_continuation" | "break";

export async function runModelBackedTurnStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
    latestRealUserMessageIndex?: number;
    messages: RunModelTextRequestOptions["messages"];
    sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
    recordedMessages: RunModelTextRequestOptions["messages"];
    requestEntries: readonly RuntimeMessageEntry[];
    tools: ModelToolContract[];
  },
): Promise<ModelStepResult> {
  const assistantMessageId = createMessageId();
  const telemetry = this.agentTelemetry.step({
    stepId: assistantMessageId,
    stepIndex: state.modelStepCount,
  });
  return telemetry.run(async () => {
    try {
      const outcome = await performModelStep(this, state, options, assistantMessageId);
      telemetry.finishCompleted(
        outcome === "output_continuation"
          ? "model_completed"
          : outcome === "continue"
            ? "tool_requested"
            : "turn_completed",
      );
      return outcome;
    } catch (error) {
      if (isTurnCancellationError(error, state.turnAbortSignal))
        telemetry.finishCancelled("abort_signal");
      else telemetry.finishFailed("unhandled", "unknown", error);
      throw error;
    }
  });
}
