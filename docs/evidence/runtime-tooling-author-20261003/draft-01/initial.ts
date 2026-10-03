import {
  createConfiguredHookRunner,
  createInMemoryHookRunner,
  createSessionMailboxHookRegistrations,
  createToolExecutor,
  getCurrentTraceContext,
  registerBuiltInTools,
  traceContextToLogContext,
  type HookRunner,
  type SessionId,
  type ToolExecutor,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { AgentRuntimeDeps } from "../types.js";
import { resolveRuntimeEmbeddedSearchEnabled } from "../methods/embedded-search-branch.js";
import { getSessionShellSelectionFromConfig } from "../methods/session-shell-environment.js";
import { createRuntimeSessionModePort } from "../session-mode-port.js";
import { shouldSuppressSealedSubagentBashNotification } from "../../runtime-task/notification-policy.js";
import {
  resolveBuiltInToolAllowlist,
  resolveRuntimeDisallowedTools,
  resolveRuntimeDynamicWorkflowToolsIncluded,
} from "./tool-allowlist.js";
import { isStaleBranchRuntimeTaskEvent } from "../methods/runtime-command-generation.js";
import { resolveEnabledProjectMemoryRoot } from "./project-memory.js";

const fallbackHookConfig = {
  enabled: false,
  events: {},
  maxOutputBytes: 32768,
  timeoutMs: 60000,
};

export function initializeRuntimeTooling(
  runtime: AgentRuntimeInternal,
  deps: AgentRuntimeDeps,
  sessionId: SessionId,
): { executor: ToolExecutor; hookRunner?: HookRunner } {
  const config = runtime.config;
  const includeNodeRepl = config.runtimeFeatures?.nodeRepl === true;
  const includeBrowserUse =
    config.runtimeFeatures?.browserUse === true &&
    deps.browserControlPort !== undefined;

  registerBuiltInTools(runtime.registry, {
    bashTimeoutPolicy: config.bashTimeoutPolicy,
    includeSkill: Boolean(runtime.skillPort),
    includeAgent: Boolean(runtime.subagentPort),
    includeSendMessage: runtime.subagentPort?.sendMessage !== undefined,
    includeRespondToCoordinator:
      config.taskType === "subagent_child" &&
      Boolean(deps.coordinatorResponsePort),
    includeSubmitResult: Boolean(deps.workflowSubmitPort),
    ...(deps.workflowSubmitSchema === undefined
      ? {}
      : { submitResultSchema: deps.workflowSubmitSchema }),
    includeEscalate: Boolean(deps.workflowEscalatePort),
    includeWorkflow: Boolean(deps.workflowPort),
    includeAutomation:
      Boolean(deps.automationPort) && config.taskType !== "subagent_child",
    includeOffPeak:
      Boolean(deps.offPeakPort) && config.taskType !== "subagent_child",
    includeDynamicWorkflow: resolveRuntimeDynamicWorkflowToolsIncluded(config),
    includeNodeRepl,
    includeBrowserUse,
    embeddedSearchEnabled: resolveRuntimeEmbeddedSearchEnabled(runtime),
    agentProfiles: config.subagents?.profiles,
    allowedTools: resolveBuiltInToolAllowlist(config),
    disallowedTools: resolveRuntimeDisallowedTools(config),
  });

  let hookRunner =
    deps.hookRunner ??
    ((config.hooks?.enabled || deps.workspaceHookSnapshot) && deps.executionPort
      ? createConfiguredHookRunner({
          config: config.hooks ?? fallbackHookConfig,
          emitEvent: async (event) => {
            await runtime.appendEvent(
              event,
              getCurrentTraceContext() ?? runtime.rootTraceContext,
            );
          },
          executionPort: deps.executionPort,
          getWorkingDirectory: () => runtime.workingDirectory,
          logger: runtime.logger,
          workspaceHookAdmission: deps.workspaceHookAdmission,
          workspaceHookSnapshot: deps.workspaceHookSnapshot,
        })
      : undefined);

  if (deps.sessionMailboxPort) {
    hookRunner ??= createInMemoryHookRunner({
      emitEvent: async (event) => {
        if (isStaleBranchRuntimeTaskEvent(runtime, event)) return;
        await runtime.appendEvent(
          event,
          getCurrentTraceContext() ?? runtime.rootTraceContext,
        );
      },
      logger: runtime.logger,
    });

    const mailboxHooks = createSessionMailboxHookRegistrations({
      enqueuePendingInput: async (input, traceContext) => {
        const result = await runtime.steerTurn({
          delivery: "guide",
          expectedTurnId: traceContext.turnId,
          input,
          traceContext,
        });
        if (!result.accepted) {
          runtime.logger?.warn("Session mailbox input was not queued", {
            ...traceContextToLogContext(traceContext),
            event: "session.mailbox.queue_rejected",
            module: "core.runtime",
            reason: result.reason,
            status: "completed",
          });
        }
      },
      mailbox: deps.sessionMailboxPort,
      sessionId,
    });

    for (const hook of mailboxHooks) {
      if ("register" in hookRunner && typeof hookRunner.register === "function") {
        hookRunner.register(hook);
      }
    }
  }

  const executor =
    deps.toolExecutor ??
    (() => {
      const browserEnabled =
        config.runtimeFeatures?.browserUse === true &&
        deps.browserControlPort !== undefined;

      return createToolExecutor({
        agentTelemetry: runtime.agentTelemetry.port,
        agentTelemetryActorKind: runtime.agentTelemetry.actorKind,
        registry: runtime.registry,
        permissionService: runtime.permissionService,
        permissionBroker: runtime.permissionBroker,
        emitEvent: async (event) => {
          await runtime.appendEvent(
            event,
            getCurrentTraceContext() ?? runtime.rootTraceContext,
          );
        },
        enqueueBackgroundTaskNotification: (notification) => {
          runtime.enqueueBackgroundTaskNotification(notification);
        },
        shouldEnqueueBackgroundTaskNotification: (input) => {
          if (runtime.shuttingDown) {
            runtime.logger?.info?.(
              "Suppressed background task notification during runtime shutdown",
              {
                ...traceContextToLogContext(
                  getCurrentTraceContext() ?? runtime.rootTraceContext,
                ),
                event: "runtime.background_task_notification.shutdown_suppressed",
                module: "core.runtime",
                taskId: input.taskId,
                taskStatus: input.status,
                toolName: input.toolName,
              },
            );
            return false;
          }

          const registryTask = runtime.runtimeTaskRegistry.get(input.taskId);
          const suppressed = shouldSuppressSealedSubagentBashNotification({
            isSubagentChildRuntime: config.taskType === "subagent_child",
            notificationSealed: runtime.backgroundTaskNotificationsSealed,
            registryTask,
            toolName: input.toolName,
          });
          if (!suppressed) return true;

          runtime.logger?.info?.(
            "Suppressed sealed subagent background Bash notification",
            {
              ...traceContextToLogContext(
                getCurrentTraceContext() ?? runtime.rootTraceContext,
              ),
              event: "runtime.background_task_notification.suppressed",
              module: "core.runtime",
              reason: runtime.backgroundTaskNotificationSealReason,
              taskId: input.taskId,
              taskStatus: input.status,
              toolName: input.toolName,
            },
          );
          return false;
        },
        logger: runtime.logger,
        backgroundTaskControlPort: {
          stopBackgroundTask: runtime.stopBackgroundTask.bind(runtime),
        },
        executionPort: deps.executionPort,
        browserControlPort: browserEnabled ? deps.browserControlPort : undefined,
        browserDocumentationRoot: browserEnabled
          ? config.runtimeFeatures?.browserDocumentationRoot
          : undefined,
        fileSystemPort: deps.fileSystemPort,
        httpClientPort: deps.httpClientPort,
        imageProcessorPort: deps.imageProcessorPort,
        pdfDocumentPort: deps.pdfDocumentPort,
        embeddedSearchBackend: config.embeddedSearchBackend,
        nativeSearchEnhancementsEnabled: config.nativeSearchEnhancementsEnabled,
        skillPort: deps.skillPort,
        subagentPort: runtime.subagentPort,
        coordinatorResponsePort: deps.coordinatorResponsePort,
        workflowSubmitPort: deps.workflowSubmitPort,
        workflowEscalatePort: deps.workflowEscalatePort,
        artifactStore: deps.artifactStore,
        automationPort: deps.automationPort,
        offPeakPort: deps.offPeakPort,
        sessionStore: deps.sessionStore,
        sessionModePort: createRuntimeSessionModePort(runtime),
        workflowPort: deps.workflowPort,
        dynamicWorkflowRunPort: deps.dynamicWorkflowRunPort,
        dynamicWorkflowSnippetPort: deps.dynamicWorkflowSnippetPort,
        modelCatalogPort: deps.modelCatalogPort,
        runtimeTaskRegistry: runtime.runtimeTaskRegistry,
        readFileState: runtime.readFileState,
        subagentBackgroundBashMaxMs:
          config.taskType === "subagent_child"
            ? resolveChildBackgroundBashMaxMs(config.subagents?.backgroundBashMaxMs)
            : undefined,
        getBashShellSelection: () =>
          getSessionShellSelectionFromConfig(runtime.config),
        hookRunner,
        getWorkingDirectory: () => runtime.workingDirectory,
        setWorkingDirectory: runtime.setWorkingDirectory.bind(runtime),
        getWorkspaceRoot: () => runtime.workspaceRoot,
        workspaceIdentity: config.workspaceIdentity?.toString(),
        remoteSessionId: config.remoteSessionId,
        clientMode: config.clientMode,
        deliveryKind: config.deliveryKind,
        getMemoryRoot: () =>
          deps.memoryRoot ??
          resolveEnabledProjectMemoryRoot(runtime.config, runtime.workspaceRoot),
        runtimeScope: config.taskType === "subagent_child" ? "subagent" : "main",
        permissionTimeoutMs: config.permissionTimeoutMs,
        sessionId: runtime.sessionId,
        traceContext: runtime.rootTraceContext,
        getMode: () => runtime.config.mode ?? "build",
        maxConcurrency: config.toolConcurrency?.maxConcurrency,
      });
    })();

  return { executor, hookRunner };
}

function resolveChildBackgroundBashMaxMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 3600000;
}
