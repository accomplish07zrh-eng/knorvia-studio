interface ObservedRuntimePorts {
  agentTelemetry: RuntimeTelemetryFacade;
  config: AgentRuntimeConfig;
  logModelRequestSteeringContext: (options: { activeTurn?: ActiveTurnSteeringState | undefined; drained?: DrainedPendingInputDiagnostics | undefined; messages: ModelInputMessage[]; modelStepCount: number; traceContext: TraceContext; }) => void;
  persistAssistantMessage: (messageID: MessageId, parentID: MessageId, created: number, update: { completed?: number | undefined; error?: { name: string; data?: Record<string, unknown> | undefined; } | undefined; finish?: string | undefined; tokens?: unknown; } | undefined, traceContext: TraceContext, model?: Model | undefined) => Promise<void>;
  persistPart: (input: MessagePart, traceContext: TraceContext, copyFrom?: { sessionID: SessionId; id: string; } | undefined) => Promise<void>;
  sessionId: SessionId;
  createEvent: (type: SessionEventType, payload: unknown, traceContext: TraceContext) => SessionEvent;
  appendEvent: (event: SessionEvent, traceContext: TraceContext) => Promise<void>;
  runModelTextRequest: (options: RunModelTextRequestOptions) => Promise<RuntimeModelTextResult>;
  turnNumber: number;
  logger: Logger | undefined;
  messageHistory: MessageHistory;
  extractToolCallsFromResult: (result: any) => ModelToolCall[];
  currentTurnFileChanges: RuntimeTurnFileChangeMap;
  lastAssistantCompletedAtMs: number | undefined;
  reactiveCompactAfterContextExceeded: (originalError: unknown, turnTraceContext: TraceContext, events: SessionEvent[], abortSignal: AbortSignal | undefined, context: ReactiveCompactLoopContext) => Promise<CompactAttemptOutcome>;
}
