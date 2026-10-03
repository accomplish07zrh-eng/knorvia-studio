import { SessionEventType, traceContextToLogContext, type SubagentPort, type SubagentRunOptions } from '@knorvia/contracts';
import { isTerminalRuntimeTask } from '../runtime-task/registry.js';
import { runChild } from './runner-child.js';
import { controllerFor, readinessGate } from './runner-cancellation.js';
import { writeMetadata } from './runner-artifacts.js';
import { emit, finishBackground, failBackground } from './runner-publication.js';
import { allowedTools, backgroundOutput, createExecution, registerExecution, resolveProfile, type Execution, type RunnerState } from './runner-state.js';
export async function backgroundWorker(state: RunnerState, execution: Execution, options: SubagentRunOptions, onReady: () => Promise<void>, onSetupFailure?: (error: unknown) => void, onSettled?: () => void, resumeFromStore?: boolean): Promise<void> {
 let ready = false;
 try {
  const task = state.registry.get(execution.agentId);
  if (!task || isTerminalRuntimeTask(task)) return;
  const child = await runChild(state, execution, options, async () => { await onReady(); ready = true; }, undefined, resumeFromStore);
  await finishBackground(state, execution, child.output);
 } catch (error) {
  if (!ready) { onSetupFailure?.(error); return; }
  await failBackground(state, execution, error);
 } finally { onSettled?.(); }
}
export function startMethod(state: RunnerState): NonNullable<SubagentPort['start']> {
 return async (rawRequest, options) => {
  const { request, profile } = resolveProfile(state, rawRequest);
  const execution = createExecution(state, request, profile);
  const output = backgroundOutput(execution);
  registerExecution(state, execution, true);
  try { await writeMetadata(execution, 'running'); }
  catch (error) { state.registry.remove(execution.agentId); throw error; }
  const { controller, dispose } = controllerFor(state, execution, options?.signal);
  const gate = readinessGate();
  void backgroundWorker(state, execution, { signal: controller.signal, ...(options?.model ? { model: options.model } : {}) }, async () => {
   await emit(state, execution, SessionEventType.SubagentSpawned, { agentId: execution.agentId, agentType: request.agentType, background: true, childSessionId: execution.childSessionId, description: request.description, prompt: request.prompt, parentToolCallId: request.parentToolCallId, status: 'running', allowedTools: [...allowedTools(state, profile)], outputFile: execution.outputFile, model: profile.modelSelection ? `${profile.modelSelection.providerId}/${profile.modelSelection.modelId}` : undefined });
   gate.resolve();
  }, gate.reject, dispose);
  try { await gate.promise; }
  catch (error) { controller.abort(error); state.registry.remove(execution.agentId); throw error; }
  state.options.logger?.info('Explore subagent background task started', { ...traceContextToLogContext(execution.runTrace), agentId: execution.agentId, agentType: request.agentType, event: 'subagent.background.started', module: 'core.subagent', parentToolCallId: request.parentToolCallId, status: 'started' });
  return output;
 };
}
