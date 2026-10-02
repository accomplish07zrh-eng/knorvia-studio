// Curated public port types only; no implementation bodies.
interface ObservedRuntimePorts {
  registry: ToolRegistry;
  scheduleTools: (toolCalls: ModelToolCall[]) => Promise<ToolSchedule>;
  toScheduleState: (schedule: ToolSchedule) => ToolScheduleState;
  emitToolScheduledEvents: (toolCalls: ModelToolCall[], schedule: ToolSchedule, assistantMessageId: MessageId, traceContext: TraceContext) => Promise<SessionEvent[]>;
  logger: Logger | undefined;
  executeTools: (toolCalls: ModelToolCall[], schedule: ToolSchedule, options?: ExecuteToolsOptions | undefined) => Promise<ExecuteToolsResult>;
  persistPart: (input: MessagePart, traceContext: TraceContext, copyFrom?: { sessionID: SessionId; id: string; } | undefined) => Promise<void>;
  sessionId: SessionId;
  artifactStore: ToolArtifactStorePort | undefined;
  sessionStore: SessionStorePort | undefined;
  emitFileMutationCheckpoint: (options: { abortSignal?: AbortSignal | undefined; events: SessionEvent[]; messageId: MessageId; result: ToolExecutionResult; toolMessageId?: MessageId | undefined; traceContext: TraceContext; }) => Promise<void>;
  fallbackPendingGuidesToQueue: (options: { activeTurn: ActiveTurnSteeringState; events?: SessionEvent[] | undefined; reasonCode: "guide.noToolBoundary" | "guide.turnInterrupted"; traceContext: TraceContext; }) => Promise<number>;
  messageHistory: MessageHistory;
  steerTurn: (input: string | TurnSteerInput) => Promise<TurnSteerResult>;
}
