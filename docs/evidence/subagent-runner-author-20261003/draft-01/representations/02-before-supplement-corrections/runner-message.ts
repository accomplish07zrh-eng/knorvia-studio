import { randomUUID } from 'node:crypto';
import { SessionEventType, type SubagentPort, type SubagentSendMessageRequest, type SubagentSendMessageResult } from '@knorvia/contracts';
import { isTerminalRuntimeTask, type RuntimeTaskPendingMessage, type RuntimeTaskSnapshot } from '../runtime-task/registry.js';
import { backgroundWorker } from './runner-background.js';
import { controllerFor, readinessGate } from './runner-cancellation.js';
import { writeMetadata } from './runner-artifacts.js';
import { emit } from './runner-publication.js';
import { createExecution, registerExecution, type Execution, type RunnerState } from './runner-state.js';
function failed(request: SubagentSendMessageRequest, error: string): SubagentSendMessageResult {
 return { status: 'failed', messageId: `msg_${randomUUID()}`, agentId: request.to, error, message: error };
}
function succeeded(task: RuntimeTaskSnapshot, message: RuntimeTaskPendingMessage, delivery: 'queued' | 'steered' | 'resumed_background', execution?: Execution): SubagentSendMessageResult {
 const outputFile = execution?.outputFile ?? task.outputFile;
 const text = delivery === 'queued' ? `Message queued for delivery to ${task.agentId} at its next tool round.` : delivery === 'resumed_background' ? `Agent "${task.agentId}" was stopped (${task.status}); resumed it in the background with your message. You'll be notified when it finishes. Output: ${outputFile}` : `Message ${message.id} was sent to its active turn for local agent ${task.agentId}.`;
 return { status: 'success', messageId: message.id, delivery, agentId: task.agentId, taskId: task.taskId, outputFile, message: text };
}
export function messageMethod(state: RunnerState): NonNullable<SubagentPort['sendMessage']> {
 return async (request, options) => {
  if (options?.signal?.aborted) return failed(request, `SendMessage was aborted for ${request.to}.`);
  const task = state.registry.get(request.to);
  if (!task || task.type !== 'local_agent') return failed(request, `No active local_agent task found for target ${request.to}.`);
  const message: RuntimeTaskPendingMessage = { id: `msg_${randomUUID()}`, isMeta: true, message: request.message, origin: { kind: 'coordinator', toolCallId: String(request.parentToolCallId) }, queuedAt: new Date(), summary: request.summary, traceContext: request.trace };
  if (!isTerminalRuntimeTask(task)) {
   if (task.messageSink) {
    try { return succeeded(task, message, await task.messageSink.send(message)); }
    catch { state.registry.queueMessage(task.taskId, message); return succeeded(task, message, 'queued'); }
   }
   state.registry.queueMessage(task.taskId, message);
   return succeeded(task, message, 'queued');
  }
  const profile = state.profiles.find(item => item.name === task.agentType);
  if (!profile) return failed(request, `Cannot resume local agent ${task.agentId}: profile ${task.agentType} is unavailable.`);
  if (!task.childSessionId) return failed(request, `Cannot resume local agent ${task.agentId}: missing child session id.`);
  const execution = createExecution(state, { sessionId: request.sessionId, turnId: request.turnId, parentToolCallId: request.parentToolCallId, agentType: task.agentType, description: request.summary || task.description, prompt: request.message, workingDirectory: request.workingDirectory, workspaceRoot: request.workspaceRoot, trace: request.trace }, profile, task);
  registerExecution(state, execution, true);
  try { await writeMetadata(execution, 'running', { resumedAt: new Date().toISOString(), resumedFromMessageId: message.id }); }
  catch (error) { state.registry.register(task); throw error; }
  const { controller, dispose } = controllerFor(state, execution);
  const gate = readinessGate();
  void backgroundWorker(state, execution, { signal: controller.signal }, async () => {
   await emit(state, execution, SessionEventType.SubagentSpawned, { agentId: execution.agentId, agentType: execution.request.agentType, background: true, childSessionId: execution.childSessionId, description: execution.request.description, outputFile: execution.outputFile, parentToolCallId: execution.request.parentToolCallId, prompt: execution.request.prompt, resumed: true, status: 'running' });
   gate.resolve();
  }, gate.reject, dispose, true);
  try { await gate.promise; }
  catch (error) { controller.abort(error); state.registry.register(task); throw error; }
  return succeeded(task, message, 'resumed_background', execution);
 };
}
