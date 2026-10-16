// SPDX-License-Identifier: Apache-2.0
// 回合模型步的外层：先铸助手消息号，再把内部步包进遥测。失败在遥测回调里归类后原样抛出。
import { createMessageId, type MessageId } from "../deps.js";
import * as helpers from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import type { ModelStepInputs } from "./turn-model-step-fields.js";
import { performModelStep } from "./turn-model-step-operation.js";

type ModelStepResult = "break" | "continue" | "output_continuation";

const STEP_MARK = {
  continued: "model_completed",
  tools: "tool_requested",
  finished: "turn_completed",
  aborted: "abort_signal",
  failedStage: "unhandled",
  failedCategory: "unknown",
} as const;

type CompletedLabel = "model_completed" | "tool_requested" | "turn_completed";

type StepProbe = {
  finishCancelled: (reason: "abort_signal") => void;
  finishCompleted: (label: CompletedLabel) => void;
  finishFailed: (stage: "unhandled", category: "unknown", error: unknown) => void;
  run: <T>(body: () => Promise<T>) => Promise<T>;
};

function labelFor(outcome: ModelStepResult): CompletedLabel {
  switch (outcome) {
    case "output_continuation":
      return STEP_MARK.continued;
    case "continue":
      return STEP_MARK.tools;
    default:
      return STEP_MARK.finished;
  }
}

function noteStepFailure(probe: StepProbe, error: unknown, signal: AbortSignal): void {
  const aborted = helpers.isTurnCancellationError(error, signal);
  if (aborted) {
    probe.finishCancelled(STEP_MARK.aborted);
    return;
  }
  probe.finishFailed(STEP_MARK.failedStage, STEP_MARK.failedCategory, error);
}

function openStep(loop: RegularTurnLoopState): {
  messageId: MessageId;
  stepId: MessageId;
  stepIndex: number;
} {
  const messageId: MessageId = createMessageId();
  const stepId = messageId;
  const stepIndex = loop.modelStepCount;
  return { messageId, stepId, stepIndex };
}

async function guardedModelStep(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  request: ModelStepInputs,
  messageId: MessageId,
  probe: StepProbe,
): Promise<ModelStepResult> {
  try {
    const settled = await performModelStep(host, loop, request, messageId);
    probe.finishCompleted(labelFor(settled));
    return settled;
  } catch (failure) {
    noteStepFailure(probe, failure, loop.turnAbortSignal);
    throw failure;
  }
}

export async function runModelBackedTurnStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: ModelStepInputs,
): Promise<ModelStepResult> {
  const host: AgentRuntimeInternal = this;
  const opened = openStep(state);
  const probe = host.agentTelemetry.step({ stepId: opened.stepId, stepIndex: opened.stepIndex });
  return probe.run(() => guardedModelStep(host, state, options, opened.messageId, probe));
}
