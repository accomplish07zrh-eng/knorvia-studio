import assert from "node:assert/strict";
import { test } from "node:test";
import type { MessageWithParts } from "@knorvia/contracts";
import { mapMessageWithParts } from "../src/protocol/message-mapper.js";

function message(
  info: Record<string, unknown> = {},
  parts: Record<string, unknown>[] = [],
): MessageWithParts {
  return {
    info: {
      id: "synthetic-message",
      sessionID: "synthetic-session",
      agent: "synthetic-agent",
      role: "user",
      time: { created: 0 },
      ...info,
    },
    parts: parts.map((part) => ({
      id: "synthetic-part",
      messageID: "synthetic-message",
      sessionID: "synthetic-session",
      ...part,
    })),
  } as unknown as MessageWithParts;
}

const publicPart = (part: Record<string, unknown>) =>
  mapMessageWithParts(message({}, [part])).parts[0]!;
const publicTool = (status: string, metadata?: Record<string, unknown>) => {
  const input = {};
  const part = publicPart({
    type: "tool",
    tool: "synthetic",
    callID: "synthetic-call",
    state: {
      status,
      input,
      metadata,
      raw: "raw",
      title: "title",
      output: "result",
      error: "failure",
      time: { start: 1, end: 2 },
    },
  });
  assert.ok(part.type === "tool");
  return { state: part.state, input };
};

test("malformed legacy tool status never dispatches inherited object properties", () => {
  for (const status of [
    "unknown-status",
    "__proto__",
    "toString",
    "constructor",
    "hasOwnProperty",
  ]) {
    assert.equal(publicTool(status).state, undefined);
  }
});

test("info projects every fixed key and preserves nested user references", () => {
  const model = { providerId: "synthetic", modelId: "synthetic" };
  const metadata = { source: "fixture" };
  const time = { created: 0 };
  const mapped = mapMessageWithParts(message({ modelSelection: model, metadata, time }));
  assert.deepEqual(Object.keys(mapped), ["info", "parts"]);
  assert.deepEqual(Object.keys(mapped.info), [
    "agent",
    "messageId",
    "model",
    "metadata",
    "role",
    "semantics",
    "sessionId",
    "source",
    "system",
    "synthetic",
    "time",
    "tools",
    "visibility",
  ]);
  assert.equal(mapped.info.model, model);
  assert.equal(mapped.info.time, time);
  assert.ok(mapped.info.role === "user");
  assert.equal(mapped.info.metadata, metadata);
  assert.equal(Object.hasOwn(mapped.info, "visibility"), true);
});

test("assistant model/error projection retains truthy gates and ordered fields", () => {
  const data = { owned: true };
  const path = { cwd: "synthetic", root: "synthetic" };
  const info = mapMessageWithParts(
    message({
      role: "assistant",
      providerId: "provider",
      modelId: "model",
      reasoningLevel: "high",
      error: { name: "OwnedError", data },
      path,
    }),
  ).info;
  assert.ok(info.role === "assistant");
  assert.deepEqual(Object.keys(info), [
    "agent",
    "cost",
    "error",
    "finish",
    "messageId",
    "model",
    "parentMessageId",
    "path",
    "role",
    "semantics",
    "sessionId",
    "structured",
    "time",
    "tokens",
  ]);
  assert.deepEqual(info.model, {
    providerId: "provider",
    modelId: "model",
    options: { reasoningLevel: "high" },
  });
  assert.equal(info.error?.data, data);
  assert.equal(info.path, path);
  assert.equal(info.parentMessageId, "undefined");
  const emptyReasoning = mapMessageWithParts(
    message({ role: "assistant", providerId: "provider", modelId: "model", reasoningLevel: "" }),
  ).info;
  assert.deepEqual(emptyReasoning.model, { providerId: "provider", modelId: "model" });
  assert.equal(
    mapMessageWithParts(message({ role: "assistant", providerId: "", modelId: "model" })).info
      .model,
    undefined,
  );
});

test("all thirteen part tags retain identity prefix, order, data and undefined fields", () => {
  const fixtures: Record<string, unknown>[] = [
    { type: "text", text: "text" },
    { type: "reasoning", text: "reasoning" },
    { type: "file", mime: "text/plain", url: "synthetic:artifact" },
    { type: "tool", tool: "synthetic", state: { status: "pending", input: {}, raw: "raw" } },
    { type: "step-start" },
    { type: "step-finish", cost: 0, reason: "end", tokens: {} },
    { type: "snapshot", snapshot: "snapshot" },
    { type: "patch", files: ["synthetic.txt"], hash: "hash" },
    { type: "compaction", auto: false },
    { type: "timeline", timelineType: "context_compaction", display: "worklog" },
    { type: "subtask", agent: "agent", prompt: "prompt", description: "description" },
    { type: "agent", name: "agent" },
    { type: "retry", attempt: 1, error: { name: "OwnedError", data: {} } },
  ];
  const mapped = mapMessageWithParts(message({}, fixtures)).parts;
  assert.deepEqual(
    mapped.map((part) => part.type),
    [
      "text",
      "reasoning",
      "file",
      "tool",
      "step-start",
      "step-finish",
      "snapshot",
      "patch",
      "compaction",
      "timeline",
      "subagent",
      "agent",
      "retry",
    ],
  );
  for (const part of mapped) {
    assert.deepEqual(Object.keys(part).slice(0, 3), ["messageId", "partId", "sessionId"]);
    assert.equal(part.messageId, "synthetic-message");
  }
  assert.deepEqual(Object.keys(mapped[0]), [
    "messageId",
    "partId",
    "sessionId",
    "ignored",
    "metadata",
    "synthetic",
    "text",
    "type",
  ]);
  assert.deepEqual(Object.keys(mapped[2]), [
    "messageId",
    "partId",
    "sessionId",
    "filename",
    "metadata",
    "mime",
    "type",
    "url",
  ]);
  const patch = mapped[7]!;
  assert.ok(patch.type === "patch");
  assert.equal(patch.files, fixtures[7]!.files);
});

test("compaction metadata preserves every key and ordered clock projection", () => {
  const part = publicPart({
    type: "compaction",
    auto: true,
    time: { start: 1, end: 2 },
    preCompactTokenCount: 3,
    postCompactTokenCount: 4,
  });
  assert.ok(part.type === "compaction");
  assert.deepEqual(Object.keys(part.metadata!), [
    "attempt",
    "boundaryId",
    "compactReason",
    "endedAt",
    "maxAttempts",
    "operationId",
    "phase",
    "postCompactTokenCount",
    "preCompactTokenCount",
    "reason",
    "replace",
    "startedAt",
    "summaryMessageId",
    "timelineStatus",
    "truePostCompactTokenCount",
    "trigger",
  ]);
  assert.equal(part.metadata?.startedAt, 1);
  assert.equal(part.metadata?.endedAt, 2);
});

test("timeline gates retain field presence, fork String semantics and nested identity", () => {
  const fromModel = { providerId: "provider", modelId: "old" };
  const toModel = { providerId: "provider", modelId: "new", label: "new" };
  const verification = { passed: true, reason: "owned" };
  const time = { start: 1 };
  for (const timelineType of [
    "context_compaction",
    "goal_verification",
    "session_fork",
    "model_change",
  ]) {
    const part = publicPart({
      type: "timeline",
      timelineType,
      display: "worklog",
      time,
      anchorMessageId: "",
      attempt: 2,
      targetId: "target",
      fromModel,
      toModel,
      verification,
    });
    assert.ok(part.type === "timeline");
    assert.equal(Object.hasOwn(part, "verificationId"), true);
    assert.equal(Object.hasOwn(part, "truePostCompactTokenCount"), true);
    assert.equal(part.anchorMessageId, undefined);
    assert.equal(part.time, time);
    assert.equal(part.attempt, timelineType === "context_compaction" ? 2 : undefined);
    assert.equal(part.targetId, timelineType === "goal_verification" ? "target" : undefined);
    assert.equal(
      part.verification,
      timelineType === "goal_verification" ? verification : undefined,
    );
    assert.equal(part.fromModel, timelineType === "model_change" ? fromModel : undefined);
    assert.equal(part.toModel, timelineType === "model_change" ? toModel : undefined);
    assert.equal(part.parentSessionId, timelineType === "session_fork" ? "undefined" : undefined);
    assert.equal(part.targetMessageId, timelineType === "session_fork" ? "undefined" : undefined);
  }
});

test("tool states remove only their own private recovery fields and keep required metadata", () => {
  const metadata = {
    readFileState: "owned snapshot",
    modelContent: "owned history",
    modelContentLayout: "owned layout",
    visible: "owned public metadata",
  };
  const pending = publicTool("pending", metadata);
  assert.deepEqual(Object.keys(pending.state), ["input", "raw", "status"]);
  assert.equal(pending.state.input, pending.input);
  for (const status of ["running", "completed", "error"] as const) {
    const { state, input } = publicTool(status, metadata);
    assert.equal(state.status, status);
    assert.equal(state.input, input);
    assert.ok("metadata" in state);
    assert.equal(Object.hasOwn(state.metadata!, "readFileState"), false);
    assert.equal(Object.hasOwn(state.metadata!, "modelContent"), status !== "error");
    assert.equal(Object.hasOwn(state.metadata!, "modelContentLayout"), status !== "completed");
  }
  assert.equal(Object.hasOwn(metadata, "readFileState"), true);
  const emptyOne = publicTool("completed").state;
  const emptyTwo = publicTool("completed").state;
  assert.ok("metadata" in emptyOne && "metadata" in emptyTwo);
  assert.deepEqual(emptyOne.metadata, {});
  assert.notEqual(emptyOne.metadata, emptyTwo.metadata);
});

test("metadata with no own private key preserves identity and stripping preserves symbols", () => {
  const inherited = Object.create({ readFileState: "inherited" }) as Record<string, unknown>;
  inherited.visible = true;
  const running = publicTool("running", inherited).state;
  assert.ok(running.status === "running");
  assert.equal(running.metadata, inherited);
  const symbol = Symbol("owned metadata");
  const metadata = { readFileState: "snapshot", [symbol]: "symbol value" };
  const projected = publicTool("running", metadata).state;
  assert.ok(projected.status === "running");
  assert.equal(Object.getOwnPropertyDescriptor(projected.metadata!, symbol)?.value, "symbol value");
  assert.equal(Object.hasOwn(metadata, "readFileState"), true);
  const partMetadata = { providerToolName: "original" };
  const part = publicPart({
    type: "tool",
    tool: "synthetic",
    metadata: partMetadata,
    state: { status: "pending", input: {}, raw: "" },
  });
  assert.ok(part.type === "tool");
  assert.equal(part.metadata, undefined);
  assert.equal(partMetadata.providerToolName, "original");
});

test("all visibility decisions precede any projection and hidden parts never read ids/state", () => {
  const effects: string[] = [];
  const input = message({}, [
    { type: "text", text: "visible" },
    { type: "tool", tool: "" },
  ]);
  Object.defineProperty(input.parts[0]!, "id", {
    get() {
      effects.push("project:text");
      return "text";
    },
  });
  Object.defineProperty(input.parts[1]!, "tool", {
    get() {
      effects.push("select:tool");
      return " ";
    },
  });
  Object.defineProperty(input.parts[1]!, "id", {
    get() {
      throw new Error("hidden id read");
    },
  });
  Object.defineProperty(input.parts[1]!, "state", {
    get() {
      throw new Error("hidden state read");
    },
  });
  assert.equal(mapMessageWithParts(input).parts.length, 1);
  assert.deepEqual(effects, ["select:tool", "project:text"]);
  const legal = publicPart({
    type: "tool",
    tool: "empty_tool_name",
    state: { status: "pending", input: {}, raw: "" },
  });
  assert.equal(legal.type, "tool");
  const hidden = message({}, [
    { type: "tool", tool: "empty_tool_name", metadata: { providerToolName: "" } },
  ]);
  assert.deepEqual(mapMessageWithParts(hidden).parts, []);
});
