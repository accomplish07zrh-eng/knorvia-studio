// SPDX-License-Identifier: Apache-2.0
// 回合模型句柄，以及提交侧的会话选择与执行状态。execution scope 不写常驻选择。
import {
  SESSION_ENTRY_MODEL_SELECTION,
  type Model,
  type ModelSelection,
  type TraceContext,
  type TurnInputIntentMetadata,
} from "@knorvia/contracts";
import { applyRuntimeExecutionState } from "../../execution-state.js";
import { getCurrentModelInvocationContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { cloneModelSelection } from "../../model-selection.js";
import type { ModelExecutionContext } from "../../types.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "../model-runtime-headers.js";
import { createRuntimeModel, withModelInvocationContext } from "../runtime-model.js";
import { phrase, report } from "./m02-record.js";

const SELECTION_ENTRY_SUFFIX = ":runtime-model-selection";
const PERSIST_FAILED = phrase(["session.model_selection.", "persist_failed"]);

export function createTurnModel(
  runtime: AgentRuntimeInternal,
  options: {
    selection?: ModelSelection;
    requestDependencies?: import("@knorvia/contracts").ModelRequestDependencies;
  } = {},
): Model {
  const selection = options.selection ?? runtime.getSessionModelSelection();
  const model = createRuntimeModel(runtime, {
    selection,
    requestDependencies: options.requestDependencies,
  });
  return withModelInvocationContext(model, (request) => {
    const current = getCurrentModelInvocationContext();
    const traceContext = current?.traceContext ?? runtime.rootTraceContext;
    return {
      refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(runtime, {
        abortSignal: request.abortSignal,
        model,
        traceContext,
      }),
    };
  });
}

export function sameModelSelection(
  left: ModelSelection | undefined,
  right: ModelSelection,
): boolean {
  const sameProvider = left?.providerId === right.providerId;
  const sameModel = left?.modelId === right.modelId;
  const sameLevel = left?.options?.reasoningLevel === right.options?.reasoningLevel;
  return sameProvider && sameModel && sameLevel;
}

export async function persistRuntimeModelSelection(
  runtime: AgentRuntimeInternal,
  selection: ModelSelection,
): Promise<void> {
  const save = runtime.sessionStore?.saveSessionEntry;
  if (!save) return;
  const timestamp = Date.now();
  const entry = {
    id: `${runtime.sessionId}${SELECTION_ENTRY_SUFFIX}`,
    sessionID: runtime.sessionId,
    type: SESSION_ENTRY_MODEL_SELECTION,
    touchSession: false,
    time: { created: timestamp, updated: timestamp },
    data: selection,
  };
  try {
    await save.call(runtime.sessionStore, entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(runtime, "warn", phrase(["Session model selection ", "persistence failed"]), {
      error: message,
      event: PERSIST_FAILED,
      modelId: selection.modelId,
      module: "core.runtime",
      providerId: selection.providerId,
      status: "failed",
      thoughtLevel: selection.options?.reasoningLevel,
    });
  }
}

export async function applySubmissionExecutionState(
  runtime: AgentRuntimeInternal,
  intent: TurnInputIntentMetadata | undefined,
  traceContext: TraceContext,
  modelExecution?: ModelExecutionContext,
  preparedModel?: Model,
): Promise<Model | undefined> {
  const selection = intent?.modelSelection;
  const previousSelection = runtime.getSessionModelSelection();
  let model = preparedModel;
  if (selection) {
    if (!model) {
      model = createTurnModel(runtime, {
        selection,
        requestDependencies: modelExecution?.requestDependencies,
      });
    }
    if (modelExecution?.selectionScope !== "execution") {
      const applied = cloneModelSelection(selection);
      runtime.setSessionModelSelection(applied);
      await persistRuntimeModelSelection(runtime, applied);
      if (!sameModelSelection(previousSelection, applied)) {
        await runtime.emitModelSelected({
          model,
          modelSelection: applied,
          effectiveReasoningLevel: model.options.reasoningLevel,
          previousModelSelection: previousSelection,
          supportedThoughtLevels: model.optionSpecs.reasoningLevel.values,
          traceContext,
        });
      }
    }
  }
  const modeSet = intent?.mode !== undefined;
  const planSet = intent?.planEnabled !== undefined;
  if (modeSet || planSet) {
    await applyRuntimeExecutionState(runtime, intent, { source: "command", traceContext });
  }
  return model;
}
