// Exposed-source effect interpreter; public validators/errors remain applicable contracts.
import {
  CoreErrorType,
  createCoreError,
  OffPeakCreateInputSchema,
  OffPeakListInputSchema,
  type OffPeakCreateInput,
  type OffPeakListOutput,
} from "@knorvia/contracts";
import type { ToolExecutionContext, ToolHandler } from "../types.js";
import { decideOffPeakCreation } from "./off-peak-result.js";

type IdleTurnGuard = (context: ToolExecutionContext, toolName: string) => void;
type Operation = "create" | "list";
type AdmittedCall = { kind: "create"; input: OffPeakCreateInput } | { kind: "list" };
type CallPlan = AdmittedCall | { kind: "unavailable"; toolName: string };
const NAMES = { create: "OffPeakCreate", list: "OffPeakList" } as const;

function admit(
  operation: Operation,
  input: unknown,
  context: ToolExecutionContext,
  guard?: IdleTurnGuard,
): AdmittedCall {
  if (operation === "create") {
    guard!(context, NAMES.create);
    return { kind: "create", input: OffPeakCreateInputSchema.parse(input) };
  }
  OffPeakListInputSchema.parse(input);
  return { kind: "list" };
}

function plan(call: AdmittedCall, context: ToolExecutionContext): CallPlan {
  return context.offPeakPort ? call : { kind: "unavailable", toolName: NAMES[call.kind] };
}

/** One interpreter owns terminal throws/returns and exactly one selected port effect. */
function handlerFor(operation: Operation, guard?: IdleTurnGuard): ToolHandler {
  return async (input, context) => {
    const call = plan(admit(operation, input, context, guard), context);
    switch (call.kind) {
      case "unavailable":
        throw createCoreError(
          CoreErrorType.ConfigurationError,
          `OffPeakPort is not configured for ${call.toolName}`,
          {
            context: { toolCallId: context.toolCallId, toolName: call.toolName },
            recoverable: false,
          },
        );
      case "list":
        return { tasks: await context.offPeakPort!.list() } satisfies OffPeakListOutput;
      case "create": {
        // Re-read the configured port at invocation, retain its receiver, then read the binding.
        const outcome = await context.offPeakPort!.create(call.input, {
          sessionId: context.sessionId,
        });
        const decision = decideOffPeakCreation(outcome);
        switch (decision.kind) {
          case "created":
            return decision.value;
          case "refused":
            throw createCoreError(CoreErrorType.ToolExecutionFailed, decision.message, {
              context: {
                toolCallId: context.toolCallId,
                toolName: NAMES.create,
                failureStage: decision.failure.failureStage,
                errorCategory: decision.failure.errorCategory,
                errorCode: decision.failure.errorCode,
              },
              recoverable: false,
              retryable: false,
            });
        }
      }
    }
  };
}

export const createOffPeakCreateHandler = (guard: IdleTurnGuard): ToolHandler =>
  handlerFor("create", guard);
export const executeOffPeakList = handlerFor("list");
