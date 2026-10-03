import type { StreamCase } from "./websearch-fixture.js";
const text = (value: unknown) => ({ type: "text_delta", text: value });
const finish = (usage: unknown = {}, label = "stop") => ({
  type: "finish",
  usage,
  finishReason: label,
  providerMetadata: { synthetic: label },
});
export const streamCases: StreamCase[] = [
  { label: "missing", missingModel: true, events: [] },
  { label: "unsupported", supported: false, events: [] },
  { label: "empty", events: [] },
  { label: "partial", events: [text(" Partial ")] },
  {
    label: "markdown",
    events: [
      text(" [ Example ](https://example.invalid/a) "),
      finish({ inputTokens: 2, outputTokens: 3, serverToolUse: { webSearchRequests: 1 } }),
    ],
  },
  {
    label: "reordered",
    events: [
      finish({ totalTokens: 1 }, "first"),
      text("a"),
      finish({ totalTokens: 9 }, "last"),
      text("b"),
    ],
  },
  {
    label: "ignored",
    events: [
      { type: "start" },
      { type: "reasoning_delta", text: "hidden" },
      { type: "tool_input_delta", delta: "hidden" },
      { type: "tool_call", toolCall: { id: "synthetic", name: "web_search", input: {} } },
      { type: "tool_result", output: { url: "https://ignored.invalid" } },
      { type: "source", url: "https://ignored.invalid" },
      text(" visible "),
    ],
  },
  ...[
    undefined,
    null,
    1,
    {},
    "malformed",
    { type: "finish" },
    { type: "finish", usage: null },
    { type: "text_delta" },
  ].map((event, index) => ({ label: `malformed/${index}`, events: [event] })),
  ...[undefined, null, "synthetic failure", 42, { message: "synthetic" }].map((error, index) => ({
    label: `error-event/${index}`,
    events: [text("partial"), { type: "error", error }, text("unread")],
  })),
  {
    label: "iterator-failure",
    iteratorFailure: "synthetic iterator failure",
    iteratorFailureAt: 1,
    events: [text("partial"), text("unread")],
  },
  { label: "start-failure", startFailure: "synthetic initial failure", events: [] },
  ...[0, 1024, 4096, 4097, 9000].map((maxTokens) => ({
    label: `budget/${maxTokens}`,
    maxTokens,
    events: [],
  })),
  { label: "empty-levels", levels: [], events: [] },
  ...[
    { query: "domain example", allowed_domains: ["example.invalid"], maxUses: 1 },
    { query: "domain example", blocked_domains: ["example.invalid"], maxUses: 8 },
    { query: "domain example", allowed_domains: [], blocked_domains: [] },
    { query: "domain example", maxUses: 0 },
    {},
    undefined,
    null,
    "example",
    { query: 123 },
  ].map((input, index) => ({ label: `raw-input/${index}`, input, events: [] })),
  ...[0, false, null, undefined, ["a", "b"], {}].map((value, index) => ({
    label: `text-coercion/${index}`,
    events: [text(value), text("x")],
  })),
];
const tool = (output: unknown) => ({
  id: "synthetic-result",
  name: "web_search",
  input: {},
  output,
});
const record = (url: unknown, extra: Record<string, unknown> = {}) => ({ url, ...extra });
const base = { text: "", finishReason: "stop", usage: {} };
const outputs = [
  record("https://example.invalid/a", { title: "Example", pageAge: "today" }),
  [
    record("HTTPS://EXAMPLE.invalid/A", { title: "First" }),
    record("https://example.invalid/a", { title: "Second" }),
  ],
  {
    content: [record("https://example.invalid/content")],
    sources: [record("https://example.invalid/ignored")],
  },
  record("https://example.invalid/leaf", {
    type: "url",
    content: [record("https://example.invalid/ignored")],
  }),
  record("https://example.invalid/source-only", {
    type: "other",
    sources: [record("https://example.invalid/result")],
  }),
  [
    null,
    undefined,
    3,
    "example",
    { url: "", title: "empty" },
    record("example", { type: "", title: null, pageAge: 7 }),
  ],
  { sources: [[record("https://example.invalid/nested", { type: "web_search_result" })]] },
];
export const projectionCases = [
  { label: "empty", result: base },
  ...outputs.map((output, index) => ({
    label: `tool-result/${index}`,
    result: { ...base, toolResults: [tool(output)] },
  })),
  {
    label: "precedence",
    result: {
      ...base,
      text: "[Summary](https://example.invalid/a) [Other](https://example.invalid/b)",
      sources: [
        { sourceType: "url", url: "HTTPS://EXAMPLE.invalid/A", title: "Model first" },
        { sourceType: "document", url: "https://ignored.invalid" },
      ],
      toolResults: [tool(outputs[0])],
    },
  },
  ...[
    "![image](https://image.invalid/x) [ link ](https://example.invalid/a)",
    "[a](http://example.invalid/x) [b](ftp://ignored.invalid/x)",
    "[a](https://example.invalid/(x)) [a](HTTPS://example.invalid/(x))",
    " [a\nb](https://ignored.invalid/x) ",
  ].map((summary, index) => ({ label: `markdown/${index}`, result: { ...base, text: summary } })),
  ...[
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "reasoningTokens",
  ].flatMap((key) =>
    [0, 2, null].map((value) => ({
      label: `usage/${key}/${value}`,
      result: { ...base, usage: { [key]: value } },
    })),
  ),
  ...[{}, { webSearchRequests: 0 }, { webFetchRequests: 2 }, { other: 3 }].map(
    (serverToolUse, index) => ({
      label: `server-usage/${index}`,
      result: { ...base, usage: { serverToolUse } },
    }),
  ),
  ...[
    undefined,
    null,
    {},
    { ...base, text: null },
    { ...base, usage: null },
    { ...base, sources: [{}] },
    { ...base, sources: [null] },
    { ...base, toolResults: [null] },
    { ...base, toolResults: {} },
    { ...base, sources: {} },
  ].map((result, index) => ({ label: `malformed/${index}`, result })),
];
export const formatCases: unknown[] = [
  undefined,
  null,
  3,
  "example",
  {},
  [],
  { query: "example", results: [], sources: [], durationMs: 0 },
  {
    query: "example",
    summary: " ",
    results: [{ url: "https://example.invalid/a", title: "Result" }],
    sources: [{ url: "HTTPS://EXAMPLE.invalid/A", title: "" }],
    durationMs: 1,
  },
  {
    query: "example",
    results: [],
    sources: Array.from({ length: 25 }, (_, index) => ({
      url: `https://example.invalid/${index}`,
    })),
    durationMs: 2,
  },
  { query: "example", results: [], sources: [], durationMs: -1 },
];
export const executorCases = [
  streamCases[0],
  streamCases[1],
  streamCases[2],
  streamCases[4],
  streamCases[5],
  streamCases.find((c) => c.label === "error-event/2")!,
  { label: "schema/short", input: { query: "x" }, events: [] },
  {
    label: "schema/both-domains",
    input: { query: "example", allowed_domains: ["a.invalid"], blocked_domains: ["b.invalid"] },
    events: [],
  },
  { label: "schema/quota", input: { query: "example", maxUses: 9 }, events: [] },
];
