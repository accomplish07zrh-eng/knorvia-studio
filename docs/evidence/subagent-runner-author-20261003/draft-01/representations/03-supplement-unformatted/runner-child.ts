import { SessionEventType, hasModelUsage, getModelUsageTotalTokens, traceContextToLogContext, type AgentCompletedOutput, type ModelUsage, type SessionEvent, type SubagentRunOptions } from '@knorvia/contracts';
import type { RuntimeTaskMessageSink } from '../runtime-task/registry.js';
import { allowedTools, errorText, type Execution, type RunnerState } from './runner-state.js';
export interface ChildResult { events: SessionEvent[]; output: AgentCompletedOutput }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function aggregate(events: SessionEvent[]) {
 let usage: ModelUsage | undefined;
 let turnCount: number | undefined;
 let results = 0;
 for (const event of events) {
  if (event.type === SessionEventType.ToolCallResult || event.type === SessionEventType.ToolCallError) results++;
  if (!record(event.payload)) continue;
  if (event.type === SessionEventType.TurnComplete && typeof event.payload.toolCallCount === 'number' && Number.isFinite(event.payload.toolCallCount)) turnCount = (turnCount ?? 0) + event.payload.toolCallCount;
  if (event.type !== SessionEventType.ModelComplete || !record(event.payload.usage) || !hasModelUsage(event.payload.usage as ModelUsage)) continue;
  const value = event.payload.usage as ModelUsage;
  usage ??= {};
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const) if (value[key] !== undefined) usage[key] = (usage[key] ?? 0) + value[key]!;
  const total = value.totalTokens ?? (['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(key => value[key as keyof ModelUsage] === undefined) ? undefined : getModelUsageTotalTokens(value));
  if (total !== undefined) usage.totalTokens = (usage.totalTokens ?? 0) + total;
  const search = value.serverToolUse?.webSearchRequests ?? 0;
  const fetch = value.serverToolUse?.webFetchRequests ?? 0;
  if (search > 0 || fetch > 0) {
   usage.serverToolUse ??= { webSearchRequests: 0, webFetchRequests: 0 };
   usage.serverToolUse.webSearchRequests = (usage.serverToolUse.webSearchRequests ?? 0) + search;
   usage.serverToolUse.webFetchRequests = (usage.serverToolUse.webFetchRequests ?? 0) + fetch;
  }
 }
 return { usage, totalTokens: usage?.totalTokens, totalToolUseCount: turnCount ?? results };
}
async function flushMessages(state: RunnerState, execution: Execution, sink: RuntimeTaskMessageSink): Promise<void> {
 const messages = state.registry.drainMessages(execution.agentId);
 for (let index = 0; index < messages.length; index++) {
  const message = messages[index];
  if (!message) continue;
  try { await sink.send(message); }
  catch (error) {
   for (const pending of messages.slice(index)) state.registry.queueMessage(execution.agentId, pending);
   state.options.logger?.warn('Failed to flush pending subagent message', { ...traceContextToLogContext(execution.runTrace), agentId: execution.agentId, errorMessage: errorText(error), event: 'subagent.message.flush.failed', module: 'core.subagent', status: 'failed' });
   return;
  }
 }
}
export async function runChild(state: RunnerState, execution: Execution, runOptions: SubagentRunOptions, onReady?: () => Promise<void>, reportActivity?: () => void, resumeFromStore?: boolean): Promise<ChildResult> {
 let ready = false;
 const readiness = async () => { if (ready) return; await onReady?.(); ready = true; };
 const { request, profile, agentId, childSessionId } = execution;
 const child = await state.options.runExploreAgent({ agentId, agentType: request.agentType, allowedTools: allowedTools(state, profile), get background() { return state.registry.get(agentId)?.isBackgrounded === true; }, disallowedTools: profile.disallowedTools, sessionId: childSessionId, description: request.description, maxTurns: profile.maxTurns, onSessionReady: readiness, permissionMode: profile.permissionMode, prompt: request.prompt, profile, registerMessageSink(sink) { state.registry.update(agentId, task => ({ ...task, messageSink: sink })); void flushMessages(state, execution, sink); }, reportActivity, resumeFromStore, systemPrompt: profile.systemPrompt, workingDirectory: request.workingDirectory, workspaceRoot: request.workspaceRoot, traceContext: execution.childTrace }, runOptions);
 await readiness();
 const { usage, totalTokens, totalToolUseCount } = aggregate(child.events);
 const output: AgentCompletedOutput = { status: 'completed', agentId, agentType: request.agentType, description: request.description, prompt: request.prompt, content: [{ type: 'text', text: child.response }], totalToolUseCount, totalDurationMs: Date.now() - execution.startedMs, ...(totalTokens !== undefined ? { totalTokens } : {}), ...(usage ? { usage } : {}) };
 return { events: child.events, output };
}
