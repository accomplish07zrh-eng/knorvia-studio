// Source-exposed compatibility facts; all URLs, content and ports are synthetic.
export interface FetchCase {
  label: string;
  input?: any;
  url?: string;
  status?: number;
  statusText?: any;
  headers?: any;
  body?: string;
  responses?: any[];
  modelText?: any;
  noHttp?: boolean;
  noModel?: boolean;
  artifact?: boolean;
  seed?: any;
  repeat?: number;
  advance?: number;
  fault?: { target: string; kind: string; code?: string };
}
export const URL_FIXTURE = "https://owned-webfetch.example/fixture";
export const cachedContent = {
  bytes: 17,
  content: "synthetic cached content",
  contentType: "text/plain",
  finalUrl: URL_FIXTURE,
  redirects: [],
  sizeBytes: 24,
  status: 200,
  statusText: "OK",
};
export const directCases: FetchCase[] = [
  { label: "fresh then hit", repeat: 2 },
  { label: "ttl exact expiry", repeat: 2, advance: 900000 },
  { label: "ttl before expiry", repeat: 2, advance: 899900 },
  { label: "seeded hit no HTTP", seed: cachedContent, noHttp: true },
  { label: "HTTP spelling", url: "http://owned-webfetch.example/fixture" },
  { label: "host case and fragment", url: "https://OWNED-WEBFETCH.example/fixture#fragment" },
  {
    label: "HTML",
    headers: { "content-type": "text/html" },
    body: "<h1>Owned</h1><script>ignored</script><p>synthetic &amp; text</p>",
  },
  {
    label: "preapproved markdown",
    url: "https://docs.python.org/owned-fixture",
    headers: { "content-type": "text/markdown" },
    noModel: true,
  },
  { label: "nonapproved markdown", headers: { "content-type": "text/markdown" } },
  {
    label: "restricted preapproval",
    url: "https://vercel.com/other-owned-fixture",
    headers: { "content-type": "text/markdown" },
  },
  { label: "preapproved model prompt", url: "https://vercel.com/docs/owned-fixture" },
  { label: "blank model text", modelText: "  \n" },
  { label: "missing model then cache hit", noModel: true, repeat: 2 },
  { label: "missing HTTP", noHttp: true },
  { label: "unknown status", status: 299, statusText: " " },
  { label: "custom status", statusText: " custom " },
  { label: "HTTP retry after", status: 429, headers: { "Retry-After": "17" }, repeat: 2 },
  { label: "HTTP no valid retry", status: 403, headers: { "retry-after": "tomorrow" } },
  { label: "proxy blocked", status: 403, headers: { "x-proxy-error": "blocked-by-allowlist" } },
  {
    label: "cross host",
    status: 302,
    headers: { location: "https://other-owned.example/target" },
    repeat: 2,
  },
  { label: "redirect missing location", status: 301 },
  {
    label: "same host redirect",
    responses: [{ status: 302, headers: { location: "/target" } }, { status: 200 }],
  },
  {
    label: "credential redirect",
    status: 307,
    headers: { location: "https://synthetic:placeholder@owned-webfetch.example/target" },
  },
  {
    label: "private redirect",
    status: 302,
    headers: { location: "http://127.0.0.1/owned-fixture" },
  },
  { label: "redirect limit", status: 302, headers: { location: "/loop" } },
  { label: "invalid location", status: 302, headers: { location: "https://[" } },
  { label: "unsupported MIME", headers: { "content-type": "image/png" } },
  { label: "artifact plus truncation", body: "x".repeat(100001), artifact: true },
  {
    label: "preapproved exact processing boundary",
    url: "https://docs.python.org/owned-fixture",
    headers: { "content-type": "text/markdown" },
    body: "x".repeat(100000),
  },
  ...[
    null,
    {},
    { url: "bad", prompt: "synthetic" },
    { url: URL_FIXTURE },
    { url: URL_FIXTURE, prompt: 1 },
  ].map((input, i) => ({ label: `schema ${i}`, input })),
  ...[
    "ftp://owned-webfetch.example/fixture",
    "https://synthetic:placeholder@owned-webfetch.example/fixture",
    "https://localhost/fixture",
    "https://127.0.0.1/fixture",
    "https://[::1]/fixture",
    "https://owned-webfetch.example/" + "x".repeat(2000),
  ].map((url, i) => ({ label: `URL admission ${i}`, url })),
  ...[
    "throw",
    "reject",
    "string",
    "null",
    "missing",
    "too_large",
    "egress_blocked",
    "network_error",
  ].map((kind) => ({ label: `HTTP ${kind}`, fault: { target: "request", kind } })),
  ...["throw", "reject", "string", "null", "missing", "undefined", "object"].map((kind) => ({
    label: `model ${kind}`,
    fault: { target: "generateText", kind },
    repeat: 2,
  })),
  ...["throw", "reject"].map((kind) => ({
    label: `artifact ${kind}`,
    artifact: true,
    body: "x".repeat(100001),
    fault: { target: "artifact", kind },
  })),
  { label: "event rejected", fault: { target: "event", kind: "reject" } },
  { label: "event missing", fault: { target: "event", kind: "missing" } },
  {
    label: "cached malformed discriminator",
    seed: { ...cachedContent, type: "unknown", originalUrl: URL_FIXTURE },
  },
  { label: "cached malformed status text", seed: { ...cachedContent, statusText: null } },
];
export const getterTargets = [
  "context.httpClientPort",
  "context.model",
  "context.artifactStore",
  "context.emitEvent",
  "context.abortSignal",
  "context.traceId",
  "context.spanId",
  "context.parentSpanId",
  "context.sessionId",
  "context.turnId",
  "context.toolCallId",
  "http.request",
  "model.generateText",
  "model.optionSpecs",
  "response.status",
  "response.statusText",
  "response.headers",
  "response.body",
  "response.bytes",
  "response.durationMs",
  "response.url",
];
export const getterCases = getterTargets.flatMap((target) => [
  { target, throwAt: 0 },
  { target, throwAt: 1 },
  { target, throwAt: 2 },
]);
