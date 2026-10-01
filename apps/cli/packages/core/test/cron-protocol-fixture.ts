// Synthetic protocol/session records; actual adapters remain the consumers.
import type { AutomationPort } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../src/tool/types.js";
import {
  automation,
  createProtocolAutomationPort,
  direct,
  entries,
  errorShape,
  json,
  ProtocolRequestError,
  schedules,
  updates,
  valid,
  type Operation,
} from "./cron-fixture.js";

export function protocolFixture() {
  const calls: { method: string; params: unknown }[] = [],
    warnings: unknown[] = [],
    titles: unknown[] = [];
  const sessions = new Map();
  const state = {
    own: undefined as unknown,
    bound: false,
    legacy: [] as unknown[],
    failure: undefined as unknown,
    bindingFailure: undefined as unknown,
    titleFailure: undefined as unknown,
    result: { ...automation, mode: "autoEdit", targetTaskId: "example-session" } as unknown,
    deleted: true,
  };
  const context = {
    sessions,
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
    async requestClient(
      method: string,
      params: unknown,
      schema: { parse: (v: unknown) => unknown },
    ) {
      calls.push({ method, params });
      if (method === "automation/checkTaskBinding") {
        if (state.bindingFailure) throw state.bindingFailure;
        return schema.parse({ bound: state.bound });
      }
      if (state.failure) throw state.failure;
      if (method === "automation/list") return schema.parse({ automations: state.legacy });
      if (method === "automation/delete") return schema.parse({ deleted: state.deleted });
      return schema.parse({ automation: state.result });
    },
  };
  const own = {
    activeAutomationId: "",
    traceContext: { traceId: "example-protocol-trace" },
    app: {
      sessionId: "own-session",
      runtime: {
        getSessionModelSelection: () => ({
          providerId: "own-provider",
          modelId: "own-model",
          options: { reasoningLevel: "high" },
        }),
      },
      getMode: () => "auto",
      async setCustomSessionTitle(value: unknown) {
        titles.push(value);
        if (state.titleFailure) throw state.titleFailure;
      },
    },
  };
  return {
    calls,
    warnings,
    titles,
    sessions,
    state,
    own,
    context,
    port: createProtocolAutomationPort(context, () => state.own) as AutomationPort,
  };
}
export const protocolCases = [
  "calendar",
  "null-delay",
  "relative",
  "finite",
  "carrier",
  "active",
  "bound",
  "binding-error",
  "legacy-bound",
  "legacy-free",
  "legacy-failure",
  "own-runtime",
  "legacy-runtime",
  "title-failure",
  "limit",
  "bad-model",
  "no-session",
  "update",
  "update-carrier",
  "update-clear",
  "list",
  "delete",
  "missing-delete",
  "bad-response",
];
export async function observeProtocol(variant: string) {
  const f = protocolFixture();
  let operation: Operation = "create",
    input = schedules[0] as Record<string, unknown>;
  const context = { sessionId: "example-session", model: "fallback-provider/fallback-model" };
  if (variant === "null-delay") input = schedules[1];
  if (variant === "relative") input = schedules[2];
  if (variant === "finite") input = schedules[3];
  if (variant === "carrier") input = schedules[4];
  if (variant === "active") {
    f.state.own = f.own;
    f.own.activeAutomationId = " example-active ";
  }
  if (variant === "bound") f.state.bound = true;
  if (variant === "binding-error") f.state.bindingFailure = new Error("Example transport failure");
  if (variant.startsWith("legacy-") && variant !== "legacy-runtime") {
    f.state.bindingFailure = new ProtocolRequestError(-32601, "Example missing method");
    if (variant === "legacy-bound")
      f.state.legacy = [{ ...automation, targetTaskId: context.sessionId }];
    if (variant === "legacy-failure") f.state.failure = new Error("Example list failure");
  }
  if (variant === "own-runtime" || variant === "title-failure") f.state.own = f.own;
  if (variant === "legacy-runtime") f.sessions.set(context.sessionId, f.own);
  if (variant === "title-failure") f.state.titleFailure = new Error("Example title failure");
  if (variant === "limit")
    f.state.failure = Object.assign(new Error("AUTOMATION_CREATE_LIMIT_REACHED example limit"), {
      code: "AUTOMATION_CREATE_LIMIT_REACHED",
    });
  if (variant === "bad-model") context.model = "invalid";
  if (variant === "no-session") context.sessionId = "";
  if (variant.startsWith("update")) {
    operation = "update";
    input = updates[
      variant === "update-carrier" ? 3 : variant === "update-clear" ? 2 : 1
    ] as Record<string, unknown>;
  }
  if (variant === "list") {
    operation = "list";
    input = {};
    f.state.legacy = [f.state.result, f.state.result];
  }
  if (variant.endsWith("delete")) {
    operation = "delete";
    input = valid.delete as Record<string, unknown>;
    f.state.deleted = variant !== "missing-delete";
  }
  if (variant === "bad-response") f.state.result = { automationId: "example-only" };
  const toolContext = {
    ...direct().context,
    automationPort: f.port,
    model: { providerId: context.model.split("/")[0], modelId: context.model.split("/")[1] },
    sessionId: context.sessionId,
  } as ToolExecutionContext;
  // bad-model tests the protocol fallback directly; all other cases use the actual handler.
  let result;
  try {
    result = {
      output:
        variant === "bad-model"
          ? await f.port.create(input as never, context)
          : await entries[operation].handler(input, toolContext),
    };
  } catch (error) {
    result = { error: errorShape(error) };
  }
  return json({ ...result, calls: f.calls, warnings: f.warnings, titles: f.titles });
}
