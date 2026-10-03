import {
  type BackgroundResultOriginMeta,
  type Logger,
  type SessionEvent,
  type SessionId,
  type SubagentPort,
  type SubagentRunOptions,
  type TraceContext,
} from "@knorvia/contracts";
import { type AgentProfile } from "./profile.js";
import { type RuntimeTaskMessageSink, type RuntimeTaskRegistry } from "../runtime-task/registry.js";
export interface ExploreSubagentRuntimeRequest {
  agentId: string;
  agentType: string;
  allowedTools: readonly string[];
  background: boolean;
  disallowedTools?: readonly string[];
  sessionId: SessionId;
  description: string;
  maxTurns?: number;
  onSessionReady?: () => Promise<void>;
  permissionMode?: AgentProfile["permissionMode"];
  prompt: string;
  profile: AgentProfile;
  registerMessageSink?: (sink: RuntimeTaskMessageSink) => void;
  reportActivity?: () => void;
  resumeFromStore?: boolean;
  systemPrompt?: string;
  workingDirectory: string;
  workspaceRoot: string;
  traceContext: TraceContext;
}
export interface ExploreSubagentRuntimeResult {
  response: string;
  traceId: TraceContext["traceId"];
  events: SessionEvent[];
}
export interface ParentTaskNotificationCommand {
  originMeta: BackgroundResultOriginMeta;
  text: string;
  traceContext: TraceContext;
  taskId: string;
}
export type EnqueueParentTaskNotification = (
  notification: ParentTaskNotificationCommand,
) => undefined;
export interface ExploreSubagentPortOptions {
  runExploreAgent: (
    request: ExploreSubagentRuntimeRequest,
    options?: SubagentRunOptions,
  ) => Promise<ExploreSubagentRuntimeResult>;
  emitParentEvent: (event: SessionEvent, traceContext: TraceContext) => Promise<void>;
  enqueueParentTaskNotification?: EnqueueParentTaskNotification;
  outputRootDir?: string;
  profiles?: readonly AgentProfile[];
  builtInModelSelectionOverrides?: Partial<
    Record<"general-purpose" | "Explore", import("@knorvia/shared").ModelSelection>
  >;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  createAgentId?: () => string;
  getAllowedTools?: (profile: AgentProfile) => readonly string[];
  inactivityTimeoutMs?: number;
  autoBackgroundMs?: number;
  logger?: Logger;
}

import { AgentErrorCode, CoreErrorType, createCoreError } from "@knorvia/contracts";
import { createState, resolveProfile } from "./runner-state.js";
import { runMethod } from "./runner-foreground.js";
import { startMethod } from "./runner-background.js";
import { messageMethod } from "./runner-message.js";
import { stopMethod } from "./runner-stop.js";
export function createExploreSubagentPort(options: ExploreSubagentPortOptions): SubagentPort {
  const state = createState(options);
  const port: SubagentPort = {
    async launch(rawRequest, runOptions) {
      const { request, profile } = resolveProfile(state, rawRequest);
      const { runInBackground, ...executionRequest } = request as typeof rawRequest;
      if (runInBackground === true || profile.background === true) {
        if (runOptions?.modelOverride?.background === "deny")
          throw createCoreError(
            CoreErrorType.ToolExecutionFailed,
            "Idle-time tasks do not support background agents. Run this agent in the foreground.",
            {
              context: {
                code: AgentErrorCode.BACKGROUND_UNAVAILABLE,
                agentType: rawRequest.agentType,
                parentToolCallId: rawRequest.parentToolCallId,
              },
              recoverable: true,
            },
          );
        return port.start!(executionRequest, {
          signal: runOptions?.signal,
          ...(runOptions?.model ? { model: runOptions.model } : {}),
        });
      }
      return port.run(executionRequest, runOptions);
    },
    run: runMethod(state),
    start: startMethod(state),
    async backgroundTask(taskId) {
      if (state.borrowed.has(taskId)) return state.registry.get(taskId);
      state.registry.requestBackground(taskId);
      return state.registry.get(taskId);
    },
    async getTask(taskId) {
      return state.registry.get(taskId);
    },
    async waitForTask(taskId, waitOptions) {
      return state.registry.waitForTerminal(taskId, { signal: waitOptions?.signal });
    },
    stopTask: stopMethod(state),
    sendMessage: messageMethod(state),
  };
  return port;
}
