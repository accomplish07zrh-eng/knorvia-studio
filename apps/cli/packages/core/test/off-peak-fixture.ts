// Exposed-source compatibility fixture; every task/transport/response is synthetic.
import type { OffPeakPort, OffPeakCreateOutcome, OffPeakTaskSummary } from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext } from "../src/tool/types.js";
import { invocation } from "./tool-invocation-fixture.js";

const emitted = process.env.KNORVIA_OFF_PEAK_TEST_EMITTED === "1";
const ext = emitted ? "js" : "ts";
const core = emitted ? "../dist/" : "../src/";
const bootstrap = emitted ? "../../bootstrap/dist/" : "../../bootstrap/src/";
const at = (root: string, path: string) =>
  import(new URL(`${root}${path}.${ext}`, import.meta.url).href);
export const offPeak = (await at(core, "tool/handlers/off-peak")) as {
  offPeakCreateToolEntry: ToolEntry;
  offPeakListToolEntry: ToolEntry;
  assertNotOffPeakTurn: (
    context: ToolExecutionContext,
    toolName: string,
    options?: { hint?: string; recoverable?: boolean },
  ) => void;
};
export const entries = {
  create: offPeak.offPeakCreateToolEntry,
  list: offPeak.offPeakListToolEntry,
};
export const handlers = await at(core, "tool/handlers/index");
export const registryModule = await at(core, "tool/registry");
export const { executeToolCall } = await at(core, "tool/executor/call-runner");
export const { PermissionService } = await at(core, "permission/service");
export const { resolveRuntimePermissionCapability } = await at(
  core,
  "tool/executor/permission-capability",
);
export const loopPolicy = await at(core, "runtime/methods/turn-loop-state");
export const { sendMessageToolEntry } = await at(core, "tool/handlers/send-message");
export const { createProtocolOffPeakPort } = await at(bootstrap, "protocol/offpeak-port");
export const { updateOffPeakToolPolicy } = await at(bootstrap, "protocol/off-peak-tool-policy");
export const servicePolicy =
  await import("../../../../../packages/services/src/agent/automationToolPolicy.js");

export const valid = { title: " Deferred example ", prompt: " Produce the example deliverable. " };
export const task: OffPeakTaskSummary = {
  offPeakTaskId: "example-idle",
  title: "Example deferred work",
  status: "queued",
  queuePosition: 3,
  sessionId: "example-session",
  createdAt: 123,
};
export type Operation = keyof typeof entries;
export interface AdmissionCase {
  label: string;
  operation: Operation;
  input?: unknown;
  noPort?: boolean;
  offPeakTurn?: boolean;
  automationTurn?: boolean;
}
export const admissionCases: AdmissionCase[] = [
  { label: "create trimmed defaults", operation: "create", input: valid },
  ...["build", "edit", "plan", "yolo"].map((permissionMode) => ({
    label: `create ${permissionMode}`,
    operation: "create" as const,
    input: { ...valid, permissionMode, model: " example-model ", thoughtLevel: " high " },
  })),
  { label: "ordinary automation create", operation: "create", input: valid, automationTurn: true },
  {
    label: "idle create before missing input/port",
    operation: "create",
    offPeakTurn: true,
    noPort: true,
  },
  { label: "idle create before input schema", operation: "create", input: {}, offPeakTurn: true },
  {
    label: "both turn flags deny create",
    operation: "create",
    input: valid,
    offPeakTurn: true,
    automationTurn: true,
  },
  { label: "create missing port", operation: "create", input: valid, noPort: true },
  ...[
    undefined,
    null,
    [],
    "value",
    {},
    { title: " ", prompt: " " },
    { ...valid, permissionMode: "auto" },
    { ...valid, model: " " },
    { ...valid, thoughtLevel: 2 },
    { ...valid, sessionId: "injected" },
    { ...valid, workspace: "injected" },
    { ...valid, extra: true },
  ].map((input, i) => ({
    label: `malformed create ${i}`,
    operation: "create" as const,
    input,
    noPort: i % 2 === 0,
  })),
  { label: "list", operation: "list", input: {} },
  { label: "idle list", operation: "list", input: {}, offPeakTurn: true },
  {
    label: "both flags list",
    operation: "list",
    input: {},
    offPeakTurn: true,
    automationTurn: true,
  },
  { label: "list missing port", operation: "list", input: {}, noPort: true },
  ...[undefined, null, [], 7, { extra: true }].map((input, i) => ({
    label: `malformed list ${i}`,
    operation: "list" as const,
    input,
    noPort: true,
    offPeakTurn: true,
  })),
];
export const failureCases = [
  "quota_3103",
  "eligibility_3101",
  "client_validation",
  "network",
  "invalid_response",
  "local_persist",
  "unknown",
].flatMap((errorCategory) =>
  ["model_not_allowed", "session_bound", "offpeak_disabled", "3103", "3101", "unknown"].map(
    (errorCode, i) => ({
      ok: false as const,
      failureStage: ["client_validation", "ticket_request", "local_persist"][i % 3],
      errorCategory,
      errorCode,
    }),
  ),
);
export const rawOutcomes: unknown[] = [
  undefined,
  null,
  {},
  { ok: false },
  { ok: 0, errorCategory: "quota_3103", errorCode: "different", failureStage: "example" },
  { ok: true },
  ...[undefined, 0, -1, 2, "2", null, Number.NaN].map((queuePosition) => ({
    ok: true,
    task: { ...task, queuePosition },
  })),
];

export function errorShape(error: unknown) {
  const e = error as Error & {
    type?: string;
    code?: string;
    context?: unknown;
    recoverable?: boolean;
    retryable?: boolean;
    issues?: unknown;
  };
  return JSON.parse(
    JSON.stringify({
      name: e.name,
      type: e.type,
      code: e.code,
      message: e.message,
      context: e.context,
      recoverable: e.recoverable,
      retryable: e.retryable,
      issues: e.issues,
    }),
  );
}
export function direct() {
  const calls: { method: string; receiver: boolean; args: unknown[] }[] = [];
  const behavior = {
    outcome: { ok: true, task: { ...task } } as unknown,
    tasks: [{ ...task }] as unknown,
    throwCreate: undefined as unknown,
    throwList: undefined as unknown,
  };
  const port: OffPeakPort = {
    async create(...args) {
      calls.push({ method: "create", receiver: this === port, args });
      if (behavior.throwCreate !== undefined) throw behavior.throwCreate;
      return behavior.outcome as OffPeakCreateOutcome;
    },
    async list(...args) {
      calls.push({ method: "list", receiver: this === port, args });
      if (behavior.throwList !== undefined) throw behavior.throwList;
      return behavior.tasks as OffPeakTaskSummary[];
    },
  };
  const context = {
    toolCallId: "example-offpeak-call",
    sessionId: "example-session",
    offPeakPort: port,
  } as ToolExecutionContext;
  return { port, context, calls, behavior };
}
export async function observe(c: AdmissionCase, outcome?: { value: unknown }) {
  const f = direct();
  if (c.noPort) delete f.context.offPeakPort;
  f.context.offPeakTurn = c.offPeakTurn;
  f.context.automationTurn = c.automationTurn;
  if (outcome) f.behavior.outcome = outcome.value;
  let result;
  try {
    result = { output: await entries[c.operation].handler(structuredClone(c.input), f.context) };
  } catch (error) {
    result = { error: errorShape(error) };
  }
  return JSON.parse(JSON.stringify({ ...result, calls: f.calls }));
}
export function executorFixture(operation: Operation = "create") {
  const directPort = direct();
  const { handler, ...declaration } = entries[operation];
  const f = invocation(declaration);
  f.behavior.handler = handler;
  f.deps.offPeakPort = directPort.port;
  f.call.input = operation === "create" ? structuredClone(valid) : {};
  return {
    ...f,
    direct: directPort,
    execute: (options?: Parameters<typeof f.run>[0]) => f.run(options, executeToolCall),
  };
}
export function protocolFixture() {
  const calls: { method: string; params: unknown; schema: unknown }[] = [];
  const records = new Map<string, unknown>();
  const state = {
    tasks: [] as OffPeakTaskSummary[],
    result: { ok: true, task } as unknown,
    own: undefined as unknown,
    failList: undefined as unknown,
    failCreate: undefined as unknown,
  };
  const warnings: unknown[] = [];
  const context = {
    sessions: records,
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
    async requestClient(
      method: string,
      params: unknown,
      schema: { parse: (v: unknown) => unknown },
    ) {
      calls.push({ method, params, schema });
      if (method === "offPeak/list") {
        if (state.failList) throw state.failList;
        return schema.parse({ tasks: state.tasks });
      }
      if (state.failCreate) throw state.failCreate;
      return schema.parse(state.result);
    },
  };
  return {
    calls,
    records,
    state,
    context,
    warnings,
    port: createProtocolOffPeakPort(context, () => state.own) as OffPeakPort,
  };
}
