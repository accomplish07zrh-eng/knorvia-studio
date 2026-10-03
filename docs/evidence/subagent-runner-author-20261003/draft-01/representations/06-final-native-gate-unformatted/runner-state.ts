import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AgentErrorCode,
  CoreErrorType,
  createChildTraceContext,
  createCoreError,
  createSessionId,
  type AgentBackgroundedOutput,
  type SubagentRunRequest,
  type TraceContext,
} from "@knorvia/contracts";
import {
  normalizeAgentProfiles,
  isBuiltInExploreAgentProfile,
  type AgentProfile,
} from "./profile.js";
import { EXPLORE_AGENT_ALLOWED_TOOLS } from "./explore-tools.js";
import { filterSubagentChildToolNames } from "./tool-policy.js";
import {
  InMemoryRuntimeTaskRegistry,
  type RuntimeTaskRegistry,
  type RuntimeTaskSnapshot,
} from "../runtime-task/registry.js";
import type { ExploreSubagentPortOptions } from "./runner.js";
export interface RunnerState {
  options: ExploreSubagentPortOptions;
  registry: RuntimeTaskRegistry;
  profiles: AgentProfile[];
  controllers: Map<string, AbortController>;
  borrowed: Set<string>;
  autoBackgroundMs: number | undefined;
}
export interface Execution {
  request: SubagentRunRequest;
  profile: AgentProfile;
  agentId: string;
  childSessionId: ReturnType<typeof createSessionId>;
  startedMs: number;
  startedAt: Date;
  directory: string;
  metadataFile: string;
  outputFile: string;
  taskOutputFile: string;
  runTrace: TraceContext;
  childTrace: TraceContext;
}
export function createState(options: ExploreSubagentPortOptions): RunnerState {
  const registry = options.runtimeTaskRegistry ?? new InMemoryRuntimeTaskRegistry();
  const profiles = normalizeAgentProfiles(options.profiles ?? [], {
    builtInModelSelectionOverrides: options.builtInModelSelectionOverrides,
  });
  const delay = options.autoBackgroundMs;
  return {
    options,
    registry,
    profiles,
    controllers: new Map(),
    borrowed: new Set(),
    autoBackgroundMs:
      typeof delay === "number" && Number.isFinite(delay) && delay > 0
        ? Math.trunc(delay)
        : undefined,
  };
}
const normalizeName = (name: string) =>
  name
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{White_Space}\p{Dash_Punctuation}_]/gu, "");
export function resolveProfile(state: RunnerState, request: SubagentRunRequest) {
  let profile = state.profiles.find((item) => item.name === request.agentType);
  if (!profile) {
    const normalized = normalizeName(request.agentType);
    const matches = normalized
      ? state.profiles.filter((item) => normalizeName(item.name) === normalized)
      : [];
    if (matches.length === 1) profile = matches[0];
    else {
      const names = matches.map((item) => item.name);
      const message =
        matches.length > 1
          ? [
              `Agent type '${request.agentType}' is ambiguous`,
              `matches ${names.join(", ")}`,
              `Use the exact name: ${names.join(" or ")}`,
            ].join(" — ")
          : `Agent type '${request.agentType}' not found. Available agents: ${state.profiles.map((item) => item.name).join(", ")}`;
      throw createCoreError(CoreErrorType.ToolExecutionFailed, message, {
        context: {
          code: AgentErrorCode.UNKNOWN_AGENT_TYPE,
          agentType: request.agentType,
          ...(matches.length > 1
            ? { matches: names }
            : { availableAgentTypes: state.profiles.map((item) => item.name) }),
          parentToolCallId: request.parentToolCallId,
        },
        recoverable: true,
      });
    }
  }
  return {
    profile: profile!,
    request:
      profile!.name === request.agentType ? request : { ...request, agentType: profile!.name },
  };
}
export function allowedTools(state: RunnerState, profile: AgentProfile): readonly string[] {
  const base = [
    ...((isBuiltInExploreAgentProfile(profile)
      ? (state.options.getAllowedTools?.(profile) ?? EXPLORE_AGENT_ALLOWED_TOOLS)
      : profile.tools) ?? []),
  ];
  if (profile.skills?.length && !new Set(profile.disallowedTools).has("Skill")) base.push("Skill");
  return filterSubagentChildToolNames(base, profile.disallowedTools);
}
export function createExecution(
  state: RunnerState,
  request: SubagentRunRequest,
  profile: AgentProfile,
  previous?: RuntimeTaskSnapshot,
): Execution {
  const agentId =
    previous?.agentId ?? state.options.createAgentId?.() ?? `agent_${crypto.randomUUID()}`;
  const childSessionId = previous?.childSessionId ?? createSessionId(`subagent_${agentId}`);
  const startedMs = Date.now();
  const directory = previous?.outputFile
    ? dirname(previous.outputFile)
    : join(
        state.options.outputRootDir ?? join(tmpdir(), "knorvia-agents"),
        request.sessionId,
        agentId,
      );
  const runTrace = createChildTraceContext(request.trace, {
    sessionId: request.sessionId,
    turnId: request.turnId,
    attributes: {
      agentId,
      agentType: request.agentType,
      parentToolCallId: request.parentToolCallId,
      ...(previous ? { resumed: true } : {}),
    },
  });
  const childTrace = createChildTraceContext(runTrace, {
    sessionId: childSessionId,
    turnId: request.turnId,
    attributes: {
      agentId,
      agentType: request.agentType,
      parentSessionId: request.sessionId,
      parentToolCallId: request.parentToolCallId,
      ...(previous ? { resumed: true } : {}),
    },
  });
  return {
    request,
    profile,
    agentId,
    childSessionId,
    startedMs,
    startedAt: new Date(startedMs),
    directory,
    metadataFile: join(directory, "metadata.json"),
    outputFile: join(directory, "output.txt"),
    taskOutputFile: join(directory, "task.output"),
    runTrace,
    childTrace,
  };
}
export function registerExecution(state: RunnerState, execution: Execution, background: boolean) {
  const { request, agentId, childSessionId, outputFile, startedAt, runTrace } = execution;
  state.registry.register({
    taskId: agentId,
    agentId,
    agentType: request.agentType,
    childSessionId,
    description: request.description,
    isBackgrounded: background,
    outputFile,
    parentToolCallId: request.parentToolCallId,
    parentSessionId: request.sessionId,
    prompt: request.prompt,
    startedAt,
    status: "running",
    taskType: "local_agent",
    traceContext: runTrace,
    type: "local_agent",
    turnId: request.turnId,
  });
}
export function backgroundOutput(execution: Execution): AgentBackgroundedOutput {
  const { agentId, request, childSessionId, outputFile } = execution;
  return {
    status: "async_launched",
    isAsync: true,
    agentId,
    agentType: request.agentType,
    description: request.description,
    prompt: request.prompt,
    childSessionId,
    backgroundTaskId: agentId,
    outputFile,
    canReadOutputFile: request.callerCanReadOutputFile === true,
  };
}
export function withoutMessages(task: RuntimeTaskSnapshot): RuntimeTaskSnapshot {
  const { messageSink: _sink, pendingMessages: _messages, ...rest } = task;
  return rest;
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
