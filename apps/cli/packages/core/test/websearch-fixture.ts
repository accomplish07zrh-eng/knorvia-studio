// Source-exposed compatibility probes; all model effects and records are synthetic.
import {
  getCurrentModelInvocationContext,
  type Model,
  type ModelStreamEvent,
  type ModelRequest,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

const emitted = process.env.KNORVIA_WEBSEARCH_TEST_EMITTED === "1";
const extension = emitted ? "js" : "ts";
const directory = emitted ? "../dist/" : "../src/";
const load = (path: string) =>
  import(new URL(`${directory}${path}.${extension}`, import.meta.url).href);
export const { webSearchToolEntry: entry } = await load("tool/handlers/websearch");
export const projection = await load("tool/handlers/websearch-results");
export const support = await load("tool/handlers/websearch-support");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const { withModelInvocationContext } = await load("runtime/methods/runtime-model");
export const { toAiSdkTools } = await import(
  new URL(
    `../../adapters/${emitted ? "dist" : "src"}/model/tool-transform.${extension}`,
    import.meta.url,
  ).href
);
export const valid = { query: "fictional search" };
export const date = Date.UTC(2026, 0, 15, 12);
export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export function errorShape(error: unknown) {
  const value = error as any;
  return json({
    name: value?.name,
    type: value?.type,
    code: value?.code,
    message: value?.message,
    context: value?.context,
    recoverable: value?.recoverable,
    retryable: value?.retryable,
    issues: value?.issues,
  });
}
export async function clock<T>(run: () => T | Promise<T>, now = date): Promise<T> {
  const original = globalThis.Date;
  class SyntheticDate extends original {
    constructor(value?: string | number | Date) {
      super(value === undefined ? now : value);
    }
    static override now() {
      return now;
    }
  }
  globalThis.Date = SyntheticDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = original;
  }
}
export interface StreamCase {
  label: string;
  events: unknown[];
  missingModel?: boolean;
  supported?: boolean;
  maxTokens?: number;
  levels?: string[];
  input?: unknown;
  startFailure?: unknown;
  iteratorFailure?: unknown;
  iteratorFailureAt?: number;
}
export function streamFixture(c: StreamCase) {
  const calls: any[] = [];
  const iterations: any[] = [];
  const requests: ModelRequest[] = [];
  const controller = new AbortController();
  let index = 0;
  const scope = () => {
    const current = getCurrentModelInvocationContext();
    return json(
      current
        ? {
            ...current,
            statusSink: current.statusSink ? "synthetic-sink" : undefined,
            modelRequestAdmission: current.modelRequestAdmission
              ? "synthetic-admission"
              : undefined,
          }
        : null,
    );
  };
  const model = {
    providerId: "fictional-provider",
    modelId: "fictional-model",
    options: {},
    properties: { supportsNativeWebSearch: c.supported ?? true },
    optionSpecs: {
      reasoningLevel: { values: c.levels ?? ["low", "high"] },
      maxOutputTokens: { max: c.maxTokens ?? 9000 },
    },
    bind() {
      return model;
    },
    generateText() {
      throw new Error("Synthetic guard: non-stream model call is forbidden");
    },
    streamText(request: ModelRequest) {
      requests.push(request);
      calls.push({
        receiver: this === model,
        keys: Object.keys(request),
        request: json({ ...request, abortSignal: "synthetic-signal" }),
        signalIdentity: request.abortSignal === controller.signal,
        scope: scope(),
      });
      if (c.startFailure !== undefined) throw c.startFailure;
      return {
        [Symbol.asyncIterator]() {
          iterations.push({ phase: "iterator", scope: scope() });
          const iterator = {
            async next() {
              iterations.push({
                phase: "next",
                index,
                receiver: this === iterator,
                scope: scope(),
              });
              if (c.iteratorFailure !== undefined && index === (c.iteratorFailureAt ?? 0))
                throw c.iteratorFailure;
              return index < c.events.length
                ? { done: false, value: c.events[index++] as ModelStreamEvent }
                : { done: true, value: undefined };
            },
            async return() {
              iterations.push({ phase: "return", receiver: this === iterator, scope: scope() });
              return { done: true, value: undefined };
            },
          };
          return iterator;
        },
      };
    },
  } as unknown as Model;
  const context = {
    model: c.missingModel ? undefined : model,
    toolCallId: "fictional-search-call",
    traceId: "fictional-trace",
    spanId: "fictional-span",
    parentSpanId: "fictional-parent",
    sessionId: "fictional-session",
    turnId: "fictional-turn",
    abortSignal: controller.signal,
  } as ToolExecutionContext;
  return { model, context, requests, calls, iterations, controller };
}
export async function observeStream(c: StreamCase, candidate = entry) {
  const fixture = streamFixture(c);
  let outcome;
  try {
    const output = await candidate.handler(
      Object.hasOwn(c, "input") ? c.input : valid,
      fixture.context,
    );
    outcome = {
      output,
      outputKeys: Object.keys(output),
      modelContent: candidate.formatModelContent(output),
    };
  } catch (error) {
    outcome = { error: errorShape(error), thrownValue: error instanceof Error ? undefined : error };
  }
  return json({ ...outcome, calls: fixture.calls, iterations: fixture.iterations });
}
export async function observeProjection(result: unknown, candidate = projection) {
  try {
    const output = candidate.buildWebSearchOutput(valid, result, date - 42);
    return json({
      output,
      outputKeys: Object.keys(output),
      modelContent: candidate.formatWebSearchModelContent(output),
    });
  } catch (error) {
    return { error: errorShape(error) };
  }
}
export function executorFixture(c: StreamCase = { label: "executor", events: [] }) {
  const direct = streamFixture(c);
  const { handler, ...declaration } = entry;
  const fixture = invocation(declaration);
  fixture.behavior.handler = handler;
  fixture.deps.model = direct.context.model;
  fixture.call.input = Object.hasOwn(c, "input") ? c.input : valid;
  return {
    ...fixture,
    direct,
    execute: (options?: Parameters<typeof fixture.run>[0]) => fixture.run(options, executeToolCall),
  };
}
export async function observeExecutor(c: StreamCase) {
  const fixture = executorFixture(c);
  const result = await fixture.execute({ traceContext: { traceId: "fictional-executor-trace" } });
  const span = fixture.observed.contexts[0]?.spanId;
  const propagated = [...fixture.direct.calls, ...fixture.direct.iterations].filter(
    (record) => record.scope?.traceContext !== undefined,
  );
  const spanIdentity = propagated.every((record) => record.scope.traceContext.spanId === span);
  for (const record of propagated) record.scope.traceContext.spanId = "synthetic-generated-span";
  return json({
    success: result.success,
    output: result.output,
    modelContent: result.modelContent,
    error: result.error ? errorShape(result.error) : undefined,
    timeline: fixture.timeline,
    eventTypes: fixture.events.map((event) => event.type),
    calls: fixture.direct.calls,
    iterations: fixture.direct.iterations,
    generatedSpan:
      span === undefined
        ? undefined
        : { present: typeof span === "string" && span.length > 0, spanIdentity },
  });
}
export async function observeReads(kind: "request" | "projection" | "events") {
  const reads: string[] = [];
  const watch = (object: any, name: string, label: string) => {
    const value = object[name];
    Object.defineProperty(object, name, {
      configurable: true,
      get() {
        reads.push(label);
        return value;
      },
    });
  };
  if (kind === "projection") {
    const leaf = {
      url: "https://example.invalid/a",
      title: "Example",
      type: "url",
      pageAge: "today",
    };
    for (const key of Object.keys(leaf)) watch(leaf, key, `leaf.${key}`);
    const source = { sourceType: "url", url: "https://example.invalid/b", title: "Model" };
    for (const key of Object.keys(source)) watch(source, key, `source.${key}`);
    const result = {
      text: " [Summary](https://example.invalid/c) ",
      usage: { inputTokens: 2 },
      toolResults: [{ output: leaf }],
      sources: [source],
    };
    for (const key of Object.keys(result)) watch(result, key, `result.${key}`);
    const output = await observeProjection(result);
    return { ...output, reads };
  }
  const events = [
    { type: "text_delta", text: "a" },
    { type: "tool_call", toolCall: { id: "synthetic" } },
    { type: "finish", finishReason: "stop", usage: { totalTokens: 2 }, providerMetadata: {} },
  ];
  if (kind === "events")
    for (const [index, event] of events.entries())
      for (const key of Object.keys(event)) watch(event, key, `${index}.${key}`);
  const fixture = streamFixture({ label: "read-order", events });
  const input = {
    query: "fictional query",
    allowed_domains: ["example.invalid"],
    blocked_domains: [],
    maxUses: 2,
  };
  if (kind === "request") {
    for (const key of Object.keys(input)) watch(input, key, `input.${key}`);
    const specs = fixture.model.optionSpecs;
    watch(specs.reasoningLevel, "values", "specs.reasoning.values");
    watch(specs.maxOutputTokens, "max", "specs.tokens.max");
    watch(specs, "reasoningLevel", "specs.reasoning");
    watch(specs, "maxOutputTokens", "specs.tokens");
    watch(fixture.model.properties, "supportsNativeWebSearch", "properties.native");
    watch(fixture.model, "properties", "model.properties");
    watch(fixture.model, "optionSpecs", "model.optionSpecs");
    for (const key of Object.keys(fixture.context)) watch(fixture.context, key, `context.${key}`);
  }
  const output = await entry.handler(input, fixture.context);
  return json({ output, reads });
}
