// SPDX-License-Identifier: Apache-2.0
// 提交期模型：句柄只包这一次调用，会话选择另写。execution 范围不落盘、不广播。
import {
  SESSION_ENTRY_MODEL_SELECTION,
  type Model,
  type ModelInvocationContext,
  type ModelRequest,
  type ModelRequestDependencies,
  type ModelSelection,
  type SessionEntryInfo,
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
import { assignKeys, phrase, report } from "./m02-record.js";

type TurnModelOptions = {
  selection?: ModelSelection; // 钉住的选择；缺省则读会话
  requestDependencies?: ModelRequestDependencies; // 只绑在这次句柄上
};

const SLOT_SUFFIX = ":runtime-model-selection";
const PERSIST_EVENT = phrase(["session.model_selection.", "persist_failed"]);
const PERSIST_LABEL = phrase(["Session model selection ", "persistence failed"]);
const MODULE_NAME = phrase(["core.runtime"]);
const FAILED_STATUS = phrase(["failed"]);

function pickedSelection(
  runtime: AgentRuntimeInternal,
  options: TurnModelOptions,
): ModelSelection | undefined {
  // null 与 undefined 都回落到会话选择，和 ?? 一致。
  const explicit = options.selection;
  return explicit ?? runtime.getSessionModelSelection();
}

function headerRefresh(
  runtime: AgentRuntimeInternal,
  built: Model,
  request: ModelRequest,
): ModelInvocationContext {
  const live = getCurrentModelInvocationContext();
  const traceContext = live?.traceContext ?? runtime.rootTraceContext;
  const refreshRuntimeHeadersBeforeAttempt = createRefreshRuntimeHeadersBeforeModelAttempt(
    runtime,
    assignKeys<Parameters<typeof createRefreshRuntimeHeadersBeforeModelAttempt>[1]>([
      ["abortSignal", request.abortSignal],
      ["model", built],
      ["traceContext", traceContext],
    ]),
  );
  return assignKeys<ModelInvocationContext>([
    ["refreshRuntimeHeadersBeforeAttempt", refreshRuntimeHeadersBeforeAttempt],
  ]);
}

export function createTurnModel(
  runtime: AgentRuntimeInternal,
  options: TurnModelOptions = {},
): Model {
  const picked = pickedSelection(runtime, options);
  const built = createRuntimeModel(
    runtime,
    assignKeys<Parameters<typeof createRuntimeModel>[1]>([
      ["selection", picked],
      ["requestDependencies", options.requestDependencies],
    ]),
  );
  return withModelInvocationContext(built, (request) => headerRefresh(runtime, built, request));
}

function sameSlot(leftValue: unknown, rightValue: unknown): boolean {
  return leftValue === rightValue;
}

export function sameModelSelection(
  left: ModelSelection | undefined,
  right: ModelSelection,
): boolean {
  // 三路都读完再与，避免提前返回漏掉后续字段的取值。
  const providerOk = sameSlot(left?.providerId, right.providerId);
  const modelOk = sameSlot(left?.modelId, right.modelId);
  const levelOk = sameSlot(left?.options?.reasoningLevel, right.options?.reasoningLevel);
  return providerOk ? modelOk && levelOk : false;
}

function selectionEntry(
  runtime: AgentRuntimeInternal,
  selection: ModelSelection,
): SessionEntryInfo {
  const stamped = Date.now();
  const clock = assignKeys<SessionEntryInfo["time"]>([
    ["created", stamped],
    ["updated", stamped],
  ]);
  return assignKeys<SessionEntryInfo>([
    ["id", phrase([runtime.sessionId, SLOT_SUFFIX])],
    ["sessionID", runtime.sessionId],
    ["type", SESSION_ENTRY_MODEL_SELECTION],
    ["touchSession", false],
    ["time", clock],
    ["data", selection],
  ]);
}

function warnPersist(
  runtime: AgentRuntimeInternal,
  selection: ModelSelection,
  caught: unknown,
): void {
  const detail = caught instanceof Error ? caught.message : String(caught);
  report(
    runtime,
    "warn",
    PERSIST_LABEL,
    assignKeys([
      ["error", detail],
      ["event", PERSIST_EVENT],
      ["modelId", selection.modelId],
      ["module", MODULE_NAME],
      ["providerId", selection.providerId],
      ["status", FAILED_STATUS],
      ["thoughtLevel", selection.options?.reasoningLevel],
    ]),
  );
}

function launchSave(
  save: NonNullable<NonNullable<AgentRuntimeInternal["sessionStore"]>["saveSessionEntry"]>,
  store: AgentRuntimeInternal["sessionStore"],
  entry: SessionEntryInfo,
): Promise<unknown> {
  // 同步抛出与拒绝都吞进同一条链，失败只记日志。
  try {
    return Promise.resolve(save.call(store, entry));
  } catch (syncFailure) {
    return Promise.reject(syncFailure);
  }
}

export async function persistRuntimeModelSelection(
  runtime: AgentRuntimeInternal,
  selection: ModelSelection,
): Promise<void> {
  const save = runtime.sessionStore?.saveSessionEntry;
  if (save) {
    const entry = selectionEntry(runtime, selection);
    await launchSave(save, runtime.sessionStore, entry).catch((caught: unknown) => {
      warnPersist(runtime, selection, caught);
    });
  }
}

type SelectedEvent = Parameters<AgentRuntimeInternal["emitModelSelected"]>[0];

function selectedEvent(
  hosted: Model,
  applied: ModelSelection,
  prior: ModelSelection | undefined,
  traceContext: TraceContext,
): SelectedEvent {
  return assignKeys<SelectedEvent>([
    ["model", hosted],
    ["modelSelection", applied],
    ["effectiveReasoningLevel", hosted.options.reasoningLevel],
    ["previousModelSelection", prior],
    ["supportedThoughtLevels", hosted.optionSpecs.reasoningLevel.values],
    ["traceContext", traceContext],
  ]);
}

async function keepSessionSelection(
  runtime: AgentRuntimeInternal,
  requested: ModelSelection,
  hosted: Model,
  prior: ModelSelection | undefined,
  traceContext: TraceContext,
): Promise<void> {
  const applied = cloneModelSelection(requested);
  runtime.setSessionModelSelection(applied);
  await persistRuntimeModelSelection(runtime, applied);
  const changed = sameModelSelection(prior, applied) === false;
  if (changed) await runtime.emitModelSelected(selectedEvent(hosted, applied, prior, traceContext));
}

function patchRequested(intent: TurnInputIntentMetadata): boolean {
  const modeTouched = intent.mode !== undefined;
  const planTouched = intent.planEnabled !== undefined;
  return modeTouched || planTouched;
}

export async function applySubmissionExecutionState(
  runtime: AgentRuntimeInternal,
  intent: TurnInputIntentMetadata | undefined,
  traceContext: TraceContext,
  modelExecution?: ModelExecutionContext,
  preparedModel?: Model,
): Promise<Model | undefined> {
  const requested = intent?.modelSelection;
  const prior = runtime.getSessionModelSelection();
  let hosted = preparedModel;
  if (requested) {
    const hostedModel =
      hosted ??
      createTurnModel(
        runtime,
        assignKeys<TurnModelOptions>([
          ["selection", requested],
          ["requestDependencies", modelExecution?.requestDependencies],
        ]),
      );
    hosted = hostedModel;
    // execution 只服务这一次请求，不写会话选择，也不发 model-selected。
    const sessionScoped = modelExecution?.selectionScope !== "execution";
    if (sessionScoped)
      await keepSessionSelection(runtime, requested, hostedModel, prior, traceContext);
  }
  if (intent !== undefined && patchRequested(intent)) {
    await applyRuntimeExecutionState(
      runtime,
      intent,
      assignKeys([
        ["source", "command"],
        ["traceContext", traceContext],
      ]),
    );
  }
  return hosted;
}
