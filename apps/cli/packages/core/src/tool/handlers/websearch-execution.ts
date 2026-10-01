import {
  CoreErrorType,
  createCoreError,
  runWithModelInvocationContext,
  toWebSearchProviderNativeArgs,
  WEBSEARCH_PROVIDER_NATIVE_SPEC,
  type Model,
  type ModelRequest,
  type ModelStreamEvent,
  type ModelTextResult,
  type ModelToolContract,
  type WebSearchInput,
  type WebSearchOutput,
} from "@knorvia/contracts";
import { auxiliaryModelOptions } from "../../model/auxiliary-model-options.js";
import type { ToolExecutionContext } from "../types.js";
import { buildWebSearchOutput } from "./websearch-results.js";
import { webSearchTraceFromContext } from "./websearch-support.js";

const TOOL = "WebSearch";
const NATIVE_TOOL = "web_search";
const MAX_USES = 8;
const OUTPUT_TOKENS = 4096;
const SYSTEM_PROMPT = "You are an assistant for performing a web search tool use.";
const NATIVE_DESCRIPTION = "Provider-native web search used internally by the WebSearch tool";
type Admission = { kind: "ready"; model: Model } | { kind: "refused"; error: Error };
type Fold = ModelTextResult & { toolCalls: NonNullable<ModelTextResult["toolCalls"]> };
type Transition = (state: Fold, event: ModelStreamEvent) => void;

// The table selects effects without converting unknown event tags to property keys.
// Each invocation has one fold; ignored events do not acquire another result owner.
const transitions = new Map<unknown, Transition>([
  [
    "text_delta",
    (state, event) => {
      state.text += (event as Extract<ModelStreamEvent, { type: "text_delta" }>).text;
    },
  ],
  [
    "tool_call",
    (state, event) => {
      state.toolCalls.push((event as Extract<ModelStreamEvent, { type: "tool_call" }>).toolCall);
    },
  ],
  [
    "finish",
    (state, event) => {
      const terminal = event as Extract<ModelStreamEvent, { type: "finish" }>;
      state.finishReason = terminal.finishReason;
      state.usage = terminal.usage;
      state.providerMetadata = terminal.providerMetadata;
    },
  ],
  [
    "error",
    (_state, event) => {
      const error = (event as Extract<ModelStreamEvent, { type: "error" }>).error;
      if (error instanceof Error) throw error;
      throw createCoreError(CoreErrorType.ModelError, "WebSearch stream failed", {
        context: { error },
        recoverable: true,
      });
    },
  ],
]);

function admission(context: ToolExecutionContext): Admission {
  const model = context.model;
  if (model && model.properties.supportsNativeWebSearch) return { kind: "ready", model };
  return {
    kind: "refused",
    error: createCoreError(
      CoreErrorType.ConfigurationError,
      model ? "Current model does not support native WebSearch" : "Model is required for WebSearch",
      { context: { toolCallId: context.toolCallId, toolName: TOOL }, recoverable: !!model },
    ),
  };
}

function nativeContract(input: WebSearchInput): ModelToolContract {
  return {
    name: NATIVE_TOOL,
    capability: "web_search",
    description: NATIVE_DESCRIPTION,
    executionMode: "providerNative",
    providerNative: {
      ...WEBSEARCH_PROVIDER_NATIVE_SPEC,
      args: toWebSearchProviderNativeArgs(input, { maxUses: MAX_USES }),
    },
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    outputSchema: { type: "object" },
  };
}

function requestIntent(
  model: Model,
  input: WebSearchInput,
  context: ToolExecutionContext,
): ModelRequest {
  const messages: ModelRequest["messages"] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Perform a web search for the query: ${input.query}` },
  ];
  const tools = [nativeContract(input)];
  // BigModel 的 Anthropic 兼容端点会拒绝 named forced web_search tool_choice（1210）。
  // 这里保持自动选择，依靠单工具请求和 prompt 触发 provider-native 搜索。
  const options = {
    ...auxiliaryModelOptions(model),
    maxOutputTokens: Math.min(OUTPUT_TOKENS, model.optionSpecs.maxOutputTokens.max),
  };
  return { messages, tools, options, abortSignal: context.abortSignal };
}

class SearchInvocation {
  constructor(
    private readonly input: WebSearchInput,
    private readonly context: ToolExecutionContext,
  ) {}

  async run(): Promise<WebSearchOutput> {
    const startedAt = Date.now();
    const decision = admission(this.context);
    if (decision.kind === "refused") throw decision.error;
    const model = decision.model;
    const request = requestIntent(model, this.input, this.context);
    // BigModel Anthropic 兼容端点的非流式 JSON 会把 provider 内部
    // web_search 结果返回为 assistant-side 裸 tool_result，AI SDK 会在 schema
    // 校验阶段抛 Invalid JSON response。走流式可复用现有 SSE compat。
    const events = runWithModelInvocationContext(
      {
        metadata: {
          traceId: this.context.traceId,
          sessionId: this.context.sessionId,
          turnId: this.context.turnId,
          toolCallId: this.context.toolCallId,
          toolName: TOOL,
          querySource: "web_search_tool",
        },
        modelRequestSessionType: "other",
        modelCall: { operation: "web_search" },
        // statusSink 不在这里设：执行器交出的 context.model 已带默认会话事件出口。
        traceContext: webSearchTraceFromContext(this.context),
      },
      () => model.streamText(request),
    );

    const result = await this.foldStream({ events });
    return buildWebSearchOutput(this.input, result, startedAt);
  }

  private async foldStream(input: {
    events: AsyncIterable<ModelStreamEvent>;
  }): Promise<ModelTextResult> {
    const state: Fold = { text: "", finishReason: "unknown", usage: {}, toolCalls: [] };
    // 原 for-await 表达式决定非 iterable 返回值的原生 TypeError 文本；冻结协议要求保留。
    for await (const event of input.events) transitions.get(event.type)?.(state, event);
    return {
      finishReason: state.finishReason,
      providerMetadata: state.providerMetadata,
      text: state.text,
      toolCalls: state.toolCalls.length ? state.toolCalls : undefined,
      usage: state.usage,
    };
  }
}

export function executeWebSearch(
  input: WebSearchInput,
  context: ToolExecutionContext,
): Promise<WebSearchOutput> {
  return new SearchInvocation(input, context).run();
}
