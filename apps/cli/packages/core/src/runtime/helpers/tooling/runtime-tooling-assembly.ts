// SPDX-License-Identifier: Apache-2.0
// 运行时工具与钩子的装配（B38）。
// 装配顺序固定：按配置注册内建工具（allowlist/disallowlist 两条规则收口在 allowlist-rules）→
// 择钩子执行器（注入优先；否则 hooks 开启或有工作区钩子快照且有执行端口时建配置化执行器；
// 有会话邮箱端口时补内存执行器并注册邮箱钩子）→ 建工具执行器（注入优先；否则按端口装配，
// 含后台任务通知抑制、浏览器端口、记忆根、并发上限等）。抑制分支：运行时关闭中、
// sealed 子代理 Bash 通知按策略抑制。装配同步完成，I/O 均在注入端口侧。
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
  type TraceContext,
} from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { AgentRuntimeDeps } from "../../types.js";
import { resolveRuntimeEmbeddedSearchEnabled } from "../../methods/embedded-search-branch.js";
import { getSessionShellSelectionFromConfig } from "../../methods/session-shell-environment.js";
import { createRuntimeSessionModePort } from "../../session-mode-port.js";
import { shouldSuppressSealedSubagentBashNotification } from "../../../runtime-task/notification-policy.js";
import {
  resolveBuiltInToolAllowlist,
  resolveRuntimeDisallowedTools,
  resolveRuntimeDynamicWorkflowToolsIncluded,
} from "./allowlist-rules.js";
import { isStaleBranchRuntimeTaskEvent } from "../../methods/runtime-command-generation.js";
import { resolveEnabledProjectMemoryRoot } from "../project-memory.js";

// 钩子配置缺省：未配置时关闭事件、32 KiB 输出上限、60s 超时。
const fallbackHookConfig = {
  enabled: false, // 未配置即关闭
  events: {}, // 不订阅任何事件
  maxOutputBytes: 32768, // 32 KiB 输出上限
  timeoutMs: 60000, // 60s 超时
};

// 子代理后台 Bash 上限缺省：非正数/非有限数一律取 1 小时。
const DEFAULT_CHILD_BACKGROUND_BASH_MAX_MS = 3600000;

const resolveChildBackgroundBashMaxMs = (candidate: unknown): number =>
  typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
    ? Math.trunc(candidate)
    : DEFAULT_CHILD_BACKGROUND_BASH_MAX_MS;

// 装配产出：工具执行器 + 可选钩子执行器。
type ToolingHandles = { executor: ToolExecutor; hookRunner?: HookRunner };

export function initializeRuntimeTooling(
  host: AgentRuntimeInternal,
  ports: AgentRuntimeDeps,
  sessionId: SessionId,
): ToolingHandles {
  registerConfiguredTools(host, ports);

  let hookRunner = ports.hookRunner ?? createConfiguredHookRunnerIfAvailable(host, ports);

  if (ports.sessionMailboxPort) {
    const mailboxRunner = createInMemoryHookRunner({
      // 会话邮箱走内存钩子执行器（缺省才建），事件先过期分支过滤
      emitEvent: async (recorded) => {
        if (isStaleBranchRuntimeTaskEvent(host, recorded)) return;
        await host.appendEvent(recorded, getCurrentTraceContext() ?? host.rootTraceContext);
      },
      logger: host.logger,
    });
    hookRunner ??= mailboxRunner;
    registerSessionMailboxHooks(host, ports, sessionId, hookRunner);
  }

  const executor = ports.toolExecutor ?? createConfiguredToolExecutor(host, ports, hookRunner);
  return { executor, hookRunner }; // 装配产出
}

// 内建工具注册面：能力开关由端口在场与否决定，清单两条规则收口在 allowlist-rules。
function registerConfiguredTools(host: AgentRuntimeInternal, ports: AgentRuntimeDeps): void {
  const nodeRepl = host.config.runtimeFeatures?.nodeRepl === true;
  const browserUse =
    host.config.runtimeFeatures?.browserUse === true && ports.browserControlPort !== undefined;
  const childScope = host.config.taskType === "subagent_child";
  const workflowGates = {
    includeSubmitResult: Boolean(ports.workflowSubmitPort),
    ...(ports.workflowSubmitSchema === undefined
      ? {}
      : { submitResultSchema: ports.workflowSubmitSchema }),
    includeEscalate: Boolean(ports.workflowEscalatePort),
    includeWorkflow: Boolean(ports.workflowPort),
  };
  const schedulingGates = {
    includeAutomation: Boolean(ports.automationPort) && !childScope,
    includeOffPeak: Boolean(ports.offPeakPort) && !childScope,
    includeDynamicWorkflow: resolveRuntimeDynamicWorkflowToolsIncluded(host.config),
  };
  registerBuiltInTools(host.registry, {
    ...workflowGates,
    ...schedulingGates,
    allowedTools: resolveBuiltInToolAllowlist(host.config),
    disallowedTools: resolveRuntimeDisallowedTools(host.config),
    includeRespondToCoordinator: childScope && Boolean(ports.coordinatorResponsePort),
    includeSendMessage: host.subagentPort?.sendMessage !== undefined,
    includeAgent: Boolean(host.subagentPort),
    includeSkill: Boolean(ports.skillPort),
    bashTimeoutPolicy: host.config.bashTimeoutPolicy,
    includeNodeRepl: nodeRepl,
    includeBrowserUse: browserUse,
    embeddedSearchEnabled: resolveRuntimeEmbeddedSearchEnabled(host),
    agentProfiles: host.config.subagents?.profiles,
  });
}

// 配置化钩子执行器：缺前置条件时返回 undefined。
function createConfiguredHookRunnerIfAvailable(
  host: AgentRuntimeInternal,
  ports: AgentRuntimeDeps,
): HookRunner | undefined {
  const hooksRequested = Boolean(host.config.hooks?.enabled || ports.workspaceHookSnapshot);
  if (!hooksRequested || !ports.executionPort) {
    return undefined;
  }
  return createConfiguredHookRunner({
    config: host.config.hooks ?? fallbackHookConfig,
    emitEvent: async (event) => {
      await host.appendEvent(event, getCurrentTraceContext() ?? host.rootTraceContext);
    },
    executionPort: ports.executionPort,
    getWorkingDirectory: () => host.workingDirectory,
    logger: host.logger,
    workspaceHookAdmission: ports.workspaceHookAdmission,
    workspaceHookSnapshot: ports.workspaceHookSnapshot,
  });
}

// 会话邮箱钩子注册：投递被拒时记 warn（事件 session.mailbox.queue_rejected）。
function registerSessionMailboxHooks(
  host: AgentRuntimeInternal,
  ports: AgentRuntimeDeps,
  sessionId: SessionId,
  hookRunner: HookRunner,
): void {
  const mailboxHooks = createSessionMailboxHookRegistrations({
    enqueuePendingInput: async (input, traceContext) => {
      const result = await host.steerTurn({
        delivery: "guide",
        expectedTurnId: traceContext.turnId,
        input,
        traceContext,
      });
      if (result.kind === "rejected") {
        host.logger?.warn("Session mailbox input was not queued", {
          ...traceContextToLogContext(traceContext),
          event: "session.mailbox.queue_rejected", // 事件名逐字冻结
          module: "core.runtime", // 模块归属是观测契约字段
          reason: result.reason,
          status: "completed", // 事件状态字段
        });
      }
    },
    mailbox: ports.sessionMailboxPort!,
    sessionId, // 邮箱挂当前会话
  });

  for (const hook of mailboxHooks) {
    if ("register" in hookRunner && typeof hookRunner.register === "function") {
      hookRunner.register(hook);
    }
  }
}

// 后台任务通知抑制：关闭中不发；sealed 子代理 Bash 通知按策略抑制并记 info。
function shouldEnqueueBackgroundNotification(
  host: AgentRuntimeInternal,
  input: { taskId: string; status: unknown; toolName: string; traceContext: TraceContext },
): boolean {
  const shutdownNotice = {
    ...traceContextToLogContext(input.traceContext),
    event: "runtime.background_task_notification.shutdown_suppressed",
    module: "core.runtime",
    taskId: input.taskId,
    taskStatus: input.status,
    toolName: input.toolName,
  };
  if (host.shuttingDown) {
    host.logger?.info?.(
      "Suppressed background task notification during runtime shutdown",
      shutdownNotice,
    );
    return false;
  }

  const registryTask = host.runtimeTaskRegistry.get(input.taskId);
  const suppressed = shouldSuppressSealedSubagentBashNotification({
    isSubagentChildRuntime: host.config.taskType === "subagent_child",
    notificationSealed: host.backgroundTaskNotificationsSealed,
    registryTask,
    toolName: input.toolName,
  });
  if (!suppressed) return true;

  host.logger?.info?.("Suppressed sealed subagent background Bash notification", {
    ...shutdownNotice,
    event: "runtime.background_task_notification.suppressed",
    reason: host.backgroundTaskNotificationSealReason,
  });
  return false;
}

// 工具执行器装配：浏览器端口仅在特性开启时下传；记忆根注入优先。
function createConfiguredToolExecutor(
  host: AgentRuntimeInternal,
  ports: AgentRuntimeDeps,
  hookRunner: HookRunner | undefined,
): ToolExecutor {
  const browserEnabled =
    host.config.runtimeFeatures?.browserUse === true && ports.browserControlPort !== undefined;
  const childScope = host.config.taskType === "subagent_child";
  const identityGates = {
    workspaceIdentity: host.config.workspaceIdentity?.toString(),
    remoteSessionId: host.config.remoteSessionId,
    clientMode: host.config.clientMode,
    deliveryKind: host.config.deliveryKind,
    sessionId: host.sessionId,
    traceContext: host.rootTraceContext,
    runtimeScope: childScope ? ("subagent" as const) : ("main" as const),
    permissionTimeoutMs: host.config.permissionTimeoutMs,
    maxConcurrency: host.config.toolConcurrency?.maxConcurrency,
  };
  const searchGates = {
    embeddedSearchBackend: host.config.embeddedSearchBackend,
    nativeSearchEnhancementsEnabled: host.config.nativeSearchEnhancementsEnabled,
  };
  return createToolExecutor({
    ...identityGates,
    ...searchGates,
    agentTelemetry: host.agentTelemetry.port,
    agentTelemetryActorKind: host.agentTelemetry.actorKind,
    registry: host.registry,
    permissionService: host.permissionService,
    permissionBroker: host.permissionBroker,
    emitEvent: async (event) => {
      await host.appendEvent(event, getCurrentTraceContext() ?? host.rootTraceContext);
    },
    enqueueBackgroundTaskNotification: (notification) => {
      host.enqueueBackgroundTaskNotification(notification);
    },
    shouldEnqueueBackgroundTaskNotification: (input) =>
      shouldEnqueueBackgroundNotification(host, input),
    logger: host.logger,
    backgroundTaskControlPort: {
      stopBackgroundTask: host.stopBackgroundTask.bind(host),
    },
    executionPort: ports.executionPort,
    browserControlPort: browserEnabled ? ports.browserControlPort : undefined,
    browserDocumentationRoot: browserEnabled
      ? host.config.runtimeFeatures?.browserDocumentationRoot
      : undefined,
    fileSystemPort: ports.fileSystemPort,
    httpClientPort: ports.httpClientPort,
    imageProcessorPort: ports.imageProcessorPort,
    pdfDocumentPort: ports.pdfDocumentPort,
    skillPort: ports.skillPort,
    subagentPort: host.subagentPort,
    coordinatorResponsePort: ports.coordinatorResponsePort,
    workflowSubmitPort: ports.workflowSubmitPort,
    workflowEscalatePort: ports.workflowEscalatePort,
    artifactStore: ports.artifactStore,
    automationPort: ports.automationPort,
    offPeakPort: ports.offPeakPort,
    sessionStore: ports.sessionStore,
    sessionModePort: createRuntimeSessionModePort(host),
    workflowPort: ports.workflowPort,
    dynamicWorkflowRunPort: ports.dynamicWorkflowRunPort,
    dynamicWorkflowSnippetPort: ports.dynamicWorkflowSnippetPort,
    modelCatalogPort: ports.modelCatalogPort,
    runtimeTaskRegistry: host.runtimeTaskRegistry,
    readFileState: host.readFileState,
    subagentBackgroundBashMaxMs: childScope
      ? resolveChildBackgroundBashMaxMs(host.config.subagents?.backgroundBashMaxMs)
      : undefined,
    getBashShellSelection: () => getSessionShellSelectionFromConfig(host.config),
    hookRunner,
    getWorkingDirectory: () => host.workingDirectory,
    setWorkingDirectory: host.setWorkingDirectory.bind(host),
    getWorkspaceRoot: () => host.workspaceRoot,
    getMemoryRoot: () =>
      ports.memoryRoot ?? resolveEnabledProjectMemoryRoot(host.config, host.workspaceRoot),
    getMode: () => host.config.mode ?? "build",
  });
}
