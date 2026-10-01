// Exposed-source compatibility fixtures. All records and effects are synthetic.
import type { AutomationPort, CronAutomation } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

const emitted = process.env.KNORVIA_CRON_TEST_EMITTED === "1";
const ext = emitted ? "js" : "ts";
const core = emitted ? "../dist/" : "../src/";
const bootstrap = emitted ? "../../bootstrap/dist/" : "../../bootstrap/src/";
const at = (root: string, path: string) =>
  import(new URL(`${root}${path}.${ext}`, import.meta.url).href);
export const cron = await at(core, "tool/handlers/cron");
export const entries: Record<Operation, ToolEntry> = {
  create: cron.cronCreateToolEntry,
  list: cron.cronListToolEntry,
  update: cron.cronUpdateToolEntry,
  delete: cron.cronDeleteToolEntry,
};
export type Operation = "create" | "list" | "update" | "delete";
export const handlers = await at(core, "tool/handlers/index");
export const registryModule = await at(core, "tool/registry");
export const { executeToolCall } = await at(core, "tool/executor/call-runner");
export const { PermissionService } = await at(core, "permission/service");
export const { resolveRuntimePermissionCapability } = await at(
  core,
  "tool/executor/permission-capability",
);
export const timeout = await at(core, "tool/executor/timeout");
export const loopPolicy = await at(core, "runtime/methods/turn-loop-state");
export const { createProtocolAutomationPort } = await at(bootstrap, "protocol/automation-port");
export const { ProtocolRequestError } = await at(bootstrap, "protocol/server-types");
export const servicePolicy =
  await import("../../../../../packages/services/src/agent/automationToolPolicy.js");
export const valid: Record<Operation, unknown> = {
  create: {
    title: " Every day example ",
    prompt: " Produce the example result. ",
    cron: " 0 9 * * * ",
  },
  list: {},
  update: { id: " example-id ", title: " Every week example " },
  delete: { id: " example-id " },
};
export const automation: CronAutomation = {
  automationId: "example-id",
  title: "Every day example",
  cronExpr: "0 9 * * *",
  prompt: "Produce the example result.",
  enabled: true,
  lifecycleStatus: "active",
  nextRunAt: 123000,
  lastRunAt: 120000,
  runCount: 2,
  recurring: true,
  maxRuns: 8,
  modelSelection: {
    providerId: "example-provider",
    modelId: "example-model",
    options: { reasoningLevel: "high" },
  },
  mode: "plan",
  scheduleRule: { unit: "daily", interval: 40, hour: 9, minute: 0, anchorAt: 100000 },
};
const baseCreate = { title: "Example", prompt: "Example result" };
export const schedules = [
  valid.create,
  { ...baseCreate, cron: "0 9 * * 1-5", delayMinutes: null },
  { ...baseCreate, delayMinutes: 120, recurring: false },
  { ...baseCreate, cron: "0 * * * *", recurring: false, maxRuns: 3 },
  ...["minute", "hourly", "daily", "weekly", "monthly", "yearly"].map((intervalUnit) => ({
    ...baseCreate,
    cron: "0 9 * * *",
    intervalUnit,
    interval: 40,
  })),
];
export const updates = [
  valid.update,
  {
    id: "example-id",
    title: "Example",
    cron: "0 10 * * *",
    prompt: "New example",
    recurring: false,
    maxRuns: 3,
  },
  { id: "example-id", title: "Example", recurring: true, maxRuns: null },
  { id: "example-id", title: "Example", intervalUnit: "hourly", interval: 50 },
];
export interface AdmissionCase {
  label: string;
  operation: Operation;
  input?: unknown;
  automationTurn?: boolean;
  offPeakTurn?: boolean;
  noPort?: boolean;
}
export const admissionCases: AdmissionCase[] = Object.keys(entries).flatMap((key) => {
  const operation = key as Operation;
  const inputs = [
    undefined,
    null,
    [],
    "example",
    {},
    { extra: true },
    valid[operation],
    ...(operation === "create" ? schedules : operation === "update" ? updates : []),
    ...(operation === "create"
      ? [
          { ...baseCreate, delayMinutes: 0 },
          { ...baseCreate, delayMinutes: 1.5 },
          { ...baseCreate, delayMinutes: 525601 },
          { ...baseCreate, delayMinutes: 2, cron: "* * * * *" },
          { ...baseCreate, delayMinutes: 2, recurring: true },
          { ...baseCreate, delayMinutes: 2, maxRuns: 1 },
          { ...baseCreate, cron: "* * * * *", intervalUnit: "daily" },
          { ...baseCreate, cron: "* * * * *", intervalUnit: "daily", interval: 201 },
          {
            ...baseCreate,
            cron: "* * * * *",
            intervalUnit: "daily",
            interval: 4,
            recurring: false,
          },
          { ...baseCreate, cron: "* * * * *", intervalUnit: "daily", interval: 4, maxRuns: 3 },
          { ...baseCreate, delayMinutes: 2, intervalUnit: "daily", interval: 4 },
          { ...baseCreate, cron: "* * * * *", timezone: "Example/Zone" },
        ]
      : operation === "update"
        ? [
            { id: "example-id" },
            { id: " ", title: " " },
            { id: "example-id", title: "Example", maxRuns: null },
            { id: "example-id", title: "Example", recurring: true, maxRuns: 3 },
            { id: "example-id", title: "Example", intervalUnit: "daily", interval: 3, maxRuns: 3 },
            { id: "example-id", title: "Example", interval: 3 },
            { id: "example-id", title: "Example", sessionId: "injected" },
          ]
        : [{ id: " " }, { id: 2 }]),
  ];
  return inputs.flatMap((input, index) =>
    [false, true].flatMap((automationTurn) =>
      [false, true].flatMap((offPeakTurn) =>
        [false, true].map((noPort) => ({
          label: `${operation}/${index}/${automationTurn}/${offPeakTurn}/${noPort}`,
          operation,
          input,
          automationTurn,
          offPeakTurn,
          noPort,
        })),
      ),
    ),
  );
});
export function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
export function errorShape(error: unknown) {
  const e = error as Error & {
    type?: string;
    code?: string;
    context?: unknown;
    recoverable?: boolean;
    retryable?: boolean;
    issues?: unknown;
  };
  return json({
    name: e?.name,
    type: e?.type,
    code: e?.code,
    message: e?.message,
    context: e?.context,
    recoverable: e?.recoverable,
    retryable: e?.retryable,
    issues: e?.issues,
  });
}
export function direct() {
  const calls: { method: string; receiver: boolean; args: unknown[] }[] = [];
  const behavior = {
    result: { ...automation } as unknown,
    list: [automation, automation] as unknown,
    deleted: true as unknown,
    failure: undefined as unknown,
  };
  const port: AutomationPort = {
    async create(...args) {
      calls.push({ method: "create", receiver: this === port, args });
      if (behavior.failure !== undefined) throw behavior.failure;
      return behavior.result as CronAutomation;
    },
    async update(...args) {
      calls.push({ method: "update", receiver: this === port, args });
      if (behavior.failure !== undefined) throw behavior.failure;
      return behavior.result as CronAutomation;
    },
    async list(...args) {
      calls.push({ method: "list", receiver: this === port, args });
      if (behavior.failure !== undefined) throw behavior.failure;
      return behavior.list as CronAutomation[];
    },
    async delete(...args) {
      calls.push({ method: "delete", receiver: this === port, args });
      if (behavior.failure !== undefined) throw behavior.failure;
      return behavior.deleted as boolean;
    },
  };
  const context = {
    toolCallId: "example-cron-call",
    sessionId: "example-session",
    automationPort: port,
  } as ToolExecutionContext;
  return { port, context, calls, behavior };
}
export async function observe(c: AdmissionCase) {
  const f = direct();
  if (c.noPort) delete f.context.automationPort;
  f.context.automationTurn = c.automationTurn;
  f.context.offPeakTurn = c.offPeakTurn;
  let result;
  try {
    result = { output: await entries[c.operation].handler(structuredClone(c.input), f.context) };
  } catch (error) {
    result = { error: errorShape(error) };
  }
  return json({ ...result, calls: f.calls });
}
export function executorFixture(operation: Operation) {
  const d = direct();
  const { handler, ...declaration } = entries[operation];
  const f = invocation(declaration);
  f.behavior.handler = handler;
  f.deps.automationPort = d.port;
  f.call.input = structuredClone(valid[operation]);
  return {
    ...f,
    direct: d,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
export const executions = Object.keys(entries).flatMap((key) =>
  [false, true].flatMap((automationTurn) =>
    [false, true].map((offPeakTurn) => ({
      operation: key as Operation,
      options: { automationTurn, offPeakTurn },
    })),
  ),
);
export async function observeExecution(c: (typeof executions)[number]) {
  const f = executorFixture(c.operation);
  const result = await f.execute({ ...c.options, traceContext: { traceId: "example-cron-trace" } });
  return json({
    success: result.success,
    output: result.output,
    modelContent: result.modelContent,
    error: result.error ? errorShape(result.error) : undefined,
    timeline: f.timeline,
    eventTypes: f.events.map((e) => e.type),
    calls: f.direct.calls,
  });
}
