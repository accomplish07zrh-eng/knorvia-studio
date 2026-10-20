// SPDX-License-Identifier: Apache-2.0
// OTel SDK 的装配层。
//
// 只在 prepared-owner 确认启用后动态 import —— 不能进包入口的静态依赖图，
// 否则 --help、版本查询与 disabled 模式都要付 SDK 初始化成本。
//
// 分工：导出端的数据（边界表、资源属性）在 exporter-config；本模块只做装配与开关状态。
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
} from "@opentelemetry/sdk-trace-base";
import {
  TELEMETRY_SCHEMA_VERSION,
  type AgentTelemetryRuntimeOwner,
} from "@knorvia/contracts/telemetry";
import type { CreateOwnedAgentTelemetryRuntimeOptions } from "./exporter-contract.js";
import { metricViews, resourceAttributes } from "./exporter-config.js";
import {
  AgentExecutionTelemetryRuntime,
  type AgentTraceRuntimeOptions,
} from "./agent-trace-runtime.js";
import { OtelAgentTelemetryMetrics } from "./agent-metrics.js";
import { ModelApiTelemetryStatusSink } from "./model-api-recorder.js";
import type { ModelApiTelemetryStatusSinkOptions } from "./model-contract.js";

export type { CreateOwnedAgentTelemetryRuntimeOptions };

/** 导出节奏、采样与超时的默认值。 */
const METRIC_INTERVAL_MS = 300_000;
const SAMPLE_RATIO = 0.1;
const TIMEOUT_MS = 3_000;
/** Batch processor 的队列参数。 */
const BATCH = { delayMs: 5_000, maxQueue: 2_000, maxSize: 100 } as const;

/** 两套 Provider 与它们的 Context Manager。 */
interface Providers {
  contextManager: AsyncLocalStorageContextManager;
  meterProvider: MeterProvider;
  provider: BasicTracerProvider;
  registered: boolean;
}

/**
 * 构造进程级 Owner。
 * 关闭顺序：先停 statusSink 与活跃 writer，再并行关两个 Provider；
 * 注册成功的 Context Manager 在最后 disable，注册失败的那份立即 disable。
 */
export function createOwnedAgentTelemetryRuntime(
  options: CreateOwnedAgentTelemetryRuntimeOptions,
): AgentTelemetryRuntimeOwner {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const providers = buildProviders(options, timeoutMs);
  const scope = {
    name: "@knorvia/cli-agent-telemetry",
    version: String(TELEMETRY_SCHEMA_VERSION),
  };
  const metrics = new OtelAgentTelemetryMetrics(
    providers.meterProvider.getMeter(scope.name, scope.version),
  );
  const execution = new AgentExecutionTelemetryRuntime(
    runtimeOptions(options, providers.provider.getTracer(scope.name, scope.version), metrics),
  );
  // statusSink 与 execution 共用同一个 Port：模型侧的状态映射直接写进 agent 侧 Span。
  const statusSink = new ModelApiTelemetryStatusSink(sinkOptions(execution, options.onWarning));
  return buildOwner({ execution, providers, statusSink, timeoutMs });
}

/** runtime 的构造入参：身份、指标出口与告警口都直接透传。 */
function runtimeOptions(
  options: CreateOwnedAgentTelemetryRuntimeOptions,
  tracer: Parameters<typeof AgentExecutionTelemetryRuntime.prototype.startTurn>[0] extends never
    ? never
    : NonNullable<AgentTraceRuntimeOptions["tracer"]>,
  metrics: OtelAgentTelemetryMetrics,
): AgentTraceRuntimeOptions {
  return { identity: options.identity, metrics, onWarning: options.onWarning, tracer };
}

/** statusSink 的构造入参。 */
function sinkOptions(
  execution: AgentExecutionTelemetryRuntime,
  onWarning: CreateOwnedAgentTelemetryRuntimeOptions["onWarning"],
): ModelApiTelemetryStatusSinkOptions {
  return { modelExecution: execution, onWarning };
}

/** Owner 对象：把 Provider、execution 与 statusSink 接成契约面。 */
function buildOwner(input: {
  execution: AgentExecutionTelemetryRuntime;
  providers: Providers;
  statusSink: ModelApiTelemetryStatusSink;
  timeoutMs: number;
}): AgentTelemetryRuntimeOwner {
  const { execution, providers, statusSink, timeoutMs } = input;
  const lifecycle = new OwnerLifecycle(providers, timeoutMs);
  // 契约面的五个成员逐个赋值：owner 只有这一处构造，读起来即全部对外行为。
  const owner: AgentTelemetryRuntimeOwner = {
    enabled: true,
    abandonSession: (sessionId) => {
      // 两侧各有在册 writer：先放弃 execution 的，再放弃 statusSink 的。
      execution.abandonSession(sessionId);
      statusSink.abandonSession(sessionId);
    },
    flush: (flushOptions) => lifecycle.flush(flushOptions?.timeoutMs),
    shutdown: async (shutdownOptions) => {
      // 先停 statusSink 与活跃 writer，再关 Provider：顺序固定，避免把已放弃的 Span 刷出去。
      statusSink.shutdown();
      execution.abandonProcess();
      await lifecycle.shutdown(shutdownOptions?.timeoutMs);
    },
    updateIdentity: (snapshot) => execution.updateIdentity(snapshot),
  } as AgentTelemetryRuntimeOwner;
  Object.assign(owner, { agentExecution: execution, modelExecution: execution, statusSink });
  return owner;
}

/**
 * Owner 的开关状态。
 * `closed` 是唯一的闩锁：flush 与 shutdown 都以它为界，重复调用无副作用。
 */
class OwnerLifecycle {
  readonly #providers: Providers;
  readonly #timeoutMs: number;
  #closed = false;

  constructor(providers: Providers, timeoutMs: number) {
    this.#providers = providers;
    this.#timeoutMs = timeoutMs;
  }

  /** 刷写：关闭后是空操作，超时静默。 */
  async flush(timeoutOverride: number | undefined): Promise<void> {
    if (this.#closed) return;
    await settle(
      Promise.all([
        this.#providers.provider.forceFlush(),
        this.#providers.meterProvider.forceFlush(),
      ]),
      timeoutOverride ?? this.#timeoutMs,
    );
  }

  /** 关闭：两个 Provider 并行关；注册成功的 Context Manager 最后 disable。 */
  async shutdown(timeoutOverride: number | undefined): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await settle(
        Promise.all([
          this.#providers.provider.shutdown(),
          this.#providers.meterProvider.shutdown(),
        ]),
        timeoutOverride ?? this.#timeoutMs,
      );
    } finally {
      if (this.#providers.registered) this.#providers.contextManager.disable();
    }
  }
}

/** Trace 与 Metric 两套 Provider 的装配；资源属性分别按「是否含每进程 ID」区分。 */
function buildProviders(
  options: CreateOwnedAgentTelemetryRuntimeOptions,
  timeoutMs: number,
): Providers {
  const spanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter(transportOf(options.endpoint, options.headers, timeoutMs)),
    {
      exportTimeoutMillis: timeoutMs,
      maxExportBatchSize: options.maxBatchSize ?? BATCH.maxSize,
      maxQueueSize: options.maxQueueSize ?? BATCH.maxQueue,
      scheduledDelayMillis: BATCH.delayMs,
    },
  );
  const provider = tracerProviderOf(spanProcessor, options, timeoutMs);
  const meterProvider = meterProviderOf(
    new OTLPMetricExporter({
      ...transportOf(
        options.metricEndpoint ?? options.endpoint,
        options.metricHeaders ?? options.headers,
        timeoutMs,
      ),
      // CLI 每次启动都是新生产者；DELTA 让后端按增量读数，不受进程重启影响。
      temporalityPreference: AggregationTemporality.DELTA,
    }),
    options,
    timeoutMs,
  );
  const contextManager = new AsyncLocalStorageContextManager();
  const registered = context.setGlobalContextManager(contextManager.enable());
  // 宿主已注册过 Context Manager 时复用宿主实例；本实例立即关闭，避免两套 ALS。
  if (!registered) contextManager.disable();
  return { contextManager, meterProvider, provider, registered };
}

/** Trace Provider：采样器、资源属性与批处理器一次装好。 */
function tracerProviderOf(
  spanProcessor: BatchSpanProcessor,
  options: CreateOwnedAgentTelemetryRuntimeOptions,
  timeoutMs: number,
): BasicTracerProvider {
  return new BasicTracerProvider({
    forceFlushTimeoutMillis: timeoutMs,
    resource: resourceFromAttributes(resourceAttributes(options.resource, true)),
    sampler: rootSampler(options.traceSampleRatio),
    spanProcessors: [spanProcessor],
  });
}

/** Metric Provider：一个周期 reader + 视图表；资源属性不含每进程 ID。 */
function meterProviderOf(
  metricExporter: OTLPMetricExporter,
  options: CreateOwnedAgentTelemetryRuntimeOptions,
  timeoutMs: number,
): MeterProvider {
  const reader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: options.metricExportIntervalMs ?? METRIC_INTERVAL_MS,
    exportTimeoutMillis: timeoutMs,
  });
  return new MeterProvider({
    readers: [reader],
    resource: resourceFromAttributes(resourceAttributes(options.resource, false)),
    views: metricViews(),
  });
}

/**
 * 两种 OTLP Exporter 共用的传输参数：GZIP、header、超时与 URL。
 * 抽出来是因为 trace 与 metric 两侧的这四项语义完全相同。
 */
function transportOf(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMillis: number,
): {
  compression: CompressionAlgorithm;
  headers?: Record<string, string>;
  timeoutMillis: number;
  url: string;
} {
  return { compression: CompressionAlgorithm.GZIP, headers, timeoutMillis, url };
}

/** 根 Span 采样：父级已采样则跟随，根按给定比例。 */
function rootSampler(ratio = SAMPLE_RATIO): Sampler {
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
}

/** 带超时的等待：超时不报错，只是停止等待（关闭/刷写不能因此失败）。 */
async function settle<T>(work: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: number | undefined;
  const expiry = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
