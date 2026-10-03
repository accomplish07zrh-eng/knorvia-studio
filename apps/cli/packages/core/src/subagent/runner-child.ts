import {
  SessionEventType,
  hasModelUsage,
  getModelUsageTotalTokens,
  traceContextToLogContext,
  type AgentCompletedOutput,
  type ModelUsage,
  type SessionEvent,
  type SubagentRunOptions,
} from "@knorvia/contracts";
import type { RuntimeTaskMessageSink } from "../runtime-task/registry.js";
import { allowedTools, errorText, type Execution, type RunnerState } from "./runner-state.js";
export interface ChildResult {
  events: SessionEvent[];
  output: AgentCompletedOutput;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function aggregate(events: SessionEvent[]) {
  let usage: ModelUsage | undefined;
  for (const event of events) {
    if (event.type !== SessionEventType.ModelComplete) continue;
    const payload = event.payload;
    if (!record(payload) || !record(payload.usage)) continue;
    const value = payload.usage as ModelUsage;
    if (!hasModelUsage(value)) continue;
    usage ??= {};
    const add = (
      key: keyof Pick<
        ModelUsage,
        | "inputTokens"
        | "outputTokens"
        | "totalTokens"
        | "cacheReadTokens"
        | "cacheWriteTokens"
        | "reasoningTokens"
      >,
      amount: number | undefined,
    ) => {
      if (amount !== undefined) usage![key] = (usage![key] ?? 0) + amount;
    };
    add("inputTokens", value.inputTokens);
    add("outputTokens", value.outputTokens);
    const total =
      value.totalTokens !== undefined
        ? value.totalTokens
        : value.inputTokens === undefined &&
            value.outputTokens === undefined &&
            value.cacheReadTokens === undefined &&
            value.cacheWriteTokens === undefined
          ? undefined
          : getModelUsageTotalTokens(value);
    add("totalTokens", total);
    add("cacheReadTokens", value.cacheReadTokens);
    add("cacheWriteTokens", value.cacheWriteTokens);
    add("reasoningTokens", value.reasoningTokens);
    const search = value.serverToolUse?.webSearchRequests ?? 0;
    const fetch = value.serverToolUse?.webFetchRequests ?? 0;
    if (search > 0 || fetch > 0) {
      usage.serverToolUse ??= {};
      usage.serverToolUse.webSearchRequests = (usage.serverToolUse.webSearchRequests ?? 0) + search;
      usage.serverToolUse.webFetchRequests = (usage.serverToolUse.webFetchRequests ?? 0) + fetch;
    }
  }
  const totalTokens = usage?.totalTokens;
  let turnCount: number | undefined;
  for (const event of events) {
    if (event.type !== SessionEventType.TurnComplete || !record(event.payload)) continue;
    const count = event.payload.toolCallCount;
    if (typeof count === "number" && Number.isFinite(count)) turnCount = (turnCount ?? 0) + count;
  }
  const totalToolUseCount =
    turnCount ??
    events.filter(
      (event) =>
        event.type === SessionEventType.ToolCallResult ||
        event.type === SessionEventType.ToolCallError,
    ).length;
  return { usage, totalTokens, totalToolUseCount };
}
async function flushMessages(
  state: RunnerState,
  execution: Execution,
  sink: RuntimeTaskMessageSink,
): Promise<void> {
  const messages = state.registry.drainMessages(execution.agentId);
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message) continue;
    try {
      await sink.send(message);
    } catch (error) {
      for (const pending of messages.slice(index))
        state.registry.queueMessage(execution.agentId, pending);
      state.options.logger?.warn("Failed to flush pending subagent message", {
        ...traceContextToLogContext(execution.runTrace),
        agentId: execution.agentId,
        errorMessage: errorText(error),
        event: "subagent.message.flush.failed",
        module: "core.subagent",
        status: "failed",
      });
      return;
    }
  }
}
export async function runChild(
  state: RunnerState,
  execution: Execution,
  runOptions: SubagentRunOptions,
  onReady?: () => Promise<void>,
  reportActivity?: () => void,
  resumeFromStore?: boolean,
): Promise<ChildResult> {
  let ready = false;
  const readiness = async () => {
    if (ready) return;
    await onReady?.();
    ready = true;
  };
  const { request, profile, agentId, childSessionId } = execution;
  const child = await state.options.runExploreAgent(
    {
      agentId,
      agentType: request.agentType,
      allowedTools: allowedTools(state, profile),
      get background() {
        return state.registry.get(agentId)?.isBackgrounded === true;
      },
      disallowedTools: profile.disallowedTools,
      sessionId: childSessionId,
      description: request.description,
      maxTurns: profile.maxTurns,
      onSessionReady: readiness,
      permissionMode: profile.permissionMode,
      prompt: request.prompt,
      profile,
      registerMessageSink(sink) {
        state.registry.update(agentId, (task) => ({ ...task, messageSink: sink }));
        void flushMessages(state, execution, sink);
      },
      reportActivity,
      resumeFromStore,
      systemPrompt: profile.systemPrompt,
      workingDirectory: request.workingDirectory,
      workspaceRoot: request.workspaceRoot,
      traceContext: execution.childTrace,
    },
    runOptions,
  );
  await readiness();
  const { usage, totalTokens, totalToolUseCount } = aggregate(child.events);
  const totalDurationMs = Date.now() - execution.startedMs;
  const output: AgentCompletedOutput = {
    status: "completed",
    agentId,
    agentType: request.agentType,
    description: request.description,
    prompt: request.prompt,
    content: [{ type: "text", text: child.response }],
    totalToolUseCount,
    totalDurationMs,
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(usage ? { usage } : {}),
  };
  return { events: child.events, output };
}
