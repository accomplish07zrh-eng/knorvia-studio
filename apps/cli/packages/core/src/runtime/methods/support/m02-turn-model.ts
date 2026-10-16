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
import { layer, report } from "./m02-record.js";

type TurnModelOptions = {
  selection?: ModelSelection; // 钉住的选择；缺省则读会话
  requestDependencies?: ModelRequestDependencies; // 只绑在这次句柄上
};

const SLOT_SUFFIX = ":runtime-model-selection";
const PERSIST_EVENT = "session.model_selection.persist_failed";
const PERSIST_LABEL = "Session model selection persistence failed";
const MODULE_NAME = "core.runtime";
const FAILED_STATUS = "failed";

function pickedSelection(
  host: AgentRuntimeInternal,
  options: TurnModelOptions,
): ModelSelection | undefined {
  // null 与 undefined 都回落到会话选择，和 ?? 一致。
  const explicit = options.selection;
  return explicit ?? host.getSessionModelSelection();
}

function headerRefresh(
  host: AgentRuntimeInternal,
  built: Model,
  request: ModelRequest,
): ModelInvocationContext {
  const live = getCurrentModelInvocationContext();
  const traceContext = live?.traceContext ?? host.rootTraceContext;
  const refreshRuntimeHeadersBeforeAttempt = createRefreshRuntimeHeadersBeforeModelAttempt(host, {
    abortSignal: request.abortSignal,
    model: built,
    traceContext,
  });
  return { refreshRuntimeHeadersBeforeAttempt };
}

export function createTurnModel(host: AgentRuntimeInternal, options: TurnModelOptions = {}): Model {
  const picked = pickedSelection(host, options);
  const { requestDependencies } = options;
  const built = createRuntimeModel(host, { selection: picked, requestDependencies });
  return withModelInvocationContext(built, (request) => headerRefresh(host, built, request));
}

function sameSlot(leftValue: unknown, rightValue: unknown): boolean {
  return leftValue === rightValue;
}

export function sameModelSelection(
  current: ModelSelection | undefined,
  incoming: ModelSelection,
): boolean {
  // 三路都读完再与，避免提前返回漏掉后续字段的取值。
  const providerOk = sameSlot(current?.providerId, incoming.providerId);
  const modelOk = sameSlot(current?.modelId, incoming.modelId);
  const levelOk = sameSlot(current?.options?.reasoningLevel, incoming.options?.reasoningLevel);
  return providerOk ? modelOk && levelOk : false;
}

function selectionEntry(host: AgentRuntimeInternal, selection: ModelSelection): SessionEntryInfo {
  const stamped = Date.now();
  const { sessionId } = host;
  return layer<SessionEntryInfo>(
    { id: `${sessionId}${SLOT_SUFFIX}`, sessionID: sessionId },
    { type: SESSION_ENTRY_MODEL_SELECTION, touchSession: false },
    { time: { created: stamped, updated: stamped }, data: selection },
  );
}

function warnPersist(host: AgentRuntimeInternal, selection: ModelSelection, caught: unknown): void {
  const error = caught instanceof Error ? caught.message : String(caught);
  const { modelId, providerId, options } = selection;
  report(host, "warn", PERSIST_LABEL, {
    error,
    event: PERSIST_EVENT,
    modelId,
    module: MODULE_NAME,
    providerId,
    status: FAILED_STATUS,
    thoughtLevel: options?.reasoningLevel,
  });
}

export async function persistRuntimeModelSelection(
  host: AgentRuntimeInternal,
  selection: ModelSelection,
): Promise<void> {
  const save = host.sessionStore?.saveSessionEntry;
  if (!save) return;
  const entry = selectionEntry(host, selection);
  // 同步抛出要在这条 async 函数里当场接住。先变成拒绝再 catch，调用方在微任务之前看不到告警。
  try {
    await save.call(host.sessionStore, entry);
  } catch (caught) {
    warnPersist(host, selection, caught);
  }
}

type SelectedEvent = Parameters<AgentRuntimeInternal["emitModelSelected"]>[0];

function selectedEvent(
  hosted: Model,
  applied: ModelSelection,
  prior: ModelSelection | undefined,
  trace: TraceContext,
): SelectedEvent {
  return {
    model: hosted,
    modelSelection: applied,
    effectiveReasoningLevel: hosted.options.reasoningLevel,
    previousModelSelection: prior,
    supportedThoughtLevels: hosted.optionSpecs.reasoningLevel.values,
    traceContext: trace,
  };
}

async function keepSessionSelection(
  host: AgentRuntimeInternal,
  requested: ModelSelection,
  hosted: Model,
  prior: ModelSelection | undefined,
  trace: TraceContext,
): Promise<void> {
  const applied = cloneModelSelection(requested);
  host.setSessionModelSelection(applied);
  await persistRuntimeModelSelection(host, applied);
  const changed = sameModelSelection(prior, applied) === false;
  if (changed) await host.emitModelSelected(selectedEvent(hosted, applied, prior, trace));
}

function patchRequested(intent: TurnInputIntentMetadata): boolean {
  const modeTouched = intent.mode !== undefined;
  const planTouched = intent.planEnabled !== undefined;
  return modeTouched || planTouched;
}

export async function applySubmissionExecutionState(
  host: AgentRuntimeInternal,
  submission: TurnInputIntentMetadata | undefined,
  trace: TraceContext,
  execution?: ModelExecutionContext,
  prepared?: Model,
): Promise<Model | undefined> {
  const requested = submission?.modelSelection;
  const prior = host.getSessionModelSelection();
  let hosted = prepared;
  if (requested) {
    const { requestDependencies } = execution ?? {};
    const hostedModel =
      hosted ?? createTurnModel(host, { selection: requested, requestDependencies });
    hosted = hostedModel;
    // execution 只服务这一次请求，不写会话选择，也不发 model-selected。
    const sessionScoped = execution?.selectionScope !== "execution";
    if (sessionScoped) await keepSessionSelection(host, requested, hostedModel, prior, trace);
  }
  if (submission !== undefined && patchRequested(submission)) {
    await applyRuntimeExecutionState(host, submission, {
      source: "command" as const,
      traceContext: trace,
    });
  }
  return hosted;
}
