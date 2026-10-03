import {
  SessionEventType,
  createChildTraceContext,
  runWithModelInvocationContext,
  traceContextToLogContext,
} from "../deps.js";
import type {
  ModelInputMessage,
  ModelSelection,
  ModelToolCall,
  ModelToolContract,
  ModelUsage,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { normalizeStreamError } from "../helpers/index.js";
import { auxiliaryModelOptions } from "../../model/auxiliary-model-options.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "./model-runtime-headers.js";
import { createRuntimeModel } from "./runtime-model.js";
import { recordModelUsageFact } from "./usage-observability.js";

export interface WorkspaceGenerateTextInput {
  selection: ModelSelection;
  prompt?: string;
  messages?: ModelInputMessage[];
  tools?: ModelToolContract[];
  querySource: string;
  maxOutputTokens?: number;
}

export interface WorkspaceGenerateTextResult {
  text: string;
  selection: ModelSelection;
  finishReason: string;
  usage?: ModelUsage;
  toolCalls?: ModelToolCall[];
}

export interface ModelConnectivityTestInput {
  selection: ModelSelection;
}

function validateWorkspaceTextInput(input: WorkspaceGenerateTextInput): void {
  if (input.messages && input.messages.length > 0) return;
  if (input.prompt?.trim()) return;
  throw new Error("模型文本生成 prompt 或 messages 不能为空");
}

async function requestWorkspaceText(
  this: AgentRuntimeInternal,
  input: WorkspaceGenerateTextInput,
  options?: { abortSignal?: AbortSignal; traceContext?: TraceContext },
): Promise<WorkspaceGenerateTextResult> {
  validateWorkspaceTextInput(input);
  const requestedSelection = input.selection;
  const querySource = input.querySource.trim() || "workspace_generate_text";
  const baseModel = createRuntimeModel(this, { selection: requestedSelection });
  const model = querySource === "git_commit_message"
    ? baseModel.bind(auxiliaryModelOptions(baseModel))
    : baseModel;
  const baseTraceContext = options?.traceContext ?? this.rootTraceContext;
  const traceContext = createChildTraceContext(baseTraceContext, {
    attributes: {
      model: `${model.providerId}/${model.modelId}`,
      querySource,
    },
  });
  const events: ReturnType<AgentRuntimeInternal["createEvent"]>[] = [];
  const messages: ModelInputMessage[] = input.messages
    ? input.messages.map((message) => ({ ...message }))
    : [{ role: "user", content: input.prompt!.trim() }];
  const tools = input.tools ?? [];
  const requestEvent = this.createEvent(SessionEventType.ModelRequest, {
    messages,
    providerId: String(model.providerId),
    modelId: String(model.modelId),
    querySource,
    toolCount: tools.length,
  }, traceContext);
  await this.appendEvent(requestEvent, traceContext);
  events.push(requestEvent);

  const startedAt = Date.now();
  const networkEventStartIndex = events.length;
  const abortSignal = options?.abortSignal ?? AbortSignal.timeout(60_000);
  const maxOutputTokens = querySource === "git_commit_message"
    ? undefined
    : input.maxOutputTokens;
  const request = {
    abortSignal,
    messages,
    tools,
    ...(maxOutputTokens !== undefined ? { options: { maxOutputTokens } } : {}),
  };
  const result = await runWithModelInvocationContext({
    metadata: traceContextToLogContext(traceContext),
    modelRequestSessionType: "other",
    modelCall: {
      operation: querySource === "git_commit_message"
        ? "workspace_git_commit_message"
        : "workspace_generate_text",
      ...(querySource === "git_commit_message" && model.options.reasoningLevel
        ? { reasoning: { requestedLevel: model.options.reasoningLevel } }
        : {}),
    },
    statusSink: this.createModelStatusSink(traceContext, events),
    traceContext,
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(this, {
      abortSignal,
      model,
      traceContext,
    }),
  }, () => model.generateText(request)).catch(async (error) => {
    await recordModelUsageFact(this, {
      error,
      events,
      model,
      networkEventStartIndex,
      querySource,
      startedAt,
      status: "error",
      traceContext,
    });
    throw error;
  });

  const toolCalls = this.extractToolCallsFromResult(result);
  const completeEvent = this.createEvent(SessionEventType.ModelComplete, {
    content: result.text,
    querySource,
    stopReason: result.finishReason,
    toolCallCount: toolCalls.length,
    usage: result.usage,
  }, traceContext);
  await this.appendEvent(completeEvent, traceContext);
  events.push(completeEvent);
  await recordModelUsageFact(this, {
    events,
    model,
    networkEventStartIndex,
    querySource,
    result,
    startedAt,
    status: "completed",
    toolCallCount: toolCalls.length,
    traceContext,
  });

  return {
    text: result.text,
    selection: {
      providerId: requestedSelection.providerId,
      modelId: requestedSelection.modelId,
      ...(requestedSelection.options ? { options: { ...requestedSelection.options } } : {}),
    },
    finishReason: result.finishReason,
    usage: result.usage,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export async function generateWorkspaceText(
  this: AgentRuntimeInternal,
  input: WorkspaceGenerateTextInput,
  options?: { abortSignal?: AbortSignal; traceContext?: TraceContext },
): Promise<WorkspaceGenerateTextResult> {
  validateWorkspaceTextInput(input);
  const querySource = input.querySource.trim() || "workspace_generate_text";
  const telemetry = this.agentTelemetry.detached({
    executionKind: "foreground",
    operation: querySource === "git_commit_message"
      ? "workspace_git_commit_message"
      : "workspace_generate_text",
    targetKind: "workspace",
    trigger: "user",
    traceContext: options?.traceContext ?? this.rootTraceContext,
  });
  return telemetry.run(async () => {
    try {
      const result = await requestWorkspaceText.call(this, input, options);
      telemetry.setResultType("text");
      telemetry.finishCompleted();
      return result;
    } catch (error) {
      if (options?.abortSignal?.aborted) {
        telemetry.finishCancelled("abort_signal");
      } else {
        telemetry.finishFailed("execute", "unknown", error);
      }
      throw error;
    }
  });
}

export async function testModelConnectivity(
  this: AgentRuntimeInternal,
  input: ModelConnectivityTestInput,
  options?: { abortSignal?: AbortSignal; traceContext?: TraceContext },
): Promise<void> {
  const baseModel = createRuntimeModel(this, { selection: input.selection });
  const model = baseModel.bind({
    reasoningLevel: baseModel.optionSpecs.reasoningLevel.values[0]!,
    maxOutputTokens: 1,
  });
  const traceContext = createChildTraceContext(options?.traceContext ?? this.rootTraceContext, {
    attributes: {
      providerId: String(model.providerId),
      modelId: String(model.modelId),
      querySource: "provider_settings_connectivity",
    },
  });
  const abortSignal = options?.abortSignal ?? AbortSignal.timeout(60_000);
  const messages: ModelInputMessage[] = [
    { role: "system", content: "You are Knorvia Studio connectivity probe." },
    { role: "user", content: "hi" },
  ];
  const request = { abortSignal, messages };
  let finished = false;
  await runWithModelInvocationContext({
    metadata: traceContextToLogContext(traceContext),
    modelRequestSessionType: "other",
    modelCall: { operation: "workspace_generate_text" },
    statusSink: this.createModelStatusSink(traceContext, []),
    traceContext,
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(this, {
      abortSignal,
      model,
      traceContext,
    }),
  }, async () => {
    for await (const event of model.streamText(request)) {
      if (event.type === "error") {
        throw normalizeStreamError(event.error);
      }
      if (event.type === "finish") {
        finished = true;
      }
    }
  });
  if (!finished) {
    throw new Error("模型连通性测试流在 finish 事件前结束");
  }
}
