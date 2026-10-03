// Source-exposed observations; session/filesystem/approval effects are synthetic.
import { readFile } from "node:fs/promises";
import { sep } from "node:path";
import {
  createFileSystemError,
  type SessionModePort,
  type FileSystemPort,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";
import { fixturePermissionBroker } from "./permission-client-fixture.js";

export const emitted = process.env.KNORVIA_PLAN_MODE_TEST_EMITTED === "1";
const load = async (path: string) => {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url); // Never let an absent emitted consumer fall back to source.
  return import(url.href);
};
export const module = await load("tool/handlers/plan-mode");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/plan-mode.d.ts", import.meta.url),
  "utf8",
);
export const validPlan = "  Synthetic implementation plan\r\nSecond fictional step.  ";
export const date = Date.UTC(2026, 0, 15, 12);
export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export const errorShape = (error: any): any =>
  json({
    name: error?.name,
    type: error?.type,
    code: error?.code,
    message: error?.message,
    context: error?.context,
    recoverable: error?.recoverable,
    retryable: error?.retryable,
    issues: error?.issues,
    cause: error?.cause instanceof Error ? errorShape(error.cause) : error?.cause,
  });
export async function clock<T>(run: () => T | Promise<T>): Promise<T> {
  const Original = globalThis.Date;
  class SyntheticDate extends Original {
    constructor(value?: string | number | Date) {
      super(value === undefined ? date : value);
    }
    static override now() {
      return date;
    }
  }
  globalThis.Date = SyntheticDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = Original;
  }
}
export interface Scenario {
  label: string;
  operation?: "enter" | "exit";
  input?: unknown;
  missingPort?: boolean;
  portKind?: "empty" | "nonfunction-enabled" | "nonfunction-transition" | "nonfunction-mode";
  mode?: string;
  enabled?: unknown;
  omitEnabled?: boolean;
  noFileSystem?: boolean;
  writeFailure?: string;
  transitionFailure?: string;
  transition?: unknown;
  sessionId?: unknown;
  abort?: boolean;
}
export function entryFor(operation: Scenario["operation"], candidate = module) {
  return operation === "enter" ? candidate.enterPlanModeToolEntry : candidate.exitPlanModeToolEntry;
}
export const writeError = (kind: string) =>
  kind.startsWith("fs:")
    ? createFileSystemError({ code: kind.slice(3) as any, message: "Synthetic filesystem refusal" })
    : kind === "error"
      ? new Error("Synthetic persistence error")
      : kind === "cancel-like"
        ? { code: "cancelled", message: "Synthetic non-port cancellation" }
        : "Synthetic thrown value";
export function fixture(c: Scenario) {
  const tape: string[] = [],
    calls: any[] = [],
    writes: any[] = [];
  const controller = new AbortController();
  const signalExpectation = { signal: controller.signal };
  if (c.abort) controller.abort();
  const behavior = {
    mode: c.mode ?? "plan",
    enabled: Object.hasOwn(c, "enabled") ? c.enabled : true,
  };
  const port = {
    getMode() {
      tape.push("getMode");
      calls.push({ phase: "getMode", receiver: this === port });
      return behavior.mode;
    },
    getPrePlanMode() {
      tape.push("getPrePlanMode");
      return "build";
    },
    isPlanEnabled() {
      tape.push("isPlanEnabled");
      calls.push({ phase: "isPlanEnabled", receiver: this === port });
      return behavior.enabled;
    },
    async enterPlanMode(request: unknown) {
      tape.push("enter");
      calls.push({ phase: "enter", receiver: this === port, request: json(request) });
      if (c.transitionFailure) throw writeError(c.transitionFailure);
      const previous = behavior.enabled;
      behavior.enabled = true;
      return Object.hasOwn(c, "transition")
        ? c.transition
        : {
            mode: "build",
            previousMode: "build",
            planEnabled: true,
            previousPlanEnabled: previous,
          };
    },
    async exitPlanMode(request: unknown) {
      tape.push("exit");
      calls.push({ phase: "exit", receiver: this === port, request: json(request) });
      if (c.transitionFailure) throw writeError(c.transitionFailure);
      const previous = behavior.enabled;
      behavior.enabled = false;
      return Object.hasOwn(c, "transition")
        ? c.transition
        : {
            mode: "build",
            previousMode: "build",
            planEnabled: false,
            previousPlanEnabled: previous,
          };
    },
  };
  if (c.omitEnabled) delete (port as any).isPlanEnabled;
  if (c.portKind === "empty") for (const key of Object.keys(port)) delete (port as any)[key];
  if (c.portKind === "nonfunction-enabled") (port as any).isPlanEnabled = 0;
  if (c.portKind === "nonfunction-transition") {
    (port as any).enterPlanMode = 0;
    (port as any).exitPlanMode = 0;
  }
  if (c.portKind === "nonfunction-mode") {
    delete (port as any).isPlanEnabled;
    (port as any).getMode = 0;
  }
  const fs = {
    async writeTextFile(request: any, options: any) {
      tape.push("write");
      writes.push({
        receiver: this === fs,
        request: json({ ...request, path: request.path.split(sep).join("/") }),
        keys: Object.keys(request),
        signalIdentity: options.signal === signalExpectation.signal,
        signalAborted: options.signal?.aborted,
      });
      if (c.writeFailure) throw writeError(c.writeFailure);
      return { path: request.path, bytesWritten: Buffer.byteLength(request.content) };
    },
  } as unknown as FileSystemPort;
  const context = {
    sessionModePort: c.missingPort ? undefined : (port as unknown as SessionModePort),
    fileSystemPort: c.noFileSystem ? undefined : fs,
    abortSignal: controller.signal,
    toolCallId: "synthetic-plan-call",
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    sessionId: Object.hasOwn(c, "sessionId") ? c.sessionId : "synthetic-session",
    turnId: "synthetic-turn",
    workspaceRoot: "fixture-workspace",
  } as ToolExecutionContext;
  return { context, port, fs, behavior, tape, calls, writes, controller, signalExpectation };
}
export function inputFor(c: Scenario) {
  return Object.hasOwn(c, "input") ? c.input : c.operation === "enter" ? {} : { plan: validPlan };
}
export async function observe(c: Scenario, candidate = module) {
  const f = fixture(c),
    entry = entryFor(c.operation, candidate);
  let outcome;
  try {
    const output = await entry.handler(inputFor(c), f.context);
    outcome = { output, keys: Object.keys(output), modelContent: entry.formatModelContent(output) };
  } catch (error) {
    outcome = { error: errorShape(error), thrown: error instanceof Error ? undefined : error };
  }
  return json({ ...outcome, tape: f.tape, calls: f.calls, writes: f.writes });
}
export function declaration(entry: any) {
  return json({
    ...entry,
    handler: undefined,
    formatModelContent: undefined,
    runtimeInputSchema: undefined,
    runtimeOutputSchema: undefined,
  });
}
export function executorFixture(c: Scenario, decision: "allow" | "deny" = "allow") {
  const direct = fixture(c),
    entry = entryFor(c.operation),
    { handler, ...rest } = entry;
  const f = invocation(rest);
  f.call.input = inputFor(c);
  f.behavior.handler = (input, context) => {
    direct.signalExpectation.signal = context.abortSignal;
    return handler(input, context);
  };
  f.deps.sessionModePort = direct.context.sessionModePort;
  f.deps.fileSystemPort = direct.context.fileSystemPort;
  f.deps.getMode = () => (c.mode ?? "build") as any;
  const service = new PermissionService({
    allowedTools: new Set(),
    disallowedTools: new Set(),
    autoApproveHighRisk: false,
    allowMediumRiskInAutoMode: false,
  });
  f.deps.permissionService = service;
  const checked = service.checkPermission;
  service.checkPermission = function (...args: any[]) {
    f.timeline.push("permission");
    return Reflect.apply(checked, this, args);
  };
  const approvals: any[] = [];
  f.deps.permissionBroker = fixturePermissionBroker(async (request, options) => {
    f.timeline.push("broker");
    approvals.push(
      json({
        ...request,
        requestId: "synthetic-generated-request",
        generatedIdPresent: typeof request.requestId === "string" && request.requestId.length > 0,
        signalPresent: options?.signal !== undefined,
      }),
    );
    return { decision };
  });
  return {
    ...f,
    direct,
    approvals,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
export async function observeExecutor(c: Scenario, decision: "allow" | "deny" = "allow") {
  const f = executorFixture(c, decision);
  const result = await f.execute({ traceContext: { traceId: "synthetic-executor-trace" } });
  const span = f.observed.contexts[0]?.spanId;
  const traces = [
    ...f.direct.calls.map((c) => c.request?.traceContext),
    ...f.direct.writes.map((w) => w.request?.trace),
  ].filter(Boolean);
  const identity = traces.every((t) => t.spanId === span);
  for (const trace of traces) trace.spanId = "synthetic-generated-span";
  return json({
    success: result.success,
    output: result.output,
    modelContent: result.modelContent,
    error: result.error ? errorShape(result.error) : undefined,
    turnControl: result.turnControl,
    followUpUserInput: result.followUpUserInput,
    timeline: f.timeline,
    eventTypes: f.events.map((e) => e.type),
    tape: f.direct.tape,
    calls: f.direct.calls,
    writes: f.direct.writes,
    approvals: f.approvals,
    span:
      span === undefined
        ? undefined
        : { present: typeof span === "string" && span.length > 0, identity },
  });
}
export async function observeReads(
  operation: "enter" | "exit",
  fault?: { field: string; at: number },
) {
  const f = fixture({ label: "reads", operation }),
    reads: string[] = [];
  for (const field of Object.keys(f.context)) {
    const value = (f.context as any)[field];
    let count = 0;
    Object.defineProperty(f.context, field, {
      get() {
        reads.push(field);
        if (fault?.field === field && ++count === fault.at)
          throw new Error(`Synthetic getter ${field}/${fault.at}`);
        return value;
      },
    });
  }
  const entry = entryFor(operation);
  let outcome;
  try {
    const output = await entry.handler(inputFor({ label: "reads", operation }), f.context);
    outcome = { output, modelContent: entry.formatModelContent(output) };
  } catch (error) {
    outcome = { error: errorShape(error) };
  }
  return json({ ...outcome, reads, tape: f.tape, calls: f.calls, writes: f.writes });
}
