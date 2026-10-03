// Source-exposed synthetic cases; retained protocol/prose is not new original expression.
export const answer = { kind: "answered", answer: "synthetic answer", qid: "synthetic-qid" };
export const refusal = {
  kind: "refused",
  message: "synthetic refusal",
  reason: "budget_exhausted",
};
export interface Scenario {
  label: string;
  input?: unknown;
  outcome?: unknown;
  port?: string;
  scope?: string;
  trace?: unknown;
  swap?: string;
  probe?: { target: string; throwAt: number };
}
export const validInput = { question: "synthetic question", context: "synthetic evidence" };
export const contextFields = [
  "workflowEscalatePort",
  "toolCallId",
  "traceContext",
  "traceId",
  "spanId",
  "parentSpanId",
  "sessionId",
  "turnId",
  "runtimeScope",
  "abortSignal",
];
export const cases: Scenario[] = [
  { label: "answered" },
  { label: "context absent", input: { question: "synthetic question" } },
  { label: "context undefined", input: { question: "synthetic question", context: undefined } },
  { label: "empty context", input: { question: " ", context: "" } },
  { label: "refused budget", outcome: refusal },
  { label: "refused no ask", outcome: { ...refusal, reason: "no_active_ask" } },
  ...["main", "subagent", "unknown"].map((scope) => ({ label: `scope ${scope}`, scope })),
  ...[
    undefined,
    null,
    false,
    {},
    { traceId: "owned-trace", spanId: "owned-span", extra: "kept" },
  ].map((trace, index) => ({ label: `trace ${index}`, trace })),
  ...[
    "missing",
    "empty",
    "nonfunction",
    "throw",
    "throw-value",
    "reject",
    "reject-value",
    "thenable",
    "thenable-throw",
    "then-getter-throw",
    "double-settle",
    "delay",
  ].map((port) => ({ label: `port ${port}`, port })),
  ...["missing", "empty", "other"].map((swap) => ({ label: `second port ${swap}`, swap })),
  ...[
    null,
    undefined,
    false,
    0,
    "synthetic malformed",
    {},
    [],
    { kind: "unknown", message: "synthetic fallback", reason: "no_active_ask" },
    { kind: "answered", answer: undefined, qid: undefined },
    { kind: "answered", answer: null, qid: 7 },
    { kind: "refused", message: "", reason: "unknown" },
  ].map((outcome, index) => ({ label: `outcome ${index}`, outcome })),
  ...[
    null,
    undefined,
    false,
    0,
    "question",
    [],
    {},
    { question: "" },
    { question: 7 },
    { question: "synthetic", context: null },
    { question: "synthetic", extra: true },
  ].map((input, index) => ({ label: `schema ${index}`, input, port: "missing" })),
];
export const getterCases: Scenario[] = [
  ...contextFields.map((field) => `context.${field}`),
  "input.question",
  "input.context",
  "port.escalate",
  "outcome.kind",
  "outcome.answer",
  "outcome.qid",
  "outcome.message",
  "outcome.reason",
  "thenable.then",
].flatMap((target) =>
  [0, 1, 2].map((throwAt) => ({
    label: `${target}/${throwAt}`,
    probe: { target, throwAt },
    ...(target.startsWith("outcome.m") || target === "outcome.reason" ? { outcome: refusal } : {}),
    ...(target === "thenable.then" ? { port: "thenable" } : {}),
  })),
);
export const executorCases = [
  ...cases.filter((c) => !c.label.startsWith("trace") && !c.swap && !c.label.startsWith("scope")),
  ...["deny", "ask", "hook", "early"].map((port) => ({ label: `admission ${port}`, port })),
];
