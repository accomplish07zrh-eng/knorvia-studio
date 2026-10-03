import {
  DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
  resolveExecutionState,
} from "@knorvia/shared";
import {
  createDenyPermissionBroker,
  createRootTraceContext,
  createToolRegistry,
  defaultPermissionConfig,
  EventReducer,
  MessageHistoryImpl,
  PermissionService,
  ToolScheduler,
  traceContextToLogContext,
} from "./deps.js";
import type { SessionId } from "./deps.js";
import { createRuntimeCommandQueue } from "./command-queue.js";
import { initializeRuntimeTooling } from "./helpers/runtime-tools.js";
import type { AgentRuntimeConfig, AgentRuntimeDeps } from "./types.js";
import type { AgentRuntimeInternal } from "./internal.js";
import { InMemoryRuntimeTaskRegistry } from "../runtime-task/registry.js";
import { projectPersistentAgentMemoryTools } from "../subagent/persistent-memory.js";
import { RuntimeTelemetryFacade } from "../telemetry/runtime-telemetry.js";
import { disposeNodeReplSession } from "../tool/handlers/node-repl.js";
import { cloneModelSelection } from "./model-selection.js";

export function initializeAgentRuntime(
  this: AgentRuntimeInternal,
  sessionId: SessionId,
  config: AgentRuntimeConfig,
  deps: AgentRuntimeDeps,
): void {
  this.sessionId = sessionId;
  this.turnNumber = 0;
  this.config = projectPersistentAgentMemoryTools({
    ...config,
    modelContextBudgetStrategy: DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
  });
  Object.assign(this.config, resolveExecutionState(config));

  this.agentTelemetry = new RuntimeTelemetryFacade({
    agentName: config.agentName,
    causation: deps.agentTelemetryCausation,
    causationMode: deps.agentTelemetryCausationMode,
    parentSessionId: config.parentSessionId,
    port: deps.agentTelemetry,
    sessionId,
    taskType: config.taskType,
  });

  this.permissionService =
    deps.permissionService ?? new PermissionService(defaultPermissionConfig);
  this.permissionBroker = deps.permissionBroker ?? createDenyPermissionBroker();
  this.toolScheduler =
    deps.toolScheduler ??
    new ToolScheduler({
      maxConcurrency: this.config.toolConcurrency?.maxConcurrency,
    });
  this.eventReducer = new EventReducer();
  this.eventStore = deps.eventStore;
  this.sessionStore = deps.sessionStore;
  this.rootTraceContext = deps.traceContext ?? createRootTraceContext({ sessionId });
  this.appVersion = deps.appVersion ?? "0.0.0";

  this.logger = deps.logger?.child({
    ...traceContextToLogContext(this.rootTraceContext),
    module: "core.runtime",
  });
  if (deps.eventSink) {
    this.eventSinks.add(deps.eventSink);
  }
  this.now = deps.now ?? (() => new Date());
  this.isRemoteWorkspace = deps.isRemoteWorkspace ?? (() => false);
  this.modelFactory = deps.modelFactory;
  this.modelIoDir = deps.modelIoDir;
  this.providerRuntimeHeadersPort = deps.providerRuntimeHeadersPort;
  this.browserControlPort = deps.browserControlPort;
  this.modelRequestAdmission = deps.modelRequestAdmission;

  this.sessionModelSelection =
    config.modelSelection && cloneModelSelection(config.modelSelection);
  this.messageHistory = new MessageHistoryImpl();
  this.readFileState = new Map();
  this.runtimeCommandQueue = createRuntimeCommandQueue();
  this.workingDirectory = config.workingDirectory ?? ".";
  this.contextSourcePort = deps.contextSourcePort;
  this.skillPort = deps.skillPort;
  this.mcpPort = deps.mcpPort;
  this.runtimeTaskRegistry =
    deps.runtimeTaskRegistry ?? new InMemoryRuntimeTaskRegistry();
  this.runtimeTaskRegistry.setActiveBranchGeneration?.(this.branchGeneration);

  this.artifactStore = deps.artifactStore;
  this.executionPort = deps.executionPort;
  this.fileSystemPort = deps.fileSystemPort;
  this.imageProcessorPort = deps.imageProcessorPort;
  this.pdfDocumentPort = deps.pdfDocumentPort;
  this.subagentPort = deps.subagentPort ?? this.createDefaultSubagentPort(deps);
  this.dynamicWorkflowRunPort = deps.dynamicWorkflowRunPort;
  this.modelCatalogPort = deps.modelCatalogPort;
  this.registry = deps.toolRegistry ?? createToolRegistry();
  this.workspaceRoot = this.workingDirectory;

  const tooling = initializeRuntimeTooling(this, deps, sessionId);
  this.hookRunner = tooling.hookRunner;
  this.workspaceHookAdmission = deps.workspaceHookAdmission;
  this.executor = tooling.executor;

  this.contextBuilder = deps.contextBuilder ?? null;
  if (this.contextBuilder) {
    this.initializeMessageHistoryFromContext(this.contextBuilder, this.rootTraceContext);
    this.contextInitialized = true;
  }
  this.startMcpStartup(this.rootTraceContext);
}

export function beginShutdown(this: AgentRuntimeInternal): void {
  this.shuttingDown = true;
  this.memoryExtractionScheduler?.shutdown();
}

export async function closeBrowserSession(this: AgentRuntimeInternal): Promise<void> {
  this.beginShutdown();
  disposeNodeReplSession(this.sessionId);
  try {
    await this.browserControlPort?.closeSession?.({
      sessionId: this.sessionId,
      traceContext: this.rootTraceContext,
    });
  } catch (error) {
    this.logger?.warn("Browser session cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
      event: "browser.session_cleanup.failed",
    });
  }
}
