// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { SessionEvent } from "@knorvia/contracts";
import { resolveEmbeddedSearchBranchCapability } from "../../../embedded-search/capability.js";
import type { ToolExecutionContext } from "../../types.js";
import { createToolModelStatusSink, withDefaultToolModelStatusSink } from "../model-status-sink.js";
import type { RegisteredInvocation } from "./identity.js";

type MetadataWriter = Pick<
  ToolExecutionContext,
  "recordReadFileStateMetadata" | "recordSkillTelemetryMetadata"
>;
export function executionContext(
  facts: RegisteredInvocation,
  signal: AbortSignal,
  emitEvent: ((event: SessionEvent) => Promise<void>) | undefined,
  metadata: MetadataWriter,
): ToolExecutionContext {
  const { deps, call, options, telemetry, trace, turnId } = facts;
  const model = options?.model ?? deps.model;
  const bashShellSelection = deps.getBashShellSelection?.() ?? deps.bashShellSelection;
  const search = resolveEmbeddedSearchBranchCapability({
    bashAvailable: deps.registry.has("Bash"),
  });
  return {
    toolCallId: call.id,
    telemetry,
    automationTurn: options?.automationTurn,
    offPeakTurn: options?.offPeakTurn,
    traceContext: trace,
    traceId: trace.traceId,
    spanId: trace.spanId,
    parentSpanId: trace.parentSpanId,
    abortSignal: signal,
    backgroundTaskControlPort: deps.backgroundTaskControlPort,
    emitEvent,
    executionPort: deps.executionPort,
    browserControlPort: deps.browserControlPort,
    browserDocumentationRoot: deps.browserDocumentationRoot,
    fileSystemPort: deps.fileSystemPort,
    httpClientPort: deps.httpClientPort,
    imageProcessorPort: deps.imageProcessorPort,
    pdfDocumentPort: deps.pdfDocumentPort,
    model: withDefaultToolModelStatusSink(
      model,
      createToolModelStatusSink({
        emitEvent,
        sessionId: deps.sessionId,
        turnId,
        traceId: trace.traceId,
      }),
    ),
    subagentModelOverride: options?.subagentModelOverride,
    embeddedSearch: {
      ...(deps.embeddedSearchBackend ? { backend: deps.embeddedSearchBackend } : {}),
      enabled: search?.useEmbeddedSearchBranch ?? false,
      ...(deps.nativeSearchEnhancementsEnabled === false ? { findAndGrepEnabled: false } : {}),
    },
    skillPort: deps.skillPort,
    subagentPort: deps.subagentPort,
    coordinatorResponsePort: deps.coordinatorResponsePort,
    workflowSubmitPort: deps.workflowSubmitPort,
    workflowEscalatePort: deps.workflowEscalatePort,
    artifactStore: deps.artifactStore,
    automationPort: deps.automationPort,
    offPeakPort: deps.offPeakPort,
    sessionStore: deps.sessionStore,
    sessionModePort: deps.sessionModePort,
    workflowPort: deps.workflowPort,
    dynamicWorkflowRunPort: deps.dynamicWorkflowRunPort,
    dynamicWorkflowSnippetPort: deps.dynamicWorkflowSnippetPort,
    modelCatalogPort: deps.modelCatalogPort,
    runtimeTaskRegistry: deps.runtimeTaskRegistry,
    readFileState: deps.readFileState,
    recordReadFileStateMetadata: metadata.recordReadFileStateMetadata,
    recordSkillTelemetryMetadata: metadata.recordSkillTelemetryMetadata,
    bashShellSelection,
    setWorkingDirectory: deps.setWorkingDirectory,
    workingDirectory: deps.getWorkingDirectory(),
    workspaceRoot: deps.getWorkspaceRoot(),
    workspaceIdentity: deps.workspaceIdentity,
    remoteSessionId: deps.remoteSessionId,
    clientMode: deps.clientMode,
    deliveryKind: deps.deliveryKind,
    memoryRoot: deps.getMemoryRoot?.(),
    runtimeScope: deps.runtimeScope,
    providerVisibleToolNames: deps.registry
      .list()
      .filter((name) => deps.registry.getMetadata(name)?.providerVisible !== false),
    sessionId: deps.sessionId,
    turnId,
  };
}
