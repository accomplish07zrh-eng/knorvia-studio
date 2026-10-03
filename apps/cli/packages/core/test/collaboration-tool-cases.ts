export type Operation = "send" | "respond" | "submit";
export interface Scenario {
  label: string;
  operation: Operation;
  input?: unknown;
  port?: "missing" | "empty" | "nonfunction" | "false-method" | "throw" | "reject" | "value-throw";
  scope?: unknown;
  offPeak?: unknown;
  automation?: boolean;
  trace?: unknown;
  output?: unknown;
  verdict?: unknown;
  aborted?: boolean;
}
export const names = {
  send: "SendMessage",
  respond: "RespondToCoordinator",
  submit: "submit_result",
};
export const validInputs = {
  send: {
    to: "synthetic-recipient",
    summary: "Fictional update",
    message: "Synthetic task details",
  },
  respond: { summary: "Fictional progress", message: "Synthetic findings" },
  submit: { result: { syntheticValue: "fictional" } },
};
export const outputs = {
  send: {
    status: "success",
    messageId: "synthetic-message",
    agentId: "synthetic-agent",
    delivery: "queued",
  },
  respond: {
    status: "success",
    responseId: "synthetic-response",
    message: "Synthetic queued response",
  },
};
export const violations = [{ path: "$.syntheticValue", expected: "string", got: "number" }];
export const resultSchema = {
  type: "object",
  properties: { syntheticValue: { type: "string" } },
  required: ["syntheticValue"],
  additionalProperties: false,
};
export const directCases: Scenario[] = [];
for (const operation of ["send", "respond", "submit"] as const) {
  directCases.push({ label: `${operation} default`, operation });
  for (const input of [
    undefined,
    null,
    [],
    false,
    7,
    "wrong",
    {},
    { ...validInputs[operation], extra: true },
  ])
    directCases.push({
      label: `${operation} malformed ${directCases.length}`,
      operation,
      input,
      port: "missing",
    });
  for (const port of [
    "missing",
    "empty",
    "nonfunction",
    "false-method",
    "throw",
    "reject",
    "value-throw",
  ] as const)
    directCases.push({ label: `${operation} port ${port}`, operation, port });
  for (const trace of [undefined, null, {}, { traceId: "synthetic-supplied-trace" }, 0, false])
    directCases.push({ label: `${operation} trace ${directCases.length}`, operation, trace });
  directCases.push({ label: `${operation} aborted`, operation, aborted: true });
}
directCases.push(
  { label: "send idle denies before port", operation: "send", offPeak: true, port: "missing" },
  { label: "send malformed before idle", operation: "send", offPeak: true, input: {} },
  { label: "send ordinary automation", operation: "send", automation: true },
  { label: "send truthy idle", operation: "send", offPeak: "truthy" },
  { label: "send idle automation denied", operation: "send", offPeak: true, automation: true },
  { label: "send steered", operation: "send", output: { ...outputs.send, delivery: "steered" } },
  {
    label: "send resumed background",
    operation: "send",
    output: {
      ...outputs.send,
      delivery: "resumed_background",
      outputFile: "synthetic-output-never-opened.txt",
      taskId: "synthetic-background",
    },
  },
  {
    label: "send failed is ordinary output",
    operation: "send",
    output: { ...outputs.send, status: "failed", error: "Synthetic recipient refusal" },
  },
  {
    label: "send malformed output passed through",
    operation: "send",
    output: { success: true, message: "Synthetic wrong protocol" },
  },
  { label: "respond main denies", operation: "respond", scope: "main" },
  { label: "respond unset denies", operation: "respond", scope: undefined },
  { label: "respond wrong case denies", operation: "respond", scope: "Subagent" },
  {
    label: "respond failed is ordinary output",
    operation: "respond",
    output: { ...outputs.respond, status: "failed", error: "Synthetic parent refusal" },
  },
  { label: "respond malformed output passed through", operation: "respond", output: null },
  { label: "submit subagent permitted", operation: "submit", scope: "subagent" },
  { label: "submit wrong scope still permitted", operation: "submit", scope: "wrong" },
  { label: "submit absent result directly permitted", operation: "submit", input: {} },
  { label: "submit null result permitted", operation: "submit", input: { result: null } },
  { label: "submit reject", operation: "submit", verdict: { accept: false, violations } },
  { label: "submit reject empty", operation: "submit", verdict: { accept: false, violations: [] } },
  {
    label: "submit reject ordered duplicates",
    operation: "submit",
    verdict: {
      accept: false,
      violations: [...violations, ...violations, { path: "$", expected: "object", got: "null" }],
    },
  },
  { label: "submit truthy accept preserved", operation: "submit", verdict: { accept: "yes" } },
  ...[
    null,
    undefined,
    false,
    {},
    { accept: 0, violations: [] },
    { accept: false },
    { accept: false, violations: null },
    { accept: false, violations: {} },
    { accept: false, violations: "bad" },
    { accept: false, violations: [null] },
    { accept: false, violations: [{}] },
    { accept: false, violations: Object.assign([], { length: 2 }) },
  ].map((verdict, index) => ({
    label: `submit malformed verdict ${index}`,
    operation: "submit" as const,
    verdict,
  })),
);
export const contextFields = [
  "subagentPort",
  "coordinatorResponsePort",
  "workflowSubmitPort",
  "runtimeScope",
  "offPeakTurn",
  "automationTurn",
  "toolCallId",
  "sessionId",
  "turnId",
  "workingDirectory",
  "workspaceRoot",
  "traceContext",
  "traceId",
  "spanId",
  "parentSpanId",
  "abortSignal",
  "model",
  "subagentModelOverride",
];
export const getterCases = ["send", "respond", "submit"].flatMap((operation) => [
  { operation: operation as Operation },
  ...contextFields.map((field) => ({ operation: operation as Operation, fault: { field, at: 1 } })),
  ...[
    "subagentPort",
    "coordinatorResponsePort",
    "workflowSubmitPort",
    "sessionId",
    "turnId",
    "toolCallId",
    "method",
  ].map((field) => ({ operation: operation as Operation, fault: { field, at: 2 } })),
  { operation: operation as Operation, fault: { field: "method", at: 1 } },
]);
export const formatCases = {
  send: [
    outputs.send,
    { ...outputs.send, message: "Explicit synthetic text" },
    { ...outputs.send, message: "", delivery: undefined },
    { ...outputs.send, agentId: "", taskId: "synthetic-task" },
    { status: "success", messageId: "m", taskId: "synthetic-task" },
    { status: "success", messageId: "m" },
    { status: "failed", messageId: "m" },
    { status: "failed", messageId: "m", error: "", message: "" },
    { status: "failed", messageId: "m", message: "Port says failure" },
    ...["queued", "steered", "resumed_background"].map((delivery) => ({
      ...outputs.send,
      delivery,
    })),
    null,
    {},
    { ...outputs.send, extra: true },
  ],
  respond: [
    outputs.respond,
    { ...outputs.respond, status: "failed", error: "Synthetic error" },
    { ...outputs.respond, status: "failed", error: "" },
    { ...outputs.respond, status: "failed", error: undefined },
    { ...outputs.respond, status: "failed", error: "界".repeat(3000) },
    null,
    {},
    { ...outputs.respond, extra: true },
  ],
  submit: [
    { status: "accepted" },
    {},
    null,
    undefined,
    "accepted",
    { status: "accepted", extra: true },
  ],
};
export const executorCases: {
  c: Scenario;
  decision?: "allow" | "deny" | "ask";
  typed?: boolean;
}[] = [
  ...(["send", "respond", "submit"] as const).flatMap((operation) => [
    { c: { label: `${operation} executor success`, operation } },
    { c: { label: `${operation} executor malformed`, operation, input: null } },
    { c: { label: `${operation} executor missing`, operation, port: "missing" as const } },
    { c: { label: `${operation} executor reject`, operation, port: "reject" as const } },
    { c: { label: `${operation} executor deny`, operation }, decision: "deny" as const },
    { c: { label: `${operation} executor ask`, operation }, decision: "ask" as const },
  ]),
  { c: { label: "send executor idle", operation: "send", offPeak: true } },
  { c: { label: "send executor automation", operation: "send", automation: true } },
  {
    c: {
      label: "send executor failed ordinary output",
      operation: "send",
      output: { ...outputs.send, status: "failed", error: "Synthetic refusal" },
    },
  },
  { c: { label: "respond executor main", operation: "respond", scope: "main" } },
  {
    c: {
      label: "respond executor failed ordinary output",
      operation: "respond",
      output: { ...outputs.respond, status: "failed" },
    },
  },
  {
    c: {
      label: "submit executor rejected",
      operation: "submit",
      verdict: { accept: false, violations },
    },
  },
  { c: { label: "submit executor malformed verdict", operation: "submit", verdict: null } },
  { c: { label: "submit executor typed accepted", operation: "submit" }, typed: true },
  {
    c: {
      label: "submit executor typed mismatched",
      operation: "submit",
      input: { result: { syntheticValue: 7 } },
    },
    typed: true,
  },
  {
    c: {
      label: "submit executor runtime missing result differs from declaration",
      operation: "submit",
      input: {},
    },
  },
];
