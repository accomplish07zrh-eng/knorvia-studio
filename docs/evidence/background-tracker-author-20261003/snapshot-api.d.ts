// Supporting contract declarations only; imports and referenced types belong to @knorvia/contracts.

// @knorvia/contracts/interfaces/execution.port.ts
export type BackgroundExecutionStatus = "running" | ExecutionStatus;
export interface BackgroundExecutionSnapshot {
  taskId: string;
  status: BackgroundExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  pid?: number;
  stderrBytes?: number;
  stderrTail?: string;
  stdoutBytes?: number;
  stdoutTail?: string;
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
  result?: ExecutionResult;
  error?: ExecutionFailure;
}
export interface ExecutionPort {
  run(request: ExecutionRequest, options?: ExecutionRunOptions): Promise<ExecutionResult>;
  start?(
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ): Promise<BackgroundExecutionStartResult>;
  getBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  readBackgroundBashOutput?(taskId: string, sessionId: string): Promise<BackgroundBashOutputResult>;
  cancelBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  close?(): Promise<void>;
}

// @knorvia/contracts/interfaces/subagent.port.ts
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
export interface SubagentPort {
  launch(request: SubagentLaunchRequest, options?: SubagentLaunchOptions): Promise<AgentOutput>;
  run(request: SubagentRunRequest, options?: SubagentRunOptions): Promise<AgentOutput>;
  start?(
    request: SubagentStartRequest,
    options?: SubagentStartOptions,
  ): Promise<AgentBackgroundedOutput>;
  backgroundTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
  getTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
  waitForTask?(
    taskId: string,
    options?: SubagentWaitOptions,
  ): Promise<SubagentTaskSnapshot | undefined>;
  stopTask?(
    taskId: string,
    options?: SubagentStopOptions,
  ): Promise<SubagentTaskSnapshot | undefined>;
  sendMessage?(
    request: SubagentSendMessageRequest,
    options?: SubagentSendMessageOptions,
  ): Promise<SubagentSendMessageResult>;
}

// @knorvia/contracts/interfaces/workflow.port.ts
export type WorkflowTaskStatus = "running" | "completed" | "failed" | "cancelled" | "lost";
export interface WorkflowTaskSnapshot {
  completedAt?: Date;
  description?: string;
  error?: string;
  name?: string;
  output?: WorkflowOutput;
  runId: string;
  startedAt: Date;
  status: WorkflowTaskStatus;
  taskId: string;
}
export interface WorkflowPort {
  start(request: WorkflowStartRequest, options?: WorkflowStartOptions): Promise<WorkflowOutput>;
  getTask?(taskId: string): Promise<WorkflowTaskSnapshot | undefined>;
  waitForTask?(
    taskId: string,
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<WorkflowTaskSnapshot | undefined>;
}

// @knorvia/contracts/interfaces/dynamic-workflow-run.port.ts
export type DynamicWorkflowRunSnapshot = Omit<WorkflowTaskSnapshot, "output"> & {
  output?: unknown;
  runStatus?: DynamicWorkflowRunLifecycleStatus;
  stopReason?: DynamicWorkflowRunStopReason;
  parentSessionId?: string;
  resumedFrom?: string;
  supersededBy?: string;
  maxConcurrency?: number;
  subagentModel?: string;
  scriptPath?: string;
  failure?: DynamicWorkflowRunError;
  reports?: readonly unknown[];
  pendingQuestions?: readonly DynamicWorkflowRunPendingQuestion[];
  artifacts?: readonly DynamicWorkflowRunArtifact[];
};
export type DynamicWorkflowRunLifecycleStatus =
  | "completed"
  | "errored"
  | "pending"
  | "running"
  | "stopped";
export type DynamicWorkflowRunStopReason =
  | "user"
  | "model"
  | "provider"
  | "interrupted"
  | "superseded";
export interface DynamicWorkflowRunError {
  code: string;
  message: string;
  providerStop?: DynamicWorkflowRunProviderStop;
}
