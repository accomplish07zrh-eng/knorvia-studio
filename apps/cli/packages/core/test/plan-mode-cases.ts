import { validPlan, type Scenario } from "./plan-mode-fixture.js";

export const directCases: Scenario[] = [
  ...(["enter", "exit"].flatMap((operation) =>
    ["empty", "nonfunction-enabled", "nonfunction-transition", "nonfunction-mode"].map(
      (portKind) => ({ label: `${operation} raw port ${portKind}`, operation, portKind }),
    ),
  ) as Scenario[]),
  { label: "enter", operation: "enter" },
  { label: "exit" },
  { label: "enter without filesystem", operation: "enter", noFileSystem: true },
  { label: "exit without filesystem", noFileSystem: true },
  {
    label: "raw allowed prompts",
    input: {
      plan: validPlan,
      allowedPrompts: [
        { tool: "Bash", prompt: "run fictional tests" },
        { tool: "Bash", prompt: "" },
      ],
      extra: { ignored: true },
    },
  },
  ...["enter", "exit"].flatMap(
    (operation) =>
      [
        { label: `${operation} missing port`, operation, missingPort: true },
        ...[undefined, null, false, [], "", 0].map((input) => ({
          label: `${operation} malformed ${String(input)}`,
          operation,
          input,
          missingPort: true,
        })),
        { label: `${operation} transition throw`, operation, transitionFailure: "error" },
        {
          label: `${operation} transition thrown primitive`,
          operation,
          transitionFailure: "value",
        },
        ...[null, {}, { mode: "plan", previousMode: "auto" }].map((transition, index) => ({
          label: `${operation} malformed transition ${index}`,
          operation,
          transition,
        })),
      ] as Scenario[],
  ),
  { label: "enter strict extras", operation: "enter", input: { extra: true }, missingPort: true },
  ...["", "  \r\n ", "x".repeat(20001), null, 0].map((plan) => ({
    label: `invalid plan ${typeof plan}/${String(plan).length}`,
    input: { plan },
    missingPort: true,
  })),
  { label: "maximum plan", input: { plan: "x".repeat(20000) } },
  { label: "maximum multibyte plan", input: { plan: "界".repeat(20000) } },
  {
    label: "invalid prompt tool",
    input: { plan: validPlan, allowedPrompts: [{ tool: "Read", prompt: "x" }] },
  },
  {
    label: "invalid prompt extras",
    input: { plan: validPlan, allowedPrompts: [{ tool: "Bash", prompt: "x", extra: true }] },
  },
  ...[false, true, null, undefined, 0, "enabled"].map((enabled) => ({
    label: `enabled ${String(enabled)}`,
    enabled,
    mode: "build",
  })),
  { label: "fallback plan", omitEnabled: true, mode: "plan" },
  { label: "fallback inactive", omitEnabled: true, mode: "build" },
  { label: "explicit false overrides mode", enabled: false, mode: "plan" },
  ...[
    "fs:cancelled",
    "fs:permission_denied",
    "fs:io_error",
    "fs:stale_write",
    "error",
    "cancel-like",
    "value",
  ].map((writeFailure) => ({ label: `write ${writeFailure}`, writeFailure })),
  { label: "aborted direct successful write", abort: true },
  { label: "aborted direct rejected write", abort: true, writeFailure: "error" },
  { label: "sanitized session", sessionId: "  fictional/session: id! " },
  { label: "invalid session ignored persistence", sessionId: "??" },
];
export const executorCases = [
  { c: { label: "executor enter", operation: "enter" as const } },
  { c: { label: "executor approved", enabled: true } },
  { c: { label: "executor denied", enabled: true }, decision: "deny" as const },
  { c: { label: "executor inactive", enabled: false } },
  { c: { label: "executor malformed", input: { plan: "" } } },
  { c: { label: "executor write cancelled", writeFailure: "fs:cancelled" } },
  { c: { label: "executor write noncancel", writeFailure: "fs:permission_denied" } },
  { c: { label: "executor invalid output", operation: "enter" as const, transition: {} } },
];
export const getterCases = [
  ...["enter", "exit"].map((operation) => ({ operation: operation as "enter" | "exit" })),
  ...[
    { field: "sessionModePort", at: 1 },
    { field: "fileSystemPort", at: 1 },
    { field: "fileSystemPort", at: 2 },
    { field: "abortSignal", at: 1 },
    { field: "abortSignal", at: 2 },
    { field: "workspaceRoot", at: 1 },
    { field: "traceId", at: 1 },
  ].map((fault) => ({ operation: "exit" as const, fault })),
];
