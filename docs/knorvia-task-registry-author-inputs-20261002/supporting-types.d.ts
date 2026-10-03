export type SessionId = string & {
  readonly __brand: "SessionId";
};
export type TurnId = string & {
  readonly __brand: "TurnId";
};
export type ToolCallId = string & {
  readonly __brand: "ToolCallId";
};
export type TraceId = string & {
  readonly __brand: "TraceId";
};
export type QueryId = string & {
  readonly __brand: "QueryId";
};
export interface ModelServerToolUsage {
  webSearchRequests?: number;
  webFetchRequests?: number;
}
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  serverToolUse?: ModelServerToolUsage;
}
export type AgentType = string;
export interface AgentTextContentBlock {
  type: "text";
  text: string;
}
export interface AgentCompletedOutput {
  status: "completed";
  agentId: string;
  agentType: AgentType;
  description: string;
  prompt: string;
  content: AgentTextContentBlock[];
  totalToolUseCount: number;
  totalDurationMs: number;
  totalTokens?: number;
  usage?: ModelUsage;
}
export interface AgentBackgroundedOutput {
  status: "async_launched";
  isAsync: true;
  agentId: string;
  agentType: AgentType;
  description: string;
  prompt: string;
  childSessionId: string;
  backgroundTaskId: string;
  outputFile: string;
  canReadOutputFile: boolean;
}
export type AgentOutput = AgentCompletedOutput | AgentBackgroundedOutput;
export type SubagentTaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "killed"
  | "stopped"
  | "lost";
export interface SubagentTaskSnapshot {
  taskId: string;
  agentId: string;
  agentType: string;
  description: string;
  status: SubagentTaskStatus;
  startedAt: Date;
  completedAt?: Date;
  childSessionId?: SessionId;
  parentToolCallId?: ToolCallId | string;
  pid?: number;
  error?: string;
  output?: AgentOutput;
  outputFile?: string;
  notified?: boolean;
}
export interface TraceContext {
  traceId: TraceId;
  queryId?: QueryId;
  spanId?: string;
  parentSpanId?: string;
  parentId?: string;
  sessionId?: SessionId;
  turnId?: TurnId;
  attributes?: Record<string, string | number | boolean>;
}
