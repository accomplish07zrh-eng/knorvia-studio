// Minimal synthetic data-boundary checks; runtime dependency ports are virtual.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

// 根统一入口没有 positional root；显式历史输入仍优先，默认核对本包当前源码。
const root = process.argv[2] ?? fileURLToPath(new URL("../src/", import.meta.url));
assert.ok(root, "Supply the baseline or candidate source root.");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ports = {
  "./core.js":
    "export const PROTOCOL_V4_LIMITS={maxFrameBytes:1048576,logicalFrameAssemblyMaxBytes:16777216,logicalFrameAssemblyMaxFragments:1024,logicalFrameAssemblyMaxConcurrent:32,logicalFrameAssemblyMaxStagedBytes:33554432,logicalFrameAssemblyTimeoutMs:30000};",
  "./wire-binary.js":
    'export const crc32WireBytes=()=> "12345678";export const decodeWireBase64=(s)=>s==="!"?null:new Uint8Array(Buffer.from(s,"base64"));',
  "./wire-codec.js":
    "export const measureTopicNotificationEnvelopeBytes=(wire)=>({maxBytes:new TextEncoder().encode(JSON.stringify(wire)).byteLength});",
  "./workflow-artifacts.js":
    "export const WORKFLOW_ARTIFACT_LIMITS={maxIdLength:64,maxTitleLength:120,maxVersions:16};",
  "./conversation-message-projection-policy.js":
    'export const getConversationMessageProjectionPolicy=(m)=>m.info.fixturePolicy??(m.info.source==="goal-continuation"?"providerContextOnly":m.info.role==="assistant"?"visibleAssistant":"realUserInput");',
  "./protocol-legacy-types.js":
    'export const textFromKnorviaMessageParts=(parts)=>parts.filter(p=>p.type==="text").map(p=>p.text).join("");',
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
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Buffer,
    Date: { now: () => 0 },
  });
  return module.exports;
}

test("wire assembly admits owned recovery after expiry and rejects stale/conflicting or invalid payloads", async () => {
  const { TopicWireFrameAssembler } = await load("protocol-v4/wire-assembler");
  const schema = {
    safeParse: (value) =>
      value.accepted === true ? { success: true, data: value } : { success: false },
  };
  const owner = new TopicWireFrameAssembler(schema, {
    timeoutMs: 10,
    maxAssemblyBytes: 1024,
    maxStagedDecodedBytes: 1024,
  });
  const frame = { topic: "fixture-topic", subscriptionId: "fixture-sub", accepted: true };
  const bytes = new TextEncoder().encode(JSON.stringify(frame));
  const split = Math.floor(bytes.length / 2);
  const fragment = (ordinal, index, deliveryKind = "online") => ({
    wireVersion: 3,
    kind: "fragment",
    deliveryKind,
    logicalFrameId: "fixture-" + ordinal,
    logicalFrameOrdinal: ordinal,
    topic: frame.topic,
    subscriptionId: frame.subscriptionId,
    fragmentIndex: index,
    fragmentCount: 2,
    logicalBytes: bytes.length,
    checksum: { algorithm: "crc32", value: "12345678" },
    dataBase64: Buffer.from(index === 0 ? bytes.slice(0, split) : bytes.slice(split)).toString(
      "base64",
    ),
  });
  assert.deepEqual(plain(owner.accept(fragment(1, 0), 0)), []);
  assert.equal(owner.nextExpiryAt, 10);
  assert.deepEqual(plain(owner.accept(fragment(2, 0, "recovery"), 10)), []);
  const recovered = owner.accept(fragment(2, 1, "recovery"), 11);
  assert.deepEqual(plain(recovered), [{ kind: "complete", frame, deliveryKind: "recovery" }]);
  assert.deepEqual(plain(owner.getStats()), { assemblies: 0, stagedDecodedBytes: 0 });
  assert.deepEqual(
    plain(owner.accept({ ...fragment(1, 0), dataBase64: "!", deliveryKind: undefined }, 12)),
    [],
  );
  assert.equal(
    owner.accept({ ...fragment(2, 0), logicalFrameId: "conflict" }, 12)[0].fault.reasonCode,
    "proto.frameAssemblyOrdinalConflict",
  );
  const invalid = {
    wireVersion: 3,
    kind: "complete",
    deliveryKind: "online",
    logicalFrameId: "invalid",
    logicalFrameOrdinal: 3,
    topic: frame.topic,
    subscriptionId: frame.subscriptionId,
    frame: { ...frame, accepted: false },
  };
  assert.equal(owner.accept(invalid, 12)[0].fault.reasonCode, "proto.frameAssemblyInvalidPayload");
  owner.discard(frame.topic, frame.subscriptionId);
  assert.equal(owner.accept({ ...invalid, frame }, 12)[0].kind, "complete");
  assert.throws(() => new TopicWireFrameAssembler(schema, { timeoutMs: 0 }), {
    message: "timeoutMs must be a positive finite number",
  });
});

test("artifact data boundary admits bounded summaries and same-id updates while excluding invalid/private payload fields", async () => {
  const api = await load("protocol-v4/workflow-runs-artifacts");
  assert.equal(
    api.workflowArtifactSummary({ id: "fixture", kind: "unknown", version: 1 }),
    undefined,
  );
  assert.equal(api.workflowArtifactSummary({ id: "fixture", kind: "file", version: 0 }), undefined);
  const summary = api.workflowArtifactSummary({
    id: "fixture",
    kind: "board",
    version: 99,
    uri: "synthetic-private",
    spec: { fixture: true },
    title: "title",
    primary: true,
  });
  assert.deepEqual(plain(summary), {
    id: "fixture",
    kind: "board",
    title: "title",
    version: 16,
    primary: true,
  });
  const updated = api.upsertBoundedByArtifactId(
    [{ ...summary, itemCount: 0 }],
    { ...summary, version: 2 },
    1,
  );
  assert.equal(updated.list[0].itemCount, 0);
  assert.equal(updated.truncated, false);
  assert.equal(
    api.upsertBoundedByArtifactId(updated.list, { ...summary, id: "other" }, 1).truncated,
    true,
  );
  assert.equal(api.countTaggedReport(updated.list, "missing"), undefined);
  assert.equal(api.countTaggedReport(updated.list, "fixture")[0].itemCount, 1);
});

test("message policy admits visible assistant/user data and excludes model-only/synthetic carriers from visible input", async () => {
  const api = await load("conversation-message-projection-policy");
  const visible = {
    info: {
      role: "assistant",
      semantics: {
        kind: "assistant_response",
        uiVisibility: "visible",
        transcriptVisibility: "visible",
        providerVisibility: "visible",
      },
    },
  };
  assert.equal(api.getConversationMessageProjectionPolicy(visible), "visibleAssistant");
  const hidden = {
    info: { role: "user", synthetic: true },
    parts: [{ type: "text", text: "<task-notification>synthetic" }],
  };
  assert.equal(api.isConversationRealUserTurnStarter(hidden), false);
  assert.equal(api.getConversationModelOnlyTurnTriggerSource(hidden), "background_task");
  assert.equal(
    api.getConversationMessageProjectionPolicy({ info: { role: "user", summary: null } }),
    "providerContextOnly",
  );
  assert.equal(
    api.getConversationMessageProjectionPolicy({
      info: { role: "user", synthetic: true },
      parts: [{ type: "text", ignored: true, text: "<task-notification>synthetic" }],
    }),
    "hiddenSynthetic",
  );
  assert.equal(
    api.getConversationModelOnlyTurnTriggerSource({
      info: {
        role: "user",
        visibility: "model-only",
        source: "",
        semantics: { source: "goal-continuation" },
      },
    }),
    null,
  );
  assert.equal(api.isConversationRealUserTurnStarter({ info: { role: "user" } }), true);
  assert.equal(
    api.getConversationMessageProjectionPolicy({
      info: { role: "user" },
      parts: [
        { type: "text", text: "synthetic visible input", summaryMessageId: "fixture-summary" },
      ],
    }),
    "realUserInput",
  );
});

test("session snapshot projection preserves visible identities and goal boundaries without inheriting stopped-goal iterations", async () => {
  const api = await load("session-visible-content");
  const message = (messageId, role, created, text, source) => ({
    info: { messageId, role, time: { created }, ...(source ? { source } : {}) },
    parts: [{ type: "text", text }],
  });
  const user = message("user", "user", 8, "/goal synthetic");
  const continuation = message("context", "user", 9, "synthetic", "goal-continuation");
  const assistant = message("assistant", "assistant", 11, "admitted");
  const later = message("later", "assistant", 30, "after stop");
  const messages = [later, user, continuation, assistant];
  const visible = api.getKnorviaUserVisibleMessages(messages);
  assert.equal(visible.includes(continuation), false);
  assert.equal(visible[0], later);
  assert.equal(visible[1], user);
  const target = { status: "complete", createdAt: 10, updatedAt: 20, objective: "synthetic" };
  const iterations = api.getKnorviaGoalIterationByAssistantMessageId(messages, {
    target,
    maxGoalIteration: 1,
  });
  assert.equal(iterations.get("assistant"), 1);
  assert.equal(iterations.has("later"), false);
  assert.equal(
    api.getKnorviaGoalActiveIterationCount({
      targetStatus: "paused",
      timeline: [{ status: "cancelled", goalIteration: 1 }],
    }),
    1,
  );
  assert.equal(
    api.getKnorviaGoalActiveIterationCount({
      targetStatus: "active",
      timeline: [{ status: "cancelled", goalIteration: 1 }],
    }),
    2,
  );
  assert.equal(
    api.resolveKnorviaVisibleSessionTitle({
      title: '<system-reminder source="goal-continuation">synthetic',
      messages,
    }),
    "/goal synthetic",
  );
});

test("plan projection admits complete main-agent collections and rejects malformed/child or non-plan data", async () => {
  const api = await load("tool-plan-adapter");
  const input = { todos: ["first", { content: "second", status: "in-progress", id: "stable" }] };
  assert.deepEqual(plain(api.extractPlanStepsFromToolInput({ kind: "TodoWrite", input })), [
    { id: "first", title: "first", status: "in_progress" },
    { id: "stable", title: "second", status: "in_progress" },
  ]);
  assert.equal(api.extractPlanStepsFromToolInput({ kind: "Read", input }), null);
  assert.equal(
    api.extractPlanStepsFromToolInput({
      kind: "TodoWrite",
      input: { todos: ["valid", { content: "invalid", status: "unknown" }] },
    }),
    null,
  );
  assert.equal(
    api.extractPlanStepsFromToolInput({
      kind: "TodoWrite",
      input: { todos: [], plan: ["do not fall through"] },
    }),
    null,
  );
  assert.equal(api.isMainAgentToolProjectionSource({ source: "subagent" }), false);
  assert.equal(api.isMainAgentToolProjectionSource({ parentToolCallId: "child-fixture" }), false);
  assert.equal(api.isMainAgentToolProjectionSource({ source: "main" }), true);
  assert.equal(
    api.extractPlanStepsFromToolOutput({
      kind: "UpdatePlan",
      output: { result: JSON.stringify(input) },
    })[1].id,
    "stable",
  );
});
