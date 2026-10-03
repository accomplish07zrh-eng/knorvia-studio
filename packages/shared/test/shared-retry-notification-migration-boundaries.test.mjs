// Synthetic pure data boundaries only; retained dependency algorithms are virtual.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

const root = process.argv[2];
assert.ok(root, "Supply baseline or candidate source root.");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ports = {
  "./protocol-legacy-types.js":
    'export const textFromKnorviaMessageParts=parts=>parts.filter(p=>p.type==="text").map(p=>p.text).join("");',
  "./custom-model-value.js":
    'export const encodeCustomModelValue=(p,m)=>"custom:"+encodeURIComponent(p)+(m?":"+encodeURIComponent(m):"");export const decodeCustomModelValue=v=>{if(!v.startsWith("custom:"))return null;const body=v.slice(7),i=body.indexOf(":");return i<0?{providerId:decodeURIComponent(body)}:{providerId:decodeURIComponent(body.slice(0,i)),modelName:decodeURIComponent(body.slice(i+1))};};',
  "./legacy-model-provider-identity.js":
    'export const migrateLegacyModelProviderId=p=>p==="builtin:old"?"builtin:new":p;export const migrateLegacyOfficialGlmModelId=(p,m)=>p==="builtin:old"&&m==="OldName"?"NewName":m;',
  "./model-selection.js":
    'export const parseModelPickerValue=v=>{const i=v.indexOf("/");if(i<1)throw new Error("synthetic invalid picker");return {providerId:v.slice(0,i),modelId:v.slice(i+1),options:{reasoningLevel:"retained"}};};',
};
async function load(name) {
  const output = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "synthetic-retained-ports",
        setup(builder) {
          builder.onResolve({ filter: /\.js$/ }, (args) =>
            ports[args.path] ? { path: args.path, namespace: "synthetic" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({
            contents: ports[args.path],
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, { module, exports: module.exports });
  return module.exports;
}

test("retry projection admits integer counters and preserves pending recovery versus clear decisions", async () => {
  const api = await load("api-retry-status");
  assert.equal(api.normalizeKnorviaApiRetryStatus(null), null);
  assert.equal(api.normalizeKnorviaApiRetryStatus([]), undefined);
  assert.equal(api.normalizeKnorviaApiRetryStatus({}), undefined);
  assert.deepEqual(
    plain(
      api.normalizeKnorviaApiRetryStatus({
        attempt: "3",
        nextAttempt: 4,
        maxRetries: 0,
        retryDelayMs: -1,
        delayMs: 2,
        error: "",
      }),
    ),
    {
      kind: "api_retry",
      attempt: 3,
      maxRetries: 3,
      retryDelayMs: 2,
      errorStatus: null,
      error: "",
    },
  );
  assert.equal(
    api.knorviaApiRetryFromModelNetworkStatusPayload({ type: "model_request_started", attempt: 2 }),
    undefined,
  );
  assert.equal(
    api.knorviaApiRetryFromModelNetworkStatusPayload({ type: "model_request_started", attempt: 1 }),
    null,
  );
  assert.equal(
    api.knorviaApiRetryFromModelNetworkStatusPayload({
      type: "model_request_failed",
      retryable: true,
    }),
    undefined,
  );
  assert.equal(
    api.knorviaApiRetryFromModelNetworkStatusPayload({
      type: "model_request_failed",
      retryable: "true",
    }),
    null,
  );
  const recovered = api.knorviaApiRetryFromModelNetworkStatusPayload({
    type: "model_request_started",
    attempt: 1,
    streamRecovery: { retryNumber: 2, maxRetries: 1, message: "" },
  });
  assert.equal(recovered.attempt, 2);
  assert.equal(recovered.maxRetries, 2);
  assert.equal(recovered.error, "");
  assert.equal(
    api.isKnorviaModelRetryRecoveryProgressPayload({ kind: "text_delta", delta: " " }),
    true,
  );
  assert.equal(
    api.isKnorviaModelRetryRecoveryProgressPayload({
      kind: "tool_input_delta",
      delta: "x",
      toolCallId: "",
    }),
    false,
  );
  assert.equal(
    api.isKnorviaModelRetryRecoveryProgressPayload({
      kind: "tool_input_start",
      toolCallId: "tool",
    }),
    true,
  );
});

test("notification parsing preserves ordered entity decoding, role admission and metadata identity", async () => {
  const api = await load("background-task-notifications");
  const text =
    "  <task-notification><tool-use-id> fixture </tool-use-id><summary>one\ntwo &amp;lt; &lt; &quot;</summary><status>killed</status>";
  const parsed = api.parseKnorviaBackgroundTaskNotificationText(text);
  assert.equal(parsed.toolUseId, "fixture");
  assert.equal(parsed.notification.summary, 'one\ntwo &lt; < "');
  assert.equal(Object.hasOwn(parsed.notification, "error"), true);
  assert.equal(
    api.parseKnorviaBackgroundTaskNotificationText(
      "<task-notification other><tool-use-id>x</tool-use-id>",
    ),
    null,
  );
  assert.equal(
    api.parseKnorviaBackgroundTaskNotificationText(
      "<task-notification><tool-use-id> </tool-use-id>",
    ),
    null,
  );
  const messages = [
    { info: { role: "assistant" }, parts: [{ type: "text", text }] },
    { info: { role: "user" }, parts: [{ type: "text", text, ignored: true }] },
    {
      info: { role: "user" },
      parts: [
        {
          type: "text",
          text: "<task-notification><tool-use-id>fixture</tool-use-id><result>last</result>",
        },
      ],
    },
  ];
  const collected = api.collectKnorviaBackgroundTaskNotificationsByToolUseId(messages);
  assert.equal(collected.size, 1);
  assert.equal(collected.get("fixture").result, "last");
  assert.equal(api.knorviaBackgroundTaskNotificationToolUpdateStatus("killed"), "stopped");
  assert.equal(api.knorviaBackgroundTaskNotificationToolUpdateStatus("lost"), "failed");
  const preserved = { nested: true };
  const raw = { preserved, _meta: { source: "fixture", knorvia: { older: true } } };
  assert.equal(api.attachKnorviaBackgroundTaskNotificationToRaw(raw, undefined), raw);
  const attached = api.attachKnorviaBackgroundTaskNotificationToRaw(raw, parsed.notification);
  assert.notEqual(attached, raw);
  assert.equal(attached.preserved, preserved);
  assert.equal(attached._meta.knorvia.taskNotification, parsed.notification);
  assert.equal(attached._meta.knorvia.older, true);
  assert.equal(Object.hasOwn(raw._meta.knorvia, "taskNotification"), false);
});

test("network debug projection retains event/query identity and filters header and numeric field admission", async () => {
  const { knorviaTaskNetworkDebugStatusFromPayload: project } = await load("network-debug-status");
  assert.equal(project({ taskId: "task", traceId: "trace", payload: { type: "unknown" } }), null);
  const result = project({
    taskId: "task",
    traceId: "trace",
    inputId: "",
    queryId: "",
    eventId: "",
    payload: {
      type: "model_request_failed",
      queryId: "payload-query",
      requestId: "request",
      attempt: 2,
      timestamp: "time",
      requestHeaders: { fixture: "", deny: 3 },
      responseHeaders: ["deny"],
      requestHeaderCount: 0,
      statusCode: "500",
      retryable: false,
      durationMs: 0.5,
      delayMs: Infinity,
      reason: " ",
      model: { providerId: "fixture-provider", modelId: "fixture-model" },
      secretUnknown: "omit",
    },
  });
  assert.equal(result.eventKey, "");
  assert.equal(Object.hasOwn(result, "eventId"), false);
  assert.equal(Object.hasOwn(result, "inputId"), false);
  assert.equal(Object.hasOwn(result, "queryId"), false);
  assert.equal(result.statusType, "model_request_failed");
  assert.deepEqual(plain(result.requestHeaders), { fixture: "" });
  assert.deepEqual(plain(result.responseHeaders), {});
  assert.equal(result.requestHeaderCount, 0);
  assert.equal(result.retryable, false);
  assert.equal(result.durationMs, 0.5);
  assert.equal(result.reason, " ");
  assert.equal(Object.hasOwn(result, "statusCode"), false);
  assert.equal(Object.hasOwn(result, "delayMs"), false);
  assert.equal(Object.hasOwn(result, "secretUnknown"), false);
  const keyed = project({
    taskId: "task",
    traceId: "trace",
    payload: { type: "model_stream_stalled", queryId: "query" },
  });
  assert.equal(keyed.eventKey, "trace:no-input:model_stream_stalled:no-request:no-attempt:no-time");
  assert.equal(keyed.queryId, "query");
});

test("Markdown selection keeps formal fields and lossless provider migration boundaries through fake identity ports", async () => {
  const api = await load("subagent-markdown-selection");
  assert.equal(api.parseSubagentMarkdownSelection({ model: " inherit " }), undefined);
  assert.equal(api.parseSubagentMarkdownSelection({ model: "invalid" }), undefined);
  assert.deepEqual(
    plain(api.parseSubagentMarkdownSelection({ model: "fixture/model", thoughtLevel: " chosen " })),
    { providerId: "fixture", modelId: "model", options: { reasoningLevel: "chosen" } },
  );
  assert.equal(
    api.parseSubagentMarkdownSelection({ model: "fixture/model" }).options.reasoningLevel,
    "retained",
  );
  assert.equal(
    api.formatSubagentMarkdownModel({ providerId: "a/b", modelId: "m$level" }),
    "custom:a%2Fb:m%24level",
  );
  const markdown =
    '\uFEFF---\r\nmodel : "builtin:old/OldName$high" # keep\r\nother: keep\r\n---\r\nbody exact\r\n';
  assert.equal(
    api.migrateSubagentMarkdownProvider(markdown),
    markdown.replace("builtin:old/OldName$high", "builtin:new/NewName$high"),
  );
  const encoded = "---\nmodel: 'custom:builtin%3Aold:Model%2fSame%24literal' # keep\n---\nbody";
  assert.equal(
    api.migrateSubagentMarkdownProvider(encoded),
    encoded.replace("builtin%3Aold", "builtin%3Anew"),
  );
  const unmarked = "model: builtin:old/OldName\nbody";
  assert.equal(api.migrateSubagentMarkdownProvider(unmarked), unmarked);
  const untouched = '---\n model: builtin:old/OldName\nmodel: "unterminated\n---\nbody';
  assert.equal(api.migrateSubagentMarkdownProvider(untouched), untouched);
});

test("line changes preserve logical newline data and bounded LCS cutoff after shared-edge trimming", async () => {
  const { computeLineChangeStat: count } = await load("lineChangeStat");
  assert.deepEqual(plain(count(null, "\n")), { added: 1, removed: 0 });
  assert.deepEqual(plain(count("a\n", "a")), { added: 0, removed: 0 });
  assert.deepEqual(plain(count("a\r\n", "a\n")), { added: 1, removed: 1 });
  assert.deepEqual(plain(count("a\nb\nc", "a\nx\nb\nc")), { added: 1, removed: 0 });
  const larger = Array.from({ length: 633 }, (_, i) => "L" + i);
  assert.deepEqual(plain(count(larger.join("\n"), [...larger].reverse().join("\n"))), {
    added: 633,
    removed: 633,
  });
  const before = Array.from({ length: 500 }, (_, i) => "A" + i);
  const after = Array.from({ length: 800 }, (_, i) => (i === 400 ? "A250" : "B" + i));
  assert.deepEqual(plain(count(before.join("\n"), after.join("\n"))), { added: 799, removed: 499 });
  const shared = larger.join("\n") + "\n";
  assert.deepEqual(plain(count(shared + "old\n" + shared, shared + "new\n" + shared)), {
    added: 1,
    removed: 1,
  });
});
