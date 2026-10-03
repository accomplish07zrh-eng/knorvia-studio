import type {
  CollaborationMode, ExecutionShellSelection, Model, ModelSelection,
  ModelToolContract, PermissionBrokerRequest, ProjectId, SessionEvent,
  SessionEventSink, SessionEventStorePort, SessionId, SessionProjection,
  TraceContext, ToolExecutor, ToolRegistry, ContextBuilder,
} from "../deps.js";
import { isInspectablePermissionBroker, projectIdFromDirectory } from "../helpers/index.js";
import {
  deriveChildClientPorts,
  type ChildClientPortsContext,
  type ClientFacingPorts,
} from "../helpers/child-client-ports.js";
import type { AgentRuntimeConfig, ActiveTurnInfo } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { cloneModelSelection } from "../model-selection.js";
import { applyRuntimeExecutionState } from "../execution-state.js";
import { orderProviderVisibleToolContracts } from "../../tool/provider-visible-order.js";
import { projectToolModelContract } from "../../tool/model-contract.js";
import { rebuildContextPrefix } from "./context-refresh.js";
import { filterEmbeddedSearchRuntimeVisibleTools } from "./embedded-search-branch.js";
import {
  getSessionShellSelection as readSessionShellSelection,
  initializeSessionShellEnvironmentIfNeeded as initializeSessionShellEnvironment,
  type SessionShellEnvironmentCandidate,
} from "./session-shell-environment.js";
import { resolveExecutionState } from "@knorvia/shared";

export async function setExecutionState(
  this: AgentRuntimeInternal,
  input: { mode?: string; planEnabled?: boolean },
  traceContext?: TraceContext,
): Promise<void> {
  await applyRuntimeExecutionState(this, input, { source: "command", traceContext });
}

export function updateConfig(
  this: AgentRuntimeInternal,
  patch: Pick<AgentRuntimeConfig, "mode" | "planEnabled" | "language" | "outputStyle">,
): void {
  if (patch.mode !== undefined || patch.planEnabled !== undefined) {
    const previous = resolveExecutionState(this.config);
    const next = resolveExecutionState(patch, previous);
    Object.assign(this.config, next);
    if (next.planEnabled !== previous.planEnabled) {
      this.needsPlanModeExitReminder = !next.planEnabled;
    }
  }
  if (patch.language !== undefined) {
    this.config.language = patch.language;
    if (!this.activeTurn) rebuildContextPrefix(this);
  }
  if ("outputStyle" in patch) {
    this.config.outputStyle = patch.outputStyle;
    if (!this.activeTurn) rebuildContextPrefix(this);
  }
}

export function initializeSessionShellEnvironmentIfNeeded(
  this: AgentRuntimeInternal,
  selection: SessionShellEnvironmentCandidate,
): boolean {
  return initializeSessionShellEnvironment(this, selection);
}

export function getSessionShellSelection(this: AgentRuntimeInternal): ExecutionShellSelection | undefined {
  return readSessionShellSelection(this);
}

export function getMode(this: AgentRuntimeInternal): CollaborationMode {
  return this.config.mode ?? "build";
}

export function getPlanEnabled(this: AgentRuntimeInternal): boolean {
  return resolveExecutionState(this.config).planEnabled;
}

export function getSessionModelSelection(this: AgentRuntimeInternal): ModelSelection | undefined {
  return this.sessionModelSelection ? cloneModelSelection(this.sessionModelSelection) : this.sessionModelSelection;
}

export function setSessionModelSelection(this: AgentRuntimeInternal, selection: ModelSelection | undefined): void {
  this.sessionModelSelection = selection ? cloneModelSelection(selection) : selection;
}

export function getProjectId(this: AgentRuntimeInternal): ProjectId {
  return projectIdFromDirectory(this.workspaceRoot);
}

export function setWorkingDirectory(this: AgentRuntimeInternal, cwd: string): void {
  this.workingDirectory = cwd;
}

export async function ensureSessionPersistedForExternalActivity(
  this: AgentRuntimeInternal,
  input: string,
  options?: { traceContext?: TraceContext },
): Promise<void> {
  await this.ensureSessionPersisted(input, options?.traceContext ?? this.rootTraceContext);
}

export function getActiveTurnInfo(this: AgentRuntimeInternal): ActiveTurnInfo | undefined {
  const turn = this.activeTurn;
  if (!turn) return undefined;
  return {
    kind: turn.kind,
    ...(turn.inputId === undefined ? {} : { inputId: turn.inputId }),
    queueLength: turn.pendingInputs.length,
    steerable: turn.steerable,
    turnId: turn.turnId,
  };
}

export function getTools(this: AgentRuntimeInternal, model?: Model): ModelToolContract[] {
  if (this.cachedTools === null) {
    const contracts = this.registry.toContracts();
    const visible = filterEmbeddedSearchRuntimeVisibleTools(this, contracts);
    this.cachedTools = orderProviderVisibleToolContracts(visible);
  }
  const selected = this.cachedTools.filter((contract) =>
    contract.name !== "WebSearch" || !model || model.properties.supportsNativeWebSearch === true,
  );
  return selected.map((contract) =>
    projectToolModelContract(contract, this.registry.get(contract.name), { model }),
  );
}

export function invalidateToolCache(this: AgentRuntimeInternal): void {
  this.cachedTools = null;
}

export function getToolRegistry(this: AgentRuntimeInternal): ToolRegistry {
  return this.registry;
}

export function getToolExecutor(this: AgentRuntimeInternal): ToolExecutor {
  return this.executor;
}

export function subscribeEvents(this: AgentRuntimeInternal, sink: SessionEventSink): () => void {
  this.eventSinks.add(sink);
  return () => { this.eventSinks.delete(sink); };
}

export function getSessionEventStore(this: AgentRuntimeInternal): SessionEventStorePort {
  return this.eventStore;
}

export async function notifyExternalChildSessionEvent(
  this: AgentRuntimeInternal,
  input: { childSessionId: SessionId; event: SessionEvent; traceContext?: TraceContext },
): Promise<void> {
  await this.notifyEventSinks(input.event, {
    ...(input.traceContext ?? this.rootTraceContext),
    sessionId: input.childSessionId,
  });
}

export function createChildClientPorts(
  this: AgentRuntimeInternal,
  context: ChildClientPortsContext,
): ClientFacingPorts {
  return deriveChildClientPorts({
    ...(this.permissionBroker === undefined ? {} : { permissionBroker: this.permissionBroker }),
    ...(this.providerRuntimeHeadersPort === undefined ? {} : { providerRuntimeHeadersPort: this.providerRuntimeHeadersPort }),
  }, { ...context, parentSessionId: this.sessionId });
}

export function getContextBuilder(this: AgentRuntimeInternal): ContextBuilder {
  if (this.contextBuilder) return this.contextBuilder;
  const snapshot = this.createConfigOnlyContextSnapshot(this.workingDirectory);
  const builder = this.createContextBuilderFromSnapshot(snapshot, undefined, { persistEnvInfo: false });
  this.contextBuilder = builder;
  return builder;
}

export function getPendingPermissionRequests(this: AgentRuntimeInternal): PermissionBrokerRequest[] {
  if (!isInspectablePermissionBroker(this.permissionBroker)) return [];
  return this.permissionBroker.listPendingRequests();
}

export async function getProjection(this: AgentRuntimeInternal): Promise<SessionProjection> {
  return this.rebuildProjection();
}

export function getSessionId(this: AgentRuntimeInternal): SessionId {
  return this.sessionId;
}
