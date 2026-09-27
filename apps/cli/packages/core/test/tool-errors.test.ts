// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, createCoreError } from "@knorvia/contracts";
import {
  createErrorResult,
  createPermissionErrorResult,
  createToolHandlerFailureError,
  isToolHandlerFailure,
  isToolHandlerFailureError,
} from "../src/tool/executor/errors.js";
import type { ExecutableToolCall, ToolHandlerFailure } from "../src/tool/types.js";

const call = { id: "call-1", name: "fixture", input: {} } as ExecutableToolCall;
const handler = (errorCode = 7): ToolHandlerFailure => ({
  result: false,
  errorCode,
  message: "\nprovider text\n",
});

test("handler error predicate validates metadata without reading the payload a second time", () => {
  let reads = 0;
  const error = createCoreError(CoreErrorType.ToolExecutionFailed, "m", {
    context: {
      get toolHandlerFailure() {
        if (++reads > 1) throw new Error("must not extract in a predicate");
        return handler();
      },
    },
  });
  assert.equal(isToolHandlerFailureError(error), true);
  assert.equal(reads, 1);
});

test("ordinary error envelopes preserve shape, stack, zero duration and distinct timestamps", () => {
  const error = new Error("  summary\n text  ");
  const result = createErrorResult(call, error);
  assert.deepEqual(Object.keys(result), [
    "toolCallId",
    "toolName",
    "success",
    "output",
    "error",
    "durationMs",
    "startedAt",
    "completedAt",
  ]);
  assert.deepEqual(result.error, { type: "Error", message: "summary text", stack: error.stack });
  assert.equal(result.toolCallId, call.id);
  assert.equal(result.toolName, call.name);
  assert.equal(result.success, false);
  assert.equal(result.output, null);
  assert.equal(result.durationMs, 0);
  assert.ok(result.startedAt instanceof Date && result.completedAt instanceof Date);
  assert.notEqual(result.startedAt, result.completedAt);
  assert.equal(createErrorResult(call, error, -1).durationMs, -1);
  assert.equal(Number.isNaN(createErrorResult(call, error, NaN).durationMs), true);
});

test("handler failures retain their identity and zero code takes precedence", () => {
  const failure = handler(0);
  const error = createToolHandlerFailureError(call, failure);
  assert.equal(isToolHandlerFailureError(error), true);
  assert.equal((error as ReturnType<typeof createCoreError>).context!.toolHandlerFailure, failure);
  assert.deepEqual((error as ReturnType<typeof createCoreError>).context, {
    code: 0,
    toolHandlerFailure: failure,
    toolCallId: call.id,
    toolName: call.name,
  });
  const result = createErrorResult(call, error);
  assert.equal(result.error!.code, "0");
  assert.equal(result.error!.type, CoreErrorType.ToolExecutionFailed);
  assert.equal(result.error!.message, "provider text");
  assert.equal(result.modelContent, "<tool_use_error>\nprovider text\n</tool_use_error>");
  assert.equal(
    Object.keys(result).indexOf("modelContent") < Object.keys(result).indexOf("durationMs"),
    true,
  );
});

test("handler recognition accepts finite numbers and rejects malformed flags or containers", () => {
  for (const code of [0, -1, 1.5]) assert.equal(isToolHandlerFailure(handler(code)), true);
  for (const value of [
    null,
    [],
    {},
    { ...handler(), result: 0 },
    { ...handler(), errorCode: "7" },
    handler(NaN),
    handler(Infinity),
    { ...handler(), message: 1 },
  ])
    assert.equal(isToolHandlerFailure(value), false);
  assert.equal(
    isToolHandlerFailureError(
      Object.assign(new Error("x"), { context: { toolHandlerFailure: handler() } }),
    ),
    false,
  );
});

test("first model validation content outranks handler wrapping, including empty strings", () => {
  for (const content of ["<tool_use_error>specific</tool_use_error>", ""]) {
    const error = createCoreError(CoreErrorType.ToolExecutionFailed, "m", {
      context: { toolHandlerFailure: handler(), initialInputValidationModelContent: content },
    });
    assert.equal(createErrorResult(call, error).modelContent, content);
  }
  assert.equal(
    createErrorResult(
      call,
      createCoreError(CoreErrorType.ToolExecutionFailed, "m", {
        context: { initialInputValidationModelContent: 1 },
      }),
    ).modelContent,
    undefined,
  );
});

test("only declared feedback sources or explicit formatting preserve full user text", () => {
  const message = " \n" + "feedback ".repeat(100) + "\n ";
  for (const reasonSource of ["plan_approval_feedback", "workflow_refine_feedback"]) {
    const error = createCoreError(CoreErrorType.PermissionDenied, message, {
      context: { reasonSource },
    });
    const result = createErrorResult(call, error);
    assert.equal(result.error!.message, message);
    assert.equal(result.error!.reasonSource, reasonSource);
  }
  const ordinary = createCoreError(CoreErrorType.PermissionDenied, message, {
    context: { reasonSource: "unknown" },
  });
  assert.equal(createErrorResult(call, ordinary).error!.message.length, 500);
  assert.equal(createErrorResult(call, ordinary).error!.reasonSource, undefined);
  assert.equal(
    createErrorResult(call, ordinary, undefined, { preserveReasonFormatting: true }).error!.message,
    message,
  );
  assert.equal(
    createErrorResult(call, new Error(message), undefined, { preserveReasonFormatting: true })
      .error!.message,
    message,
  );
});

test("permission wrapping preserves empty reason and overrides only copied tool identity", () => {
  const nested = { same: true };
  const context = { toolName: "wrong", nested, reasonSource: "workflow_refine_feedback" };
  const empty = createPermissionErrorResult(call, "", context);
  assert.equal(empty.error!.message, "");
  assert.equal(context.toolName, "wrong");
  assert.equal(
    createPermissionErrorResult(call, undefined, {}).error!.message,
    "Permission denied for fixture",
  );
  const preserve = createPermissionErrorResult(
    call,
    "\nraw\n",
    {},
    { preserveReasonFormatting: true },
  );
  assert.equal(preserve.error!.message, "\nraw\n");
});

test("projected cause code and detail survive the tool result envelope", () => {
  const error = createCoreError(CoreErrorType.ModelError, "wrapper", {
    context: { errorPayloadRole: "wrapper" },
    cause: Object.assign(new Error(" actual\nreason "), {
      providerCode: "REMOTE",
      detail: "extra",
    }),
  });
  const result = createErrorResult(call, error);
  assert.deepEqual(result.error, {
    type: CoreErrorType.ModelError,
    message: "actual reason",
    code: "REMOTE",
    detail: "wrapper\nextra",
    stack: error.stack,
  });
});

test("feedback source keeps ordered short-circuit checks and its final property read", () => {
  let reads = 0;
  const message = "feedback\n".repeat(75);
  const error = createCoreError(CoreErrorType.PermissionDenied, message, {
    context: {
      get reasonSource() {
        return ++reads === 1 ? "other" : "workflow_refine_feedback";
      },
    },
  });
  const result = createErrorResult(call, error);
  assert.equal(reads, 3);
  assert.equal(result.error!.message, message);
  assert.equal(result.error!.reasonSource, "workflow_refine_feedback");
});

test("feedback text is captured before result metadata and call identity is read before error type", () => {
  let reads = 0;
  const error = createCoreError(CoreErrorType.PermissionDenied, "original feedback", {
    context: { reasonSource: "plan_approval_feedback" },
  });
  Object.defineProperty(error, "type", {
    get() {
      if (++reads === 2) error.message = "changed by metadata read";
      return CoreErrorType.PermissionDenied;
    },
  });
  assert.equal(createErrorResult(call, error).error!.message, "original feedback");
  assert.equal(reads, 2);

  const mutable = createCoreError(CoreErrorType.PermissionDenied, "m");
  const dynamicCall = {
    ...call,
    get id() {
      mutable.type = CoreErrorType.UnknownError;
      return call.id;
    },
  };
  assert.equal(createErrorResult(dynamicCall, mutable).error!.type, CoreErrorType.UnknownError);
});
