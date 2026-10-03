import {
  defaultScheduler, PermissionService, defaultPermissionConfig,
  buildExploreAllowedTools, buildExploreAgentPrompt, createExploreSubagentPort,
  createCoreError, CoreErrorType,
} from "../deps.js";
import type { SubagentPort } from "../deps.js";
import { AgentRuntime } from "../agent-runtime.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { cloneModelSelection } from "../model-selection.js";
import { resolveSubagentSelection } from "../helpers/subagent-selection.js";
import type { AgentRuntimeDeps } from "../types.js";
import { toMcpToolName } from "../../mcp/index.js";
import { createSubagentMessageSink } from "../../subagent/message-steering.js";
import { mirrorSubagentToolEvent } from "../../subagent/tool-event-mirror.js";
import { isBuiltInExploreAgentProfile } from "../../subagent/profile.js";
import { resolveEmbeddedSearchBranchCapability } from "../../embedded-search/capability.js";
import { getSessionShellEnvironment } from "./session-shell-environment.js";
import { deriveChildClientPorts } from "../helpers/child-client-ports.js";
import { createCoordinatorResponsePort } from "../../subagent/coordinator-response.js";
import { isStaleBranchRuntimeTaskEvent } from "./runtime-command-generation.js";
import { loadPersistentAgentMemory } from "../../subagent/persistent-memory.js";
import { createOfficialCuaPolicy } from "../../subagent/computer-use-policy.js";
import { computeOfficialCuaServerNames } from "./mcp.js";
import {
  resolveChildMcpAccess, resolveChildToolAllowlist, validateChildMcpRequirements,
} from "./subagent-authority.js";
import { createChildSkillPort, validateChildComputerUse } from "./subagent-skills.js";

export function createDefaultSubagentPort(
  this: AgentRuntimeInternal,
  deps: AgentRuntimeDeps,
): SubagentPort | undefined {
  if (this.config.subagents?.enabled === false) return undefined;
  const parent = this;
  return createExploreSubagentPort({
    logger: parent.logger,
    inactivityTimeoutMs: parent.config.subagents?.inactivityTimeoutMs,
    autoBackgroundMs: parent.config.subagents?.autoBackgroundMs,
    outputRootDir: parent.config.subagents?.outputRootDir,
    profiles: parent.config.subagents?.profiles,
    builtInModelSelectionOverrides: parent.config.subagents?.builtInModelSelectionOverrides,
    runtimeTaskRegistry: parent.runtimeTaskRegistry,
    async emitParentEvent(event, trace) {
      if (isStaleBranchRuntimeTaskEvent(parent, event)) return;
      await parent.appendEvent(event, trace);
    },
    enqueueParentTaskNotification(input) {
      parent.enqueueBackgroundTaskNotification({
        originMeta: input.originMeta,
        taskId: input.taskId,
        text: input.text,
        traceContext: input.traceContext,
      });
    },
    getAllowedTools() {
      return buildExploreAllowedTools({
        embeddedSearchEnabled: resolveEmbeddedSearchBranchCapability({ bashAvailable: true }).useEmbeddedSearchBranch,
      });
    },
    async runExploreAgent(request, options) {
      request.reportActivity?.();
      const profile = request.profile;
      const builtInExplore = isBuiltInExploreAgentProfile(profile);
      const agentsMdInstructions = profile.injectAgentsMd !== false
        ? parent.contextSourceSnapshot?.userInstructions : undefined;
      const resolved = resolveSubagentSelection({
        profileSelection: profile.modelSelection,
        parentSelection: parent.getSessionModelSelection(),
        overrideSelection: options?.modelOverride?.selection,
        resolveSelection: deps.resolveEffectiveModelSelection,
      });
      const override = options?.modelOverride;
      const inheritedModel = !override && !resolved.hasConcreteModel ? options?.model : undefined;
      const childSelection = inheritedModel ? {
        providerId: inheritedModel.providerId,
        modelId: inheritedModel.modelId,
        ...(inheritedModel.options.reasoningLevel
          ? { options: { reasoningLevel: inheritedModel.options.reasoningLevel } } : {}),
      } : resolved.selection;
      const embeddedSearchEnabled = resolveEmbeddedSearchBranchCapability({
        bashAvailable: true,
      }).useEmbeddedSearchBranch;
      const baseEnvironment = parent.contextSourceSnapshot?.envInfo ?? parent.config.envInfo ?? {
        cwd: request.workingDirectory,
        platform: "unknown",
        shell: "unknown",
        osVersion: "unknown",
        nodeVersion: "unknown",
      };
      const shellEnvironment = getSessionShellEnvironment(parent);
      const shellSelection = shellEnvironment?.selection;
      const childEnvironment = {
        ...baseEnvironment,
        ...(shellEnvironment ? { shell: shellEnvironment.promptShell } : {}),
      };
      const basePrompt = builtInExplore && request.systemPrompt?.trim() === ""
        ? buildExploreAgentPrompt({ embeddedSearchEnabled }) : request.systemPrompt?.trim();
      const persistentMemory = await loadPersistentAgentMemory({
        fileSystemPort: deps.fileSystemPort,
        logger: parent.logger,
        memory: parent.config.memory,
        profile,
        traceContext: request.traceContext,
        workspaceRoot: request.workspaceRoot,
      });
      const agentPrompt = [basePrompt, persistentMemory?.prompt]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join("\n\n");
      const childRuntimeEnvironment = { ...childEnvironment, cwd: request.workingDirectory };
      const officialNames = computeOfficialCuaServerNames(
        parent.config.mcp?.servers ?? {},
        new Set(parent.config.mcp?.trustedOfficialCuaServerNames ?? []),
      );
      const preflightPolicy = createOfficialCuaPolicy(officialNames, [], parent.config.pluginReferenceCatalog);
      await validateChildComputerUse(request, parent.skillPort, preflightPolicy);
      const childMcpAccess = await resolveChildMcpAccess(parent, request, officialNames);
      const childToolAllowlist = resolveChildToolAllowlist(
        parent, request, childMcpAccess.snapshot?.tools.map(toMcpToolName) ?? [],
      );
      validateChildMcpRequirements(request, childToolAllowlist, childMcpAccess);
      const parentMode = parent.getPlanEnabled() ? "plan" : parent.config.mode;
      const childMode = request.permissionMode === "auto" ? "auto"
        : request.permissionMode === "plan" ? "plan"
        : request.permissionMode === undefined ? builtInExplore ? "yolo" : parentMode
        : parentMode;
      const finalPolicy = createOfficialCuaPolicy(
        officialNames,
        childMcpAccess.parentSnapshot?.tools ?? childMcpAccess.snapshot?.tools ?? [],
        parent.config.pluginReferenceCatalog,
      );
      await validateChildComputerUse(request, parent.skillPort, finalPolicy);
      const childSkillPort = createChildSkillPort(parent.skillPort, profile, finalPolicy);
      const parentFactory = parent.modelFactory;
      const baseFactory = override ? parentFactory && ((target: Parameters<typeof parentFactory>[0]) =>
        parentFactory({
          ...target,
          selection: override.selection,
          requestDependencies: override.requestDependencies,
        }))
        : inheritedModel ? parentFactory && ((target: Parameters<typeof parentFactory>[0]) =>
          target.selection.providerId === childSelection.providerId &&
          target.selection.modelId === childSelection.modelId &&
          target.selection.options?.reasoningLevel === childSelection.options?.reasoningLevel
            ? inheritedModel : parentFactory(target))
        : parentFactory;
      if (!baseFactory) {
        throw createCoreError(
          CoreErrorType.ConfigurationError,
          `Subagent model factory cannot resolve ${childSelection.providerId}/${childSelection.modelId}`,
          { recoverable: true },
        );
      }
      const childModel = baseFactory({ selection: childSelection });
      const childFactory: typeof baseFactory = (target) =>
        target.selection.providerId === childSelection.providerId &&
        target.selection.modelId === childSelection.modelId &&
        target.selection.options?.reasoningLevel === childSelection.options?.reasoningLevel
          ? childModel : baseFactory(target);
      const parentToolCallIdValue = request.traceContext.attributes?.parentToolCallId;
      const parentToolCallId = typeof parentToolCallIdValue === "string" ? parentToolCallIdValue : undefined;
      const childClientPorts = deriveChildClientPorts({
        permissionBroker: parent.permissionBroker,
        ...(parent.providerRuntimeHeadersPort !== undefined
          ? { providerRuntimeHeadersPort: parent.providerRuntimeHeadersPort } : {}),
      }, {
        agentId: request.agentId,
        agentType: request.agentType,
        childSessionId: request.sessionId,
        description: request.description,
        parentSessionId: parent.sessionId,
        ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
        ...(request.traceContext.turnId !== undefined ? { parentTurnId: request.traceContext.turnId } : {}),
      });
      const toolNameByChildToolCallId = new Map<string, string>();
      let sessionReady = false;
      async function notifySessionReady(): Promise<void> {
        if (sessionReady) return;
        await request.onSessionReady?.();
        sessionReady = true;
      }
      parent.logger.debug("Starting subagent child runtime", {
        parentSessionId: parent.sessionId,
        childSessionId: request.sessionId,
        agentType: request.agentType,
      });
      const child = new AgentRuntime(request.sessionId, {
        mode: childMode === "plan" ? parent.config.mode : childMode,
        planEnabled: childMode === "plan",
        modelSelection: cloneModelSelection(childSelection),
        modelContextBudgetStrategy: parent.config.modelContextBudgetStrategy,
        workingDirectory: request.workingDirectory,
        envInfo: childRuntimeEnvironment,
        modelStreaming: parent.config.modelStreaming,
        bashTimeoutPolicy: parent.config.bashTimeoutPolicy,
        midConversationSystem: parent.config.midConversationSystem,
        bashShellSelection: shellSelection,
        currentDate: parent.contextSourceSnapshot?.currentDate ?? parent.config.currentDate,
        subagentContext: {
          agentPrompt: agentPrompt ?? "",
          ...(agentsMdInstructions ? { userInstructions: agentsMdInstructions } : {}),
        },
        agentName: `knorvia-${request.agentType}`,
        maxTurns: request.maxTurns ?? parent.config.subagents?.maxTurns ?? 4,
        parentSessionId: parent.sessionId,
        taskType: "subagent_child",
        dynamicWorkflowEnabled: parent.config.dynamicWorkflowEnabled,
        toolset: builtInExplore ? "explore" : "main",
        toolAllowlist: childToolAllowlist,
        toolDisallowlist: parent.config.toolDisallowlist,
        embeddedSearchBackend: parent.config.embeddedSearchBackend,
        nativeSearchEnhancementsEnabled: parent.config.nativeSearchEnhancementsEnabled,
        subagents: {
          backgroundBashMaxMs: parent.config.subagents?.backgroundBashMaxMs,
          enabled: false,
        },
        mcp: childMcpAccess.config,
      }, {
        agentTelemetry: parent.agentTelemetry.port,
        agentTelemetryCausation: parent.agentTelemetry.captureCausation(),
        agentTelemetryCausationMode: request.background ? "linked_root" : "child",
        eventStore: parent.eventStore,
        sessionStore: deps.sessionStore,
        modelRequestAdmission: parent.modelRequestAdmission,
        modelFactory: childFactory,
        resolveEffectiveModelSelection: deps.resolveEffectiveModelSelection,
        ...childClientPorts,
        coordinatorResponsePort: createCoordinatorResponsePort({
          agentId: request.agentId,
          agentType: request.agentType,
          childSessionId: request.sessionId,
          parentToolCallId,
          enqueue: (input) => parent.enqueueSubagentMessage(input),
        }),
        permissionService: builtInExplore ? new PermissionService(defaultPermissionConfig) : parent.permissionService,
        toolScheduler: deps.toolScheduler ?? defaultScheduler,
        executionPort: deps.executionPort,
        fileSystemPort: deps.fileSystemPort,
        httpClientPort: deps.httpClientPort,
        imageProcessorPort: deps.imageProcessorPort,
        pdfDocumentPort: deps.pdfDocumentPort,
        memoryRoot: persistentMemory?.rootDir,
        mcpPort: childMcpAccess.port,
        skillPort: childSkillPort,
        artifactStore: deps.artifactStore,
        appVersion: parent.appVersion,
        eventSink: {
          async onSessionEvent(rawEvent) {
            request.reportActivity?.();
            await parent.notifyEventSinks(rawEvent, { ...request.traceContext, sessionId: request.sessionId });
            const mirror = mirrorSubagentToolEvent(rawEvent, {
              agentId: request.agentId,
              agentType: request.agentType,
              background: request.background,
              childSessionId: request.sessionId,
              description: request.description,
              parentSessionId: parent.sessionId,
              parentToolCallId,
              parentTurnId: request.traceContext.turnId,
              toolNameByChildToolCallId,
            });
            if (!mirror) return;
            await parent.notifyEventSinks(mirror, { ...request.traceContext, sessionId: parent.sessionId });
          },
        },
        logger: parent.logger,
        traceContext: request.traceContext,
      });
      const resumesExistingChild = request.resumeFromStore === true;
      if (resumesExistingChild) {
        await child.resumeFromStore({ traceContext: request.traceContext });
      } else {
        await child.ensureSessionPersistedForExternalActivity(request.prompt, { traceContext: request.traceContext });
      }
      await notifySessionReady();
      if (!resumesExistingChild) {
        child.recordPendingModelChange({
          toModel: childSelection,
          toModelLabel: `${childSelection.providerId}/${childSelection.modelId}`,
        });
        await child.emitModelSelected({
          modelSelection: childSelection,
          effectiveReasoningLevel: childModel.options.reasoningLevel,
          previousModelSelection: null,
          traceContext: request.traceContext,
        });
      }
      request.registerMessageSink?.(createSubagentMessageSink(child, request));
      try {
        return await child.executeTurn(request.prompt, undefined, {
          abortSignal: options?.signal,
          inputSource: "subagent",
          inputPresentation: "coordinator_input",
          traceContext: request.traceContext,
        });
      } finally {
        const cancelled = options?.signal?.aborted === true;
        child.sealBackgroundTaskNotifications({
          reason: cancelled ? "subagent_cancelled" : "subagent_terminal",
          traceContext: request.traceContext,
        });
        if (cancelled) {
          await child.cancelRunningRuntimeBackgroundTasks({
            reason: "subagent_cancelled",
            traceContext: request.traceContext,
          });
        }
      }
    },
  });
}
