import { AgentErrorCode, CoreErrorType, SessionEventType, createCoreError, isCoreError, traceContextToLogContext, type SubagentPort } from '@knorvia/contracts';
import { ErrorPayloadRole, withErrorPayloadRole } from '../errors/error-payload.js';
import { runChild, type ChildResult } from './runner-child.js';
import { abortGuard, autoBackground, controllerFor, readinessGate, watchdog } from './runner-cancellation.js';
import { writeCompleted, writeFailed, writeMetadata } from './runner-artifacts.js';
import { completedTask, emit, finishBackground, failBackground } from './runner-publication.js';
import { allowedTools, backgroundOutput, createExecution, errorText, registerExecution, resolveProfile, withoutMessages, type RunnerState } from './runner-state.js';
export function runMethod(state: RunnerState): SubagentPort['run'] {
 return async (rawRequest, options) => {
  const { request, profile } = resolveProfile(state, rawRequest);
  const execution = createExecution(state, request, profile);
  registerExecution(state, execution, false);
  try { await writeMetadata(execution, 'running'); }
  catch (error) { state.registry.remove(execution.agentId); throw error; }
  const { controller, detach, dispose } = controllerFor(state, execution, options?.signal, true);
  const borrowed = options?.modelOverride !== undefined;
  if (borrowed) state.borrowed.add(execution.agentId);
  const activity = watchdog(state, execution, controller);
  const gate = readinessGate();
  activity.start();
  const child = runChild(state, execution, { signal: controller.signal, ...(options?.model ? { model: options.model } : {}), ...(options?.modelOverride ? { modelOverride: options.modelOverride } : {}) }, async () => {
   await emit(state, execution, SessionEventType.SubagentSpawned, { agentId: execution.agentId, agentType: request.agentType, childSessionId: execution.childSessionId, description: request.description, prompt: request.prompt, parentToolCallId: request.parentToolCallId, status: 'running', allowedTools: [...allowedTools(state, profile)], model: profile.modelSelection ? `${profile.modelSelection.providerId}/${profile.modelSelection.modelId}` : undefined });
   gate.resolve();
  }, activity.reportActivity);
  child.catch(gate.reject);
  try { await abortGuard(gate.promise, controller.signal, execution); }
  catch (error) { activity.stop(); controller.abort(error); dispose(); state.borrowed.delete(execution.agentId); state.registry.remove(execution.agentId); throw error; }
  state.options.logger?.info('Explore subagent spawned', { ...traceContextToLogContext(execution.runTrace), agentId: execution.agentId, agentType: request.agentType, event: 'subagent.spawned', module: 'core.subagent', parentToolCallId: request.parentToolCallId, status: 'running' });
  let cancelTimer: (() => void) | undefined;
  try {
   const guarded = abortGuard(child, controller.signal, execution);
   const races: Array<Promise<{ kind: 'completed'; child: ChildResult } | { kind: 'backgrounded' | 'ignored' }>> = [guarded.then(result => ({ kind: 'completed', child: result }))];
   if (!borrowed) {
    races.push(state.registry.waitForBackgroundRequest(execution.agentId, { signal: controller.signal }).then(task => ({ kind: task?.isBackgrounded ? 'backgrounded' : 'ignored' })));
    if (state.autoBackgroundMs !== undefined) { const timer = autoBackground(state, execution, controller.signal); cancelTimer = timer.cancel; races.push(timer.promise.then(kind => ({ kind }))); }
   }
   const winner = await Promise.race(races);
   if (winner.kind === 'backgrounded') {
    detach(); activity.stop();
    void child.then(result => finishBackground(state, execution, result.output)).catch(error => failBackground(state, execution, error)).finally(dispose);
    return backgroundOutput(execution);
   }
   const result = winner.kind === 'completed' ? winner.child : await guarded;
   cancelTimer?.(); activity.stop(); dispose(); state.borrowed.delete(execution.agentId);
   await writeCompleted(execution, result.output);
   state.registry.update(execution.agentId, task => completedTask(task, result.output));
   await emit(state, execution, SessionEventType.SubagentStopped, { agentId: execution.agentId, agentType: request.agentType, childSessionId: execution.childSessionId, parentToolCallId: request.parentToolCallId, status: 'completed', totalDurationMs: result.output.totalDurationMs, totalToolUseCount: result.output.totalToolUseCount, totalTokens: result.output.totalTokens });
   state.options.logger?.info('Explore subagent completed', { ...traceContextToLogContext(execution.runTrace), agentId: execution.agentId, durationMs: result.output.totalDurationMs, event: 'subagent.completed', module: 'core.subagent', status: 'completed', totalToolUseCount: result.output.totalToolUseCount, totalTokens: result.output.totalTokens });
   return result.output;
  } catch (error) {
   activity.stop(); dispose(); state.borrowed.delete(execution.agentId);
   const duration = Date.now() - execution.startedMs;
   const message = errorText(error);
   await writeFailed(execution, message);
   state.registry.update(execution.agentId, task => ({ ...withoutMessages(task), status: 'failed', completedAt: new Date(), error: message, usage: { durationMs: duration } }));
   await emit(state, execution, SessionEventType.SubagentStopped, { agentId: execution.agentId, agentType: request.agentType, childSessionId: execution.childSessionId, parentToolCallId: request.parentToolCallId, status: 'failed', totalDurationMs: duration, error: message });
   if (isCoreError(error)) throw error;
   throw createCoreError(CoreErrorType.ToolExecutionFailed, 'Explore subagent failed', { cause: error instanceof Error ? error : undefined, context: withErrorPayloadRole({ code: AgentErrorCode.CHILD_RUNTIME_FAILED, agentId: execution.agentId, agentType: request.agentType, parentToolCallId: request.parentToolCallId }, ErrorPayloadRole.Wrapper), recoverable: true });
  } finally { activity.stop(); cancelTimer?.(); }
 };
}
