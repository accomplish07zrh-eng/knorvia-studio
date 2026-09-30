// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger, ModelStatusSink, ModelStreamEvent } from "@knorvia/contracts";
import {
  getApiCallResponseBody,
  getErrorCode,
  getResponseHeaders,
  getStatusCode,
} from "./failure-inspection.js";
import { isModelStreamIdleTimeoutError } from "./stream-idle-timeout.js";
import { publishModelStatus, type ModelStatusContext } from "./runner-status.js";
export function isRetrySafePreludeStreamEvent(event: ModelStreamEvent): boolean {
  switch (event.type) {
    case "start":
    case "text_start":
    case "text_end":
    case "reasoning_start":
    case "reasoning_end":
    case "tool_input_start":
    case "tool_input_delta":
    case "tool_input_end":
      return true;
    case "text_delta":
      return event.text.length === 0;
    case "reasoning_delta":
      return event.text.length === 0;
    default:
      return false;
  }
}
export namespace isRetrySafePreludeStreamEvent {
  export function toCompactStreamBoundary(
    raw: Record<string, unknown>,
  ): ModelStreamEvent | undefined {
    const index = typeof raw.index === "number" ? raw.index : null;
    if (raw.type === "message_start")
      return { type: "compact_stream_boundary", boundary: "provider_response_start" };
    if (raw.type === "content_block_start") {
      const block = raw.content_block as Record<string, unknown> | undefined;
      return {
        type: "compact_stream_boundary",
        boundary: "provider_content_block_start",
        blockType: typeof block?.type === "string" ? block.type : null,
        index,
      };
    }
    if (raw.type === "content_block_delta") {
      const delta = raw.delta as Record<string, unknown> | undefined;
      return {
        type: "compact_stream_boundary",
        boundary: "provider_content_block_delta",
        deltaType: typeof delta?.type === "string" ? delta.type : null,
        index,
      };
    }
    if (raw.type === "content_block_stop")
      return { type: "compact_stream_boundary", boundary: "provider_content_block_stop", index };
    if (raw.type === "message_delta") {
      const delta = raw.delta as Record<string, unknown> | undefined;
      return {
        type: "compact_stream_boundary",
        boundary: "provider_stop_reason",
        present: delta?.stop_reason !== null && delta?.stop_reason !== undefined,
      };
    }
    return undefined;
  }
  export function compactBodyFailureAllowsRetry(
    error: unknown,
    errorChunkObserved: boolean,
  ): boolean {
    const responseType = getResponseHeaders(error)?.["content-type"]?.toLowerCase() ?? "";
    const bodyFailure =
      errorChunkObserved ||
      responseType.includes("text/event-stream") ||
      getApiCallResponseBody(error) !== undefined;
    if (!bodyFailure) return true;
    if (isModelStreamIdleTimeoutError(error)) return true;
    const code = (getErrorCode(error) ?? "").toUpperCase();
    return (
      getStatusCode(error) === undefined &&
      ["ECONNRESET", "EPIPE", "CONNECTIONCLOSED"].includes(code)
    );
  }
  export async function cleanupStreamAttempt(
    iterator: AsyncIterator<unknown>,
    consumeStream: (() => PromiseLike<unknown>) | undefined,
    logger?: Logger,
  ): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    if (iterator.return) jobs.push(Promise.resolve().then(() => iterator.return!()));
    if (consumeStream) jobs.push(Promise.resolve().then(() => consumeStream()));
    if (!jobs.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = Promise.allSettled(jobs).then((results) => {
      for (const result of results)
        if (result.status === "rejected")
          logger?.warn("Model stream cleanup failed", { error: String(result.reason) });
      return "settled" as const;
    });
    const outcome = await Promise.race([
      settled,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), 1000);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (outcome === "timeout") logger?.warn("Model stream cleanup exceeded 1000ms");
  }
  export async function closeAbandonedCompactStream(input: {
    abortController: AbortController;
    admissionTicket?: ModelStatusSink;
    attempt: number;
    committed: boolean;
    consumeStream?: () => PromiseLike<unknown>;
    context: ModelStatusContext;
    iterator?: AsyncIterator<unknown>;
    logger?: Logger;
    requestStatusSink?: ModelStatusSink;
    statusSink?: ModelStatusSink;
  }): Promise<void> {
    const error = new DOMException("Model stream consumer closed", "AbortError");
    input.abortController.abort(error);
    if (input.iterator)
      await cleanupStreamAttempt(input.iterator, input.consumeStream, input.logger);
    await publishModelStatus(
      {
        ...input.context,
        type: "model_request_failed",
        timestamp: new Date().toISOString(),
        attempt: input.attempt,
        reason: "cancelled",
        retryable: false,
        message: error.message,
        errorCode: "model_request_cancelled",
        streamOutputCommitted: input.committed,
      } as never,
      { ...input, failureError: error },
    );
  }
}
