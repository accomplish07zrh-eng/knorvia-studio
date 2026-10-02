// Curated public port types only; no implementation bodies.
interface ObservedRuntimePorts {
  artifactStore: ToolArtifactStorePort | undefined;
  logger: Logger | undefined;
  config: AgentRuntimeConfig;
  agentTelemetry: RuntimeTelemetryFacade;
  createModelStatusSink: (traceContext: TraceContext, events: SessionEvent[], options?: { onStatus?: ((event: ModelNetworkStatusEvent) => void) | undefined; streamRecovery?: ModelStreamRecoveryStatus | undefined; } | undefined) => ModelStatusSink;
  buildContextUsageSnapshot: (options: RunModelTextRequestOptions) => Record<string, unknown>;
  buildContextUsageBreakdownFromSnapshot: (snapshot: Record<string, unknown>) => ContextUsageBreakdownItem[];
  logContextUsageSnapshot: (options: RunModelTextRequestOptions, snapshot?: Record<string, unknown> | undefined) => void;
  shouldStreamModelText: () => boolean;
}
