// Source-exposed contracts. Communication, routing, approval and workflow effects are synthetic.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";
import {
  contextFields,
  names,
  outputs,
  resultSchema,
  validInputs,
  type Operation,
  type Scenario,
} from "./collaboration-tool-cases.js";
export const emitted = process.env.KNORVIA_COLLABORATION_TOOL_TEST_EMITTED === "1";
const load = async (path: string) => {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url);
  return import(url.href);
};
export const modules = {
  send: await load("tool/handlers/send-message"),
  respond: await load("tool/handlers/respond-to-coordinator"),
  submit: await load("tool/handlers/submit-result"),
};
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const batch = await load("tool/executor/batch-runner");
export const scheduler = await load("tool/scheduler");
export const { createToolResultDisplay } = await load("tool/executor/result-display");
export const { withTerminalToolTurnStop } = await load("tool/executor/turn-control");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const publicDeclarations = Object.fromEntries(
  await Promise.all(
    ["send-message", "respond-to-coordinator", "submit-result"].map(async (name) => [
      name,
      await readFile(new URL(`../dist/tool/handlers/${name}.d.ts`, import.meta.url), "utf8"),
    ]),
  ),
);
export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (key, item) => (key === "stack" ? undefined : item)));
export const errorShape = (error: any): any =>
  json({
    name: error?.name,
    type: error?.type,
    code: error?.code,
    message: error?.message,
    detail: error?.detail,
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
      super(value === undefined ? Date.UTC(2026, 0, 15, 12) : value);
    }
    static override now() {
      return Date.UTC(2026, 0, 15, 12);
    }
  }
  globalThis.Date = SyntheticDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = Original;
  }
}
export function entryFor(operation: Operation, typed = false) {
  if (operation === "send") return modules.send.sendMessageToolEntry;
  if (operation === "respond") return modules.respond.respondToCoordinatorToolEntry;
  return typed
    ? modules.submit.createSubmitResultToolEntry(resultSchema)
    : modules.submit.submitResultToolEntry;
}
export function inputFor(c: Scenario) {
  return Object.hasOwn(c, "input") ? c.input : validInputs[c.operation];
}
export function fixture(c: Scenario) {
  const tape: string[] = [],
    calls: any[] = [],
    rawCalls: any[] = [];
  const controller = new AbortController();
  if (c.aborted) controller.abort("Synthetic abort");
  const reply =
    c.operation === "submit"
      ? Object.hasOwn(c, "verdict")
        ? c.verdict
        : { accept: true }
      : Object.hasOwn(c, "output")
        ? c.output
        : outputs[c.operation];
  const expected: any = {
    signal: controller.signal,
    trace: Object.hasOwn(c, "trace") ? c.trace : undefined,
    result: (inputFor(c) as any)?.result,
  };
  const methodName = c.operation === "send" ? "sendMessage" : "respond";
  const method = function (this: unknown, ...args: any[]) {
    tape.push(methodName);
    rawCalls.push(args);
    const [request, options] = args;
    calls.push({
      receiver: this === port,
      argc: args.length,
      request: json(request),
      requestKeys: Object.keys(request),
      traceKeys:
        request.trace !== null && typeof request.trace === "object"
          ? Object.keys(request.trace)
          : undefined,
      traceIdentity: expected.trace == null ? undefined : request.trace === expected.trace,
      resultIdentity: c.operation === "submit" ? request.result === expected.result : undefined,
      optionKeys: options === undefined ? undefined : Object.keys(options),
      signalIdentity: c.operation === "send" ? options?.signal === expected.signal : undefined,
      aborted: options?.signal?.aborted,
    });
    if (c.port === "throw") throw new Error("Synthetic port throw");
    if (c.port === "value-throw") throw "Synthetic port thrown value";
    if (c.port === "reject") return Promise.reject(new Error("Synthetic port rejection"));
    return c.operation === "respond" ? reply : Promise.resolve(reply);
  };
  const port: any = { [methodName]: method };
  const selected =
    c.port === "missing"
      ? undefined
      : c.port === "empty"
        ? {}
        : c.port === "nonfunction"
          ? { [methodName]: 7 }
          : c.port === "false-method"
            ? { [methodName]: false }
            : port;
  const context = {
    toolCallId: "synthetic-call",
    sessionId: "synthetic-session",
    turnId: "synthetic-turn",
    workingDirectory: "synthetic-working-directory",
    workspaceRoot: "synthetic-workspace",
    traceContext: expected.trace,
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    runtimeScope: Object.hasOwn(c, "scope")
      ? c.scope
      : c.operation === "respond"
        ? "subagent"
        : "main",
    offPeakTurn: c.offPeak,
    automationTurn: c.automation,
    abortSignal: controller.signal,
    model: { syntheticNeverCalledModel: true },
    subagentModelOverride: { syntheticNeverUsedOverride: true },
    subagentPort: c.operation === "send" ? selected : undefined,
    coordinatorResponsePort: c.operation === "respond" ? selected : undefined,
    workflowSubmitPort: c.operation === "submit" ? selected : undefined,
  } as unknown as ToolExecutionContext;
  return { context, port, methodName, expected, controller, tape, calls, rawCalls, reply };
}
export function formatObservation(operation: Operation, output: unknown) {
  try {
    return { text: entryFor(operation).formatModelContent(output) };
  } catch (error) {
    return { error: errorShape(error) };
  }
}
export async function observe(c: Scenario, fault?: { field: string; at: number }) {
  const f = fixture(c),
    reads: string[] = [];
  if (fault || c.label === "getters") {
    for (const field of contextFields) {
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
    const method = f.port[f.methodName];
    let count = 0;
    Object.defineProperty(f.port, f.methodName, {
      get() {
        reads.push("method");
        if (fault?.field === "method" && ++count === fault.at)
          throw new Error(`Synthetic getter method/${fault.at}`);
        return method;
      },
    });
  }
  let outcome;
  try {
    const output = await entryFor(c.operation).handler(inputFor(c), f.context);
    outcome = {
      output,
      outputKeys: output === null || typeof output !== "object" ? undefined : Object.keys(output),
      outputIdentity: c.operation === "submit" ? undefined : output === f.reply,
      format: formatObservation(c.operation, output),
    };
  } catch (error) {
    outcome = { error: errorShape(error), thrown: error instanceof Error ? undefined : error };
  }
  return json({ ...outcome, tape: f.tape, calls: f.calls, reads });
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
export function factoryObservations() {
  return [
    undefined,
    resultSchema,
    {},
    null,
    7,
    { type: "string", description: "Synthetic override" },
  ].map((schema) => {
    const entry = modules.submit.createSubmitResultToolEntry(schema);
    return {
      declaration: declaration(entry),
      keys: Object.keys(entry),
      schemaKeys: Object.keys(entry.inputSchema),
    };
  });
}
export const registryVariants = [
  {},
  { includeSendMessage: false },
  { includeRespondToCoordinator: false },
  { includeSubmitResult: false },
  { submitResultSchema: resultSchema },
  { disallowedTools: ["RespondToCoordinator"] },
];
export function registryObservation(options: any) {
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, {
    allowedTools: Object.values(names),
    includeSendMessage: true,
    includeRespondToCoordinator: true,
    includeSubmitResult: true,
    ...options,
  });
  const contracts = registry.toContracts();
  return json({
    names: registry.list(),
    contracts,
    contractKeys: contracts.map((c: object) => Object.keys(c)),
  });
}
export function executorFixture(
  c: Scenario,
  decision: "allow" | "deny" | "ask" = "allow",
  typed = false,
) {
  const direct = fixture(c),
    entry = entryFor(c.operation, typed),
    { handler, ...rest } = entry;
  const f = invocation(rest);
  f.call.input = inputFor(c);
  f.behavior.decision = decision;
  f.deps.subagentPort = direct.context.subagentPort;
  f.deps.coordinatorResponsePort = direct.context.coordinatorResponsePort;
  f.deps.workflowSubmitPort = direct.context.workflowSubmitPort;
  f.deps.runtimeScope = direct.context.runtimeScope;
  f.deps.getWorkingDirectory = () => "synthetic-working-directory";
  f.deps.getWorkspaceRoot = () => "synthetic-workspace";
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.behavior.handler = (input, context) => {
    direct.expected.signal = context.abortSignal;
    direct.expected.trace = context.traceContext;
    return handler(input, context);
  };
  return {
    ...f,
    direct,
    execute: (options?: Parameters<typeof f.run>[0]) =>
      f.run(
        { automationTurn: c.automation, offPeakTurn: c.offPeak as any, ...options },
        executeToolCall,
      ),
  };
}
export async function observeExecutor(
  c: Scenario,
  decision: "allow" | "deny" | "ask" = "allow",
  typed = false,
) {
  const f = executorFixture(c, decision, typed);
  const result = await f.execute({
    traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-caller-span" },
  });
  const span = f.observed.contexts[0]?.spanId;
  const traceIdentity = f.direct.calls.every((call) => call.request.trace.spanId === span);
  for (const call of f.direct.calls) call.request.trace.spanId = "synthetic-generated-span";
  return json({
    success: result.success,
    output: result.output,
    outputKeys:
      result.output && typeof result.output === "object" ? Object.keys(result.output) : undefined,
    modelContent: result.modelContent,
    display: result.display,
    error: result.error ? errorShape(result.error) : undefined,
    turnControl: result.turnControl,
    timeline: f.timeline,
    calls: f.direct.calls,
    eventTypes: f.events.map((e) => e.type),
    terminal: f.terminal().map((t) => t.name),
    span:
      span === undefined
        ? undefined
        : { present: typeof span === "string" && span.length > 0, traceIdentity },
  });
}
export function permissionObservations() {
  const facts = [];
  for (const operation of ["send", "respond", "submit"] as const)
    for (const mode of ["build", "edit", "plan", "yolo", "auto"])
      for (const deny of [false, true])
        for (const runtimeScope of ["main", "subagent"]) {
          const entry = entryFor(operation),
            input = validInputs[operation];
          const service = new PermissionService({
            allowedTools: new Set(),
            disallowedTools: new Set(deny ? [names[operation]] : []),
            autoApproveHighRisk: false,
            allowMediumRiskInAutoMode: false,
          });
          facts.push({
            operation,
            mode,
            deny,
            runtimeScope,
            decision: service.checkPermission(
              { toolName: names[operation], input, mode },
              resolveRuntimePermissionCapability(entry, input, {
                workingDirectory: ".",
                workspaceRoot: ".",
                runtimeScope,
              }),
            ),
          });
        }
  return json(facts);
}
export function projectionMatrix() {
  const digest = createHash("sha256");
  let comparisons = 0;
  for (const status of ["success", "failed"])
    for (const delivery of [undefined, "queued", "steered", "resumed_background"])
      for (const message of [undefined, "", "Synthetic explicit message"])
        for (const agentId of [undefined, "", "synthetic-agent"])
          for (const taskId of [undefined, "synthetic-task"]) {
            digest.update(
              JSON.stringify(
                formatObservation("send", {
                  status,
                  messageId: "synthetic-message",
                  delivery,
                  message,
                  agentId,
                  taskId,
                }),
              ) + "\n",
            );
            comparisons++;
          }
  return { comparisons, sha256: digest.digest("hex") };
}
