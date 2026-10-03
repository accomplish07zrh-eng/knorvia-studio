import type {
  AgentExecutionTelemetryPort,
  AgentTelemetryActorKind,
  BackgroundResultOriginMeta,
  CollaborationMode,
  CoordinatorResponsePort,
  DynamicWorkflowRunPort,
  DynamicWorkflowSnippetPort,
  ModelCatalogPort,
  EmbeddedSearchBackend,
  ExecutionPort,
  BrowserControlPort,
  ExecutionShellSelection,
  AutomationPort,
  OffPeakPort,
  FileSystemPort,
  HttpClientPort,
  ImageProcessorPort,
  PdfDocumentPort,
  Logger,
  Model,
  PermissionBrokerPort,
  SessionEvent,
  SessionId,
  SessionModePort,
  SessionStorePort,
  SkillPort,
  SubagentRunOptions,
  SubagentPort,
  ToolArtifactStorePort,
  TraceContext,
  TurnId,
  WorkflowPort,
  WorkflowEscalatePort,
  WorkflowSubmitPort,
} from "@knorvia/contracts";
import type { HookRunner } from "../../hooks/index.js";
import type { PermissionService } from "../../permission/service.js";
import type { RuntimeTaskRegistry } from "../../runtime-task/registry.js";
import type { ToolRegistry } from "../registry.js";
import type { ToolSchedule } from "../scheduler.js";
import type {
  ExecutableToolCall,
  ReadFileStateMap,
  ToolBatchEvent,
  BackgroundTaskControlPort,
  ToolExecutionResult,
  ToolRuntimeScope,
} from "../types.js";
export interface BackgroundTaskNotificationCommand {
  originMeta?: BackgroundResultOriginMeta;
  taskId?: string;
  text: string;
  toolName?: string;
  traceContext: TraceContext;
}
export type EnqueueBackgroundTaskNotification = (
  notification: BackgroundTaskNotificationCommand,
) => undefined;
export interface BackgroundTaskNotificationPolicyInput {
  runtimeScope: ToolRuntimeScope;
  status: string;
  taskId: string;
  toolName: string;
  traceContext: TraceContext;
}
export type ShouldEnqueueBackgroundTaskNotification = (
  input: BackgroundTaskNotificationPolicyInput,
) => boolean;
export interface ToolExecutorDeps {
  agentTelemetry?: AgentExecutionTelemetryPort;
  agentTelemetryActorKind?: AgentTelemetryActorKind;
  registry: ToolRegistry;
  permissionService: PermissionService;
  permissionBroker: PermissionBrokerPort;
  emitEvent: (event: SessionEvent) => Promise<void>;
  enqueueBackgroundTaskNotification?: EnqueueBackgroundTaskNotification;
  shouldEnqueueBackgroundTaskNotification?: ShouldEnqueueBackgroundTaskNotification;
  sessionId: SessionId;
  turnId?: TurnId;
  defaultTimeoutMs: number;
  permissionTimeoutMs?: number;
  logger?: Logger;
  backgroundTaskControlPort?: BackgroundTaskControlPort;
  executionPort?: ExecutionPort;
  browserControlPort?: BrowserControlPort;
  browserDocumentationRoot?: string;
  fileSystemPort?: FileSystemPort;
  httpClientPort?: HttpClientPort;
  imageProcessorPort?: ImageProcessorPort;
  pdfDocumentPort?: PdfDocumentPort;
  model?: Model;
  embeddedSearchBackend?: EmbeddedSearchBackend;
  nativeSearchEnhancementsEnabled?: boolean;
  skillPort?: SkillPort;
  subagentPort?: SubagentPort;
  coordinatorResponsePort?: CoordinatorResponsePort;
  workflowSubmitPort?: WorkflowSubmitPort;
  workflowEscalatePort?: WorkflowEscalatePort;
  artifactStore?: ToolArtifactStorePort;
  automationPort?: AutomationPort;
  offPeakPort?: OffPeakPort;
  sessionStore?: SessionStorePort;
  sessionModePort?: SessionModePort;
  workflowPort?: WorkflowPort;
  dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
  dynamicWorkflowSnippetPort?: DynamicWorkflowSnippetPort;
  modelCatalogPort?: ModelCatalogPort;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  readFileState: ReadFileStateMap;
  subagentBackgroundBashMaxMs?: number;
  bashShellSelection?: ExecutionShellSelection;
  getBashShellSelection?: () => ExecutionShellSelection | undefined;
  getWorkingDirectory: () => string;
  setWorkingDirectory?: (cwd: string) => Promise<void> | void;
  getWorkspaceRoot: () => string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  clientMode?: "desktop-continuous" | "web-remote-replayable";
  deliveryKind?: "desktop-continuous" | "web-remote-replayable";
  getMemoryRoot?: () => string | undefined;
  runtimeScope: ToolRuntimeScope;
  traceContext?: TraceContext;
  getMode: () => CollaborationMode;
  maxConcurrency: number;
  hookRunner?: HookRunner;
}
