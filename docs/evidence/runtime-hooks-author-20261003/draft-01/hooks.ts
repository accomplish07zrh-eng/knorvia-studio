import {
  HookEventName,
  type HookRunResult,
  type Model,
  type TraceContext,
  type TurnState,
} from "../deps.js";
import type { HookEventName as HookEventNameType } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";

type SessionStartSource = "startup" | "resume" | "clear" | "compact";

const emptyHookResult: HookRunResult = { additionalContexts: [] };

function summarizeAttachments(
  attachments: TurnState["attachments"] | undefined,
): string | undefined {
  if (!attachments?.length) return undefined;
  return attachments
    .map((attachment, index) => {
      const prefix = `${index + 1}:${attachment.type}`;
      if (attachment.path) return `${prefix}:${attachment.path}`;
      if (attachment.content) {
        return `${prefix}:inline:${attachment.content.length} chars`;
      }
      return prefix;
    })
    .join("\n");
}

export async function runSessionStartHooks(
  this: AgentRuntimeInternal,
  source: SessionStartSource,
  traceContext: TraceContext,
  signal?: AbortSignal,
  model?: Pick<Model, "providerId" | "modelId">,
): Promise<HookRunResult> {
  if (this.sessionStartHookRan) return emptyHookResult;
  await this.workspaceHookAdmission?.activate(source, signal);
  this.sessionStartHookRan = true;
  if (!this.hookRunner) return emptyHookResult;

  const selection = model ?? this.getSessionModelSelection();
  return this.hookRunner.run(
    {
      agentName: this.config.agentName,
      cwd: this.workingDirectory,
      hookEventName: HookEventName.SessionStart,
      mode: this.getMode(),
      model: selection
        ? `${selection.providerId}/${selection.modelId}`
        : undefined,
      sessionId: this.sessionId,
      source,
      timestamp: new Date().toISOString(),
      traceId: traceContext.traceId,
      turnId: traceContext.turnId,
    },
    { matchValue: source, signal },
  );
}

export async function runUserPromptSubmitHooks(
  this: AgentRuntimeInternal,
  prompt: string,
  attachments: TurnState["attachments"] | undefined,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  if (!this.hookRunner) return emptyHookResult;
  return this.hookRunner.run(
    {
      agentName: this.config.agentName,
      attachmentsSummary: summarizeAttachments(attachments),
      cwd: this.workingDirectory,
      hookEventName: HookEventName.UserPromptSubmit,
      mode: this.getMode(),
      prompt,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      traceId: traceContext.traceId,
      turnId: traceContext.turnId,
    },
    { signal },
  );
}

export async function runStopHooks(
  this: AgentRuntimeInternal,
  response: string,
  toolCallCount: number,
  traceContext: TraceContext,
  signal?: AbortSignal,
  stopHookActive = false,
): Promise<HookRunResult> {
  if (!this.hookRunner) return emptyHookResult;
  const responsePreview =
    response.length <= 4000 ? response : `${response.slice(0, 4000)}...`;
  return this.hookRunner.run(
    {
      agentName: this.config.agentName,
      cwd: this.workingDirectory,
      hookEventName: HookEventName.Stop,
      mode: this.getMode(),
      responsePreview,
      responseText: response,
      sessionId: this.sessionId,
      stopHookActive,
      timestamp: new Date().toISOString(),
      toolCallCount,
      traceId: traceContext.traceId,
      turnId: traceContext.turnId,
    },
    { signal },
  );
}

export function injectHookAdditionalContextIntoMessageHistory(
  this: AgentRuntimeInternal,
  eventName: HookEventNameType,
  additionalContexts: readonly string[],
): RuntimeMessageEntry | undefined {
  if (additionalContexts.length === 0) return undefined;
  const contexts = additionalContexts
    .map((context, index) => `#${index + 1}\n${context}`)
    .join("\n\n");
  let body = `${eventName} hook additional context: \n${contexts}`;
  if (body.length > 24000) body = `${body.slice(0, 24000)}...`;
  const entry = systemReminderAttachmentEntry("hook_context", body);
  this.messageHistory.addEntries([entry]);
  return entry;
}

export function shouldContinueAfterStopHooks(
  result: HookRunResult,
  continuationCount: number,
): boolean {
  return (
    result.stopShouldContinue === true &&
    result.additionalContexts.length > 0 &&
    continuationCount < 3
  );
}
