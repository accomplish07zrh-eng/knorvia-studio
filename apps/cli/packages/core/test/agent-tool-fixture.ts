// Source-exposed contracts; all child, approval, model and file effects are synthetic.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AgentInputSchema, AgentOutputSchema } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";
import { validInput, completed, contextFields, type AgentCase } from "./agent-tool-cases.js";
export const emitted = process.env.KNORVIA_AGENT_TOOL_TEST_EMITTED === "1";
const load = async (path: string) => {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url);
  return import(url.href);
};
export const module = await load("tool/handlers/agent");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { PermissionService } = await load("permission/service");
export const { resolveRuntimePermissionCapability } = await load(
  "tool/executor/permission-capability",
);
export const compat = await load("tool/compat");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/agent.d.ts", import.meta.url),
  "utf8",
);
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
export function inputFor(c: AgentCase) {
  return Object.hasOwn(c, "input") ? c.input : validInput;
}
export function entryFor(c: AgentCase) {
  return c.alias ? module.taskToolEntry : module.agentToolEntry;
}
export function fixture(c: AgentCase = { label: "fixture" }) {
  const tape: string[] = [],
    calls: any[] = [];
  const controller = new AbortController();
  if (c.abort) controller.abort("Synthetic abort");
  const expected = { signal: controller.signal, model: c.model, override: c.override };
  const result = Object.hasOwn(c, "output") ? c.output : completed;
  const port = {
    launch(this: unknown, request: any, options: any) {
      tape.push("launch");
      calls.push({
        request: json(request),
        requestKeys: Object.keys(request),
        traceKeys: Object.keys(request.trace),
        optionKeys: Object.keys(options),
        receiver: this === port,
        signalIdentity: options.signal === expected.signal,
        aborted: options.signal?.aborted,
        modelIdentity: options.model === expected.model,
        overrideIdentity: options.modelOverride === expected.override,
      });
      if (c.port === "throw") throw new Error("Synthetic launch throw");
      if (c.port === "value-throw") throw "Synthetic launch value";
      return c.port === "reject"
        ? Promise.reject(new Error("Synthetic launch rejection"))
        : Promise.resolve(result);
    },
  };
  const context = {
    toolCallId: "synthetic-call",
    sessionId: "synthetic-session",
    turnId: "synthetic-turn",
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    workingDirectory: "synthetic-working-directory",
    workspaceRoot: "synthetic-workspace",
    providerVisibleToolNames: Object.hasOwn(c, "visible") ? c.visible : ["Agent"],
    abortSignal: controller.signal,
    model: c.model,
    subagentModelOverride: c.override,
    subagentPort:
      c.port === "missing"
        ? undefined
        : c.port === "empty"
          ? {}
          : c.port === "nonfunction"
            ? { launch: 7 }
            : port,
  } as unknown as ToolExecutionContext;
  return { context, port, tape, calls, expected, controller, result };
}
export function formatObservation(value: unknown) {
  try {
    return { text: module.agentToolEntry.formatModelContent(value) };
  } catch (error) {
    return { error: errorShape(error) };
  }
}
export async function observe(c: AgentCase, fault?: { field: string; at: number }) {
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
    const launch = f.port.launch;
    Object.defineProperty(f.port, "launch", {
      get() {
        reads.push("launch");
        if (fault?.field === "launch") throw new Error("Synthetic getter launch/1");
        return launch;
      },
    });
  }
  let outcome;
  try {
    const output = await entryFor(c).handler(inputFor(c), f.context);
    outcome = { output, outputIdentity: output === f.result, format: formatObservation(output) };
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
export function describe(options: any) {
  try {
    return {
      agent: module.createAgentToolEntry(options).metadata.description,
      task: module.createTaskToolEntry(options).metadata.description,
    };
  } catch (error) {
    return { error: errorShape(error) };
  }
}
export function registryObservation(options: any) {
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, {
    allowedTools: ["Agent", "Task"],
    includeAgent: true,
    ...options,
  });
  const contracts = registry.toContracts();
  return json({
    names: registry.list(),
    descriptions: registry.list().map((name: string) => registry.get(name).metadata.description),
    contractKeys: contracts.map((c: object) => Object.keys(c)),
    contracts,
  });
}
export function executorFixture(c: AgentCase, decision: "allow" | "deny" | "ask" = "allow") {
  const direct = fixture(c),
    entry = entryFor(c),
    { handler, ...rest } = entry;
  const f = invocation(rest);
  f.behavior.decision = decision;
  f.call.input = inputFor(c);
  f.deps.subagentPort = direct.context.subagentPort;
  f.deps.getWorkingDirectory = () => "synthetic-working-directory";
  f.deps.getWorkspaceRoot = () => "synthetic-workspace";
  const registry = createToolRegistry();
  registry.register(f.entry);
  for (const name of Array.isArray(c.visible) ? c.visible : []) {
    if (!registry.has(name))
      registry.register({ ...f.entry, metadata: { ...f.entry.metadata, name } });
  }
  f.deps.registry = registry;
  f.behavior.handler = (input, context) => {
    direct.expected.signal = context.abortSignal;
    return handler(input, context);
  };
  return {
    ...f,
    direct,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
export async function observeExecutor(c: AgentCase, decision: "allow" | "deny" | "ask") {
  const f = executorFixture(c, decision);
  const result = await f.execute({
    traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-caller-span" },
  });
  const span = f.observed.contexts[0]?.spanId;
  const traceIdentity = f.direct.calls.every((call) => call.request.trace.spanId === span);
  for (const call of f.direct.calls) call.request.trace.spanId = "synthetic-generated-span";
  return json({
    success: result.success,
    output: result.output,
    modelContent: result.modelContent,
    error: result.error ? errorShape(result.error) : undefined,
    turnControl: result.turnControl,
    timeline: f.timeline,
    calls: f.direct.calls,
    eventTypes: f.events.map((e) => e.type),
    contexts: f.observed.contexts.map((ctx) => ({
      traceId: ctx.traceId,
      parentSpanId: ctx.parentSpanId,
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      visible: ctx.providerVisibleToolNames,
    })),
    span:
      span === undefined
        ? undefined
        : { present: typeof span === "string" && span.length > 0, traceIdentity },
  });
}
export const schemaIdentities = (entry: any) =>
  entry.runtimeInputSchema === AgentInputSchema && entry.runtimeOutputSchema === AgentOutputSchema;
export function permissionObservation() {
  const observations = [];
  for (const mode of ["build", "edit", "plan", "yolo", "auto"])
    for (const hardDeny of [false, true])
      for (const runtimeScope of ["main", "subagent"])
        for (const entry of [module.agentToolEntry, module.taskToolEntry]) {
          const service = new PermissionService({
            allowedTools: new Set(),
            disallowedTools: new Set(hardDeny ? ["Agent", "Task"] : []),
            autoApproveHighRisk: false,
            allowMediumRiskInAutoMode: false,
          });
          observations.push({
            mode,
            hardDeny,
            runtimeScope,
            name: entry.metadata.name,
            decision: service.checkPermission(
              { toolName: entry.metadata.name, input: validInput, mode },
              resolveRuntimePermissionCapability(entry, validInput, {
                workingDirectory: ".",
                workspaceRoot: ".",
                runtimeScope,
              }),
            ),
          });
        }
  return json(observations);
}
export function projectionMatrix() {
  const digest = createHash("sha256");
  let comparisons = 0;
  for (const texts of [
    [],
    [""],
    [" "],
    ["界"],
    ["a", "b"],
    ["\r\n", "x"],
    ["😀", "  "],
    ["<usage>literal</usage>"],
  ])
    for (const tokens of [undefined, 0, 19, -1])
      for (const tools of [0, 2, 1.5, "2"])
        for (const usage of [undefined, {}, { synthetic: 1 }, null]) {
          const output = {
            ...completed,
            content: texts.map((text) => ({ type: "text", text })),
            totalTokens: tokens,
            totalToolUseCount: tools,
            usage,
          };
          digest.update(JSON.stringify(formatObservation(output)) + "\n");
          comparisons++;
        }
  return { comparisons, sha256: digest.digest("hex") };
}
