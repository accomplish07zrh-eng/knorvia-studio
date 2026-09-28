// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../../types.js";
import type { ToolDeadline } from "./pausable-deadline.js";

function cancellation(entry: ToolEntry, running: boolean) {
  const message = entry.cancellation?.userVisibleMessage ?? "Tool execution cancelled";
  return running
    ? createCoreError(CoreErrorType.ToolCancelled, message, {
        context: {
          cancellation: entry.cancellation?.cleanup ?? "none",
          toolName: entry.metadata.name,
        },
        recoverable: true,
      })
    : createCoreError(CoreErrorType.ToolCancelled, message);
}

export async function executeWithTimeout<TInput, TOutput>(
  handler: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>,
  input: TInput,
  context: ToolExecutionContext,
  deadline: ToolDeadline,
  controller: AbortController,
  entry: ToolEntry,
): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    if (context.abortSignal.aborted) {
      reject(cancellation(entry, false));
      return;
    }
    let settled = false;
    let timeoutOwnsAbort = false;
    type Outcome = { ok: true; value: TOutput } | { ok: false; error: unknown };
    const finish = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      deadline.clear();
      context.abortSignal.removeEventListener("abort", onAbort);
      if (outcome.ok) resolve(outcome.value);
      else reject(outcome.error);
    };
    const timeoutMs = deadline.timeoutMs;
    deadline.start(() => {
      timeoutOwnsAbort = true;
      const error = createCoreError(
        CoreErrorType.ToolTimeout,
        `Tool execution timed out after ${timeoutMs}ms`,
        {
          context: {
            cancellation: entry.cancellation?.cleanup ?? "none",
            queuedMs: deadline.queuedMs,
            timeoutMs,
            toolName: entry.metadata.name,
          },
          recoverable: true,
        },
      );
      controller.abort(error);
      finish({ ok: false, error });
    });
    const onAbort = () => {
      if (!timeoutOwnsAbort) finish({ ok: false, error: cancellation(entry, true) });
    };
    context.abortSignal.addEventListener("abort", onAbort);
    try {
      // 保留同步调用及 then→catch 两段反应；同步抛错也走结算门，避免遗留 timer 再取消已结束调用。
      handler(input, context)
        .then((value) => finish({ ok: true, value }))
        .catch((error) => finish({ ok: false, error }));
    } catch (error) {
      finish({ ok: false, error });
    }
  });
}
