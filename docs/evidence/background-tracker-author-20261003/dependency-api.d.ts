// Logical module: tool/executor/background-task-registry.js
import type {
  ExecutionPort,
  DynamicWorkflowRunSnapshot,
  SubagentTaskSnapshot,
  WorkflowTaskSnapshot,
} from "@knorvia/contracts";
import { type RuntimeTaskSnapshot } from "../../runtime-task/registry.js";
import type { ExecutableToolCall } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
type BackgroundTaskSnapshot =
  | NonNullable<Awaited<ReturnType<NonNullable<ExecutionPort["getBackgroundTask"]>>>>
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot
  | DynamicWorkflowRunSnapshot;
export declare function isDynamicWorkflowRunDispatchToolName(name: string): boolean;
export declare function registerRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  output: Record<string, unknown>,
  turnId?: RuntimeTaskSnapshot["turnId"],
): void;
export declare function updateRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: BackgroundTaskSnapshot,
): void;
export declare function claimRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): boolean;
export declare function releaseRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void;
export declare function removeRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void;
export {};

// Logical module: tool/executor/background-task-output.js
interface BackgroundTaskOutputMetadata {
  childSessionId?: string;
  outputBytes?: number;
  outputFile?: string;
  outputTail?: string;
  outputTruncated?: boolean;
  stderrBytes?: number;
  stderrFile?: string;
  stderrTail?: string;
  stdoutBytes?: number;
  stdoutFile?: string;
  stdoutTail?: string;
}
export declare function backgroundTaskOutputMetadata(
  snapshot: object | undefined,
  launchOutput?: Record<string, unknown>,
): BackgroundTaskOutputMetadata;
export {};

// Logical module: tool/executor/workflow-artifact.js
import { serializeWorkflowArtifact } from "@knorvia/contracts";
export { serializeWorkflowArtifact };
interface WorkflowReportsNotificationSection {
  count: number;
  shown: number;
  preview: string;
}
export declare function buildWorkflowReportsNotificationSection(
  items: readonly unknown[] | undefined,
): WorkflowReportsNotificationSection | undefined;
export declare function buildWorkflowReportsManifestSection(items: readonly unknown[] | undefined):
  | {
      count: number;
      shown: number;
      preview: string[];
    }
  | undefined;

// Logical module: tool/executor/workflow-published-artifacts.js
interface PublishedArtifactSummary {
  id: string;
  kind: string;
  version: number;
  title?: string;
  contentType?: string;
  bytes?: number;
  itemCount?: number;
  primary?: true;
  description?: string;
}
export declare const WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES = 8;
export declare const WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES = 32;
export declare function formatPublishedArtifactLine(artifact: PublishedArtifactSummary): string;
interface WorkflowArtifactsNotificationSection {
  count: number;
  shown: number;
  preview: string;
}
export declare function buildWorkflowArtifactsNotificationSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
  maxLines: number,
): WorkflowArtifactsNotificationSection | undefined;
interface WorkflowArtifactManifestEntry {
  id: string;
  kind: "file" | "markdown" | "chart" | "table" | "metrics" | "board";
  title?: string;
  version: number;
  contentType?: string;
  primary?: true;
  description?: string;
}
export declare function buildWorkflowArtifactsManifestSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
):
  | {
      artifacts: WorkflowArtifactManifestEntry[];
      artifactsTruncated?: true;
    }
  | undefined;
export declare function toPublishedArtifactSummaries(
  value: unknown,
): PublishedArtifactSummary[] | undefined;
export {};

// Logical module: runtime-task/notification.js
import type {
  DynamicWorkflowRunError,
  DynamicWorkflowRunLifecycleStatus,
  DynamicWorkflowRunStopReason,
  ModelUsage,
} from "@knorvia/contracts";
import type { RuntimeTaskType } from "./registry.js";
export {
  formatWorkflowEscalationNotification,
  formatWorkflowProviderStopError,
  formatWorkflowStallNotification,
  type WorkflowEscalationNotificationInput,
  type WorkflowStallNotificationInput,
} from "./workflow-notification-copy.js";
export interface TaskNotificationInput {
  agentId?: string;
  description?: string;
  error?: string;
  outputFile?: string;
  reports?: {
    count: number;
    preview: string;
    shown: number;
  };
  artifacts?: {
    count: number;
    preview: string;
    shown: number;
  };
  deliveryGuidance?: boolean;
  result?: string;
  status: string;
  runStatus?: Extract<DynamicWorkflowRunLifecycleStatus, "completed" | "errored" | "stopped">;
  stopReason?: DynamicWorkflowRunStopReason;
  scriptPath?: string;
  failure?: DynamicWorkflowRunError;
  stderrFile?: string;
  stdoutFile?: string;
  subagentType?: string;
  summary: string;
  taskId: string;
  taskType: RuntimeTaskType;
  toolUseId?: string;
  usage?: {
    durationMs?: number;
    modelUsage?: ModelUsage;
    toolUseCount?: number;
    totalTokens?: number;
  };
}
export declare function formatTaskNotification(input: TaskNotificationInput): string;
export declare function truncateTaskNotification(value: string): string;
export declare function escapeXml(value: string): string;

// Logical module: runtime-task/workflow-notification-copy.js
import type { DynamicWorkflowRunError } from "@knorvia/contracts";
export declare function formatWorkflowProviderStopError(
  failure: DynamicWorkflowRunError,
  runId: string,
): string;
export interface WorkflowStallNotificationInput {
  runLabel: string;
  runId: string;
  sinceMs: number;
  reason?: string;
  cap?: number;
}
export declare function formatWorkflowStallNotification(
  input: WorkflowStallNotificationInput,
): string;
export interface WorkflowEscalationNotificationInput {
  runLabel: string;
  runId: string;
  qid: string;
  actor: string;
  question: string;
  context?: string;
}
export declare function formatWorkflowEscalationNotification(
  input: WorkflowEscalationNotificationInput,
): string;

// Logical module: tool/compat.js
export declare const TASK_TOOL_NAME = "Task";
export declare function isSubagentDispatchToolName(toolName: string | undefined): boolean;
export declare function hookMatcherToolNamesForTool(toolName: string): readonly string[];

// Logical module: tool/executor/utils.js
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function summarizeInput(input: unknown): Record<string, unknown>;
export declare function previewHookValue(value: unknown): string;

// Logical module: tool/handlers/workflow-script-path.js
export declare function describeWorkflowScriptPath(
  absolutePath: string,
  cwd: string | undefined,
): string;
