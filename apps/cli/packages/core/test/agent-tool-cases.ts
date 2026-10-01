export interface AgentCase {
  label: string;
  alias?: boolean;
  input?: unknown;
  port?: "missing" | "empty" | "nonfunction" | "throw" | "reject" | "value-throw";
  output?: unknown;
  visible?: unknown;
  abort?: boolean;
  model?: unknown;
  override?: unknown;
}
export const validInput = { description: "Synthetic bounded task", prompt: "Fictional prompt" };
export const completed = {
  status: "completed",
  agentId: "synthetic-child",
  agentType: "general-purpose",
  description: validInput.description,
  prompt: validInput.prompt,
  content: [{ type: "text", text: "Fictional findings\nSecond line" }],
  totalToolUseCount: 2,
  totalDurationMs: 37,
  totalTokens: 19,
  usage: { inputTokens: 7, outputTokens: 12 },
};
export const backgrounded = {
  status: "async_launched",
  isAsync: true,
  agentId: "synthetic-child",
  agentType: "general-purpose",
  description: validInput.description,
  prompt: validInput.prompt,
  childSessionId: "synthetic-child-session",
  backgroundTaskId: "synthetic-background",
  outputFile: "synthetic-output-never-opened.txt",
  canReadOutputFile: false,
};
export const directCases: AgentCase[] = [
  { label: "default" },
  { label: "Task default", alias: true },
  { label: "background", input: { ...validInput, run_in_background: true }, output: backgrounded },
  { label: "explicit false", input: { ...validInput, run_in_background: false } },
  { label: "custom type", input: { ...validInput, subagent_type: "synthetic-profile" } },
  { label: "empty fields", input: { description: "", prompt: "", subagent_type: "" } },
  { label: "unknown keys stripped", input: { ...validInput, model: "ignored", unknown: 1 } },
  ...[
    undefined,
    null,
    false,
    1,
    [],
    {},
    { prompt: "p" },
    { description: "d" },
    { ...validInput, prompt: 7 },
    { ...validInput, description: null },
    { ...validInput, subagent_type: null },
    { ...validInput, run_in_background: "true" },
  ].map((input, index) => ({ label: `malformed ${index}`, input, port: "missing" as const })),
  ...["missing", "empty", "nonfunction", "throw", "reject", "value-throw"].map((port) => ({
    label: `port ${port}`,
    port: port as AgentCase["port"],
  })),
  { label: "Task missing", alias: true, port: "missing" },
  ...[undefined, [], ["Read"], ["Bash"], ["read", "bash"], ["Task", "Read", "Read"], "Read", 1].map(
    (visible, index) => ({ label: `visibility ${index}`, visible }),
  ),
  { label: "aborted signal still passed", abort: true },
  {
    label: "model and override",
    model: { syntheticModel: true },
    override: { syntheticOverride: true },
  },
  { label: "falsy optional fields", model: 0, override: false },
  { label: "raw malformed output", output: { status: "wrong", extra: true } },
  { label: "raw string output", output: "synthetic raw string" },
  { label: "raw null output", output: null },
];
export const contextFields = [
  "subagentPort",
  "sessionId",
  "turnId",
  "toolCallId",
  "providerVisibleToolNames",
  "workingDirectory",
  "workspaceRoot",
  "traceId",
  "spanId",
  "parentSpanId",
  "abortSignal",
  "model",
  "subagentModelOverride",
];
export const getterCases = [
  undefined,
  ...contextFields.map((field) => ({ field, at: 1 })),
  ...["subagentPort", "sessionId", "turnId", "model", "subagentModelOverride"].map((field) => ({
    field,
    at: 2,
  })),
  { field: "launch", at: 1 },
];
export const executorCases = [
  { c: { label: "Agent foreground" }, decision: "allow" },
  { c: { label: "Task foreground", alias: true }, decision: "allow" },
  {
    c: {
      label: "Agent background",
      input: { ...validInput, run_in_background: true },
      output: backgrounded,
    },
    decision: "allow",
  },
  {
    c: {
      label: "Task background read visibility",
      alias: true,
      visible: ["Read"],
      output: { ...backgrounded, canReadOutputFile: true },
    },
    decision: "allow",
  },
  { c: { label: "denied" }, decision: "deny" },
  { c: { label: "asked synthetic allow" }, decision: "ask" },
  { c: { label: "invalid before admission", input: null, port: "missing" }, decision: "allow" },
  { c: { label: "missing port", port: "missing" }, decision: "allow" },
  { c: { label: "rejected launch", port: "reject" }, decision: "allow" },
  { c: { label: "malformed launch result", output: { status: "wrong" } }, decision: "allow" },
  { c: { label: "empty foreground", output: { ...completed, content: [] } }, decision: "allow" },
] satisfies { c: AgentCase; decision: "allow" | "deny" | "ask" }[];
export const descriptionCases = [
  {},
  { dynamicWorkflowEnabled: false },
  { dynamicWorkflowEnabled: true },
  { embeddedSearchEnabled: false },
  { embeddedSearchEnabled: true },
  { dynamicWorkflowEnabled: false, embeddedSearchEnabled: true },
  {
    profiles: [
      {
        name: "synthetic-specialist",
        description: "Fictional specialist",
        source: "project",
        systemPrompt: "Never used",
        tools: ["Read", "Bash", "Agent", "Task", "SendMessage"],
        disallowedTools: ["Bash"],
      },
    ],
  },
  {
    profiles: [
      {
        name: "Explore",
        description: "Fictional override",
        source: "user",
        systemPrompt: "Never used",
        tools: ["Read"],
      },
    ],
    embeddedSearchEnabled: true,
  },
  {
    profiles: [
      {
        name: "general-purpose",
        description: "Fictional default override",
        source: "project",
        systemPrompt: "Never used",
      },
    ],
    dynamicWorkflowEnabled: false,
  },
  {
    profiles: [
      {
        name: "synthetic-specialist",
        description: "First",
        source: "project",
        systemPrompt: "Never used",
      },
      {
        name: "synthetic-specialist",
        description: "Second",
        source: "user",
        systemPrompt: "Never used",
        tools: [],
      },
    ],
  },
  { profiles: null },
  { profiles: [null] },
];
export const formatCases: unknown[] = [
  completed,
  { ...completed, totalTokens: undefined },
  { ...completed, totalTokens: 0 },
  { ...completed, content: [] },
  { ...completed, content: [{ type: "text", text: " \n\t" }] },
  {
    ...completed,
    content: [
      { type: "text", text: "  leading " },
      { type: "text", text: "\r\ntrailing  " },
    ],
  },
  backgrounded,
  { ...backgrounded, canReadOutputFile: true },
  { ...completed, extra: true },
  { ...completed, totalDurationMs: -1 },
  { ...completed, content: [{ type: "image", text: "wrong" }] },
  { ...backgrounded, isAsync: undefined },
  "raw synthetic string",
  "",
  undefined,
  null,
  0,
  false,
  {},
  [],
  1n,
  {
    toJSON() {
      return undefined;
    },
    toString() {
      return "Synthetic string fallback";
    },
  },
  {
    toJSON() {
      throw new Error("Synthetic JSON failure");
    },
  },
];
const circular: any = {};
circular.self = circular;
formatCases.push(circular);
