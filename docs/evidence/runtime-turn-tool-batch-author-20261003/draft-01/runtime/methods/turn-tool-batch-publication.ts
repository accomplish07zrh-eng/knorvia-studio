import type { MessageId, Model, ToolCall, ToolCallId, ToolExecutionResult, TraceContext } from "../deps.js";
import {
  createStreamRecoveryAnchorId, emitStreamRecoveryAnchor, emitStreamingToolLedgerUpdate,
  isErrorForToolResult, isTurnCancellationError, modelContentForToolResult,
  stringifyToolResultOutput,
} from "../helpers/index.js";
import { persistToolResultMediaAttachments } from "../helpers/tool-result-media-persistence.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import { projectToolNameForNonEmptyBoundary } from "./tool-part-persistence.js";
import { completedToolPartMetadata, mcpToolPartMetadata } from "./tool-part-metadata.js";
import { recordToolUsageFromResult } from "./turn-tool-usage.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import { createRuntimeToolResultEntry } from "../../agent/message-history.js";
import { commitTurnRequestEntries } from "./turn-output-token-continuation.js";
import type { ToolBatchPartFacts } from "./turn-tools.js";
import { steerToolBatchFollowUp } from "./turn-tool-batch-follow-up.js";

export async function publishToolBatchResults(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    results: ToolExecutionResult[];
    parts: Map<ToolCallId, ToolBatchPartFacts>;
    declared: Map<ToolCallId, ToolCall>;
    streamed: Map<ToolCallId, StreamedToolExecutionResult>;
    providerId: Model["providerId"];
    modelId: Model["modelId"];
  },
): Promise<void> {
  let checkpointCancellation: unknown;
  for (const result of options.results) {
    await recordToolUsageFromResult(runtime, result, options.modelTraceContext);
    const output = stringifyToolResultOutput(result);
    const isError = isErrorForToolResult(result);
    const boundary = projectToolNameForNonEmptyBoundary(result.toolName);
    const part = options.parts.get(result.toolCallId);
    const modelContent = modelContentForToolResult(result);
    if (part) {
      const common = {
        id: part.partID,
        sessionID: runtime.sessionId,
        messageID: options.assistantMessageId,
        type: "tool" as const,
        callID: result.toolCallId,
        declarationIndex: part.declarationIndex,
        tool: boundary.toolName,
        metadata: boundary.metadata,
      };
      if (!isError) {
        const media = await persistToolResultMediaAttachments({
          artifactStore: runtime.artifactStore,
          assistantMessageId: options.assistantMessageId,
          content: modelContent,
          sessionId: runtime.sessionId,
          sessionStore: runtime.sessionStore,
          signal: state.turnAbortSignal,
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          traceContext: options.modelTraceContext,
          turnId: state.turnId,
        });
        await runtime.persistPart({
          ...common,
          state: {
            status: "completed",
            input: part.input,
            output,
            title: result.toolName,
            metadata: {
              ...completedToolPartMetadata(result),
              ...(media ? { modelContentLayout: media.modelContentLayout } : {}),
            },
            time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
            ...(media ? { attachments: media.attachments } : {}),
          },
        }, options.modelTraceContext);
      } else {
        await runtime.persistPart({
          ...common,
          state: {
            status: "error",
            input: part.input,
            error: result.error?.message ?? output,
            metadata: {
              ...mcpToolPartMetadata(runtime.registry.getMetadata(result.toolName)?.mcpPresentation),
              ...(typeof modelContent === "string" ? { modelContent } : {}),
            },
            time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
          },
        }, options.modelTraceContext);
      }
    }
    runtime.logger?.debug("addToolResult", {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      success: result.success,
      contentLength: output.length,
    });
    commitTurnRequestEntries(runtime, state.turnRequestState, [
      createRuntimeToolResultEntry(result.toolCallId, result.toolName, modelContent, isError),
    ]);
    try {
      await runtime.emitFileMutationCheckpoint({
        abortSignal: state.turnAbortSignal,
        events: state.events,
        messageId: state.userMessageId,
        result,
        toolMessageId: options.assistantMessageId,
        traceContext: options.modelTraceContext,
      });
    } catch (error) {
      if (!isTurnCancellationError(error, state.turnAbortSignal)) throw error;
      checkpointCancellation ??= error;
      continue;
    }
    const call = options.declared.get(result.toolCallId);
    if (call) {
      const recoveryAnchorId = createStreamRecoveryAnchorId(options.assistantMessageId, result.toolCallId);
      const committedAt = result.completedAt;
      await emitStreamRecoveryAnchor(runtime, state.events, options.modelTraceContext, {
        id: recoveryAnchorId,
        assistantMessageId: options.assistantMessageId,
        toolCallId: result.toolCallId,
        toolName: boundary.toolName,
        success: result.success,
        resultPartId: part?.partID,
        committedAt,
      });
      await emitStreamingToolLedgerUpdate(runtime, state.events, options.modelTraceContext, {
        assistantMessageId: options.assistantMessageId,
        event: "tool_result_committed",
        toolCall: call,
        input: part?.input ?? call.input,
        startedAt: new Date(part?.startedAt ?? result.startedAt.getTime()),
        committedAt,
        resultPartId: part?.partID,
        recoveryAnchorId,
        executionTiming: options.streamed.has(result.toolCallId) ? "during_stream" : "end_of_stream",
        providerId: options.providerId,
        modelId: options.modelId,
      });
    }
    await steerToolBatchFollowUp(runtime, state, result, options.modelTraceContext);
  }
  if (checkpointCancellation) throw checkpointCancellation;
}
