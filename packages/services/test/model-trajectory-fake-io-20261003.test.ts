import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

test("synthetic directory/tail/logger ports preserve trajectory admission, sorted delta replay, projections and limits", async (t) => {
  const taskId = "synthetic-task";
  let dirs = ["synthetic/unreadable", "synthetic/debug", "synthetic/rollout"];
  const names = new Map<string, string[]>([
    ["synthetic/debug", ["other", "model-io-safe-task.jsonl"]],
    ["synthetic/rollout", ["model-io-safe-task.jsonl"]],
  ]);
  const tails = new Map<string, { text: string; bytesRead: number; truncated: boolean }>();
  const reads: string[] = [],
    calls: string[] = [];
  const logs: unknown[][] = [];
  let clock = 0;
  let readError: unknown;
  let debugFailure: unknown;
  let failLog = false;
  function put(dir: string, records: unknown[], truncated = false) {
    const text = records
      .map((record) => (typeof record === "string" ? record : JSON.stringify(record)))
      .join("\n");
    tails.set(join(dir, "model-io-safe-task.jsonl"), { text, bytesRead: text.length, truncated });
  }
  t.mock.module("node:fs/promises", {
    namedExports: {
      async readdir(dir: string) {
        calls.push(`dir:${dir}`);
        const result = names.get(dir);
        if (!result) throw new Error("synthetic missing dir");
        return result;
      },
    },
  });
  t.mock.module(new URL("../src/agent/modelTrajectoryFileTail.ts", import.meta.url).href, {
    namedExports: {
      sanitizeSessionSegment(value: string) {
        calls.push("sanitize");
        assert.equal(value, taskId);
        return "safe-task";
      },
      resolveModelIODirs() {
        calls.push("dirs");
        return dirs;
      },
      async readTrajectoryFileTail(path: string) {
        reads.push(path);
        if (readError) throw readError;
        const result = tails.get(path);
        if (!result) throw new Error("synthetic missing tail");
        return result;
      },
    },
  });
  t.mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
    namedExports: {
      createServiceLogger(scope: string) {
        assert.equal(scope, "model-trajectory");
        return {
          debug(...args: unknown[]) {
            logs.push(args);
            if (debugFailure && (!failLog || String(args[1]).startsWith("read failed")))
              throw debugFailure;
          },
        };
      },
    },
  });
  t.mock.method(Date, "now", () => ++clock);
  const { readModelTrajectory: read } = await import("../src/agent/modelTrajectory.js");
  const base = {
    type: "model_io",
    sessionId: taskId,
    requestId: "a",
    startedAt: "2026-01-01T00:00:01Z",
    querySource: "main_turn",
    model: { role: "compact", modelId: "synthetic-model" },
    request: {
      messages: [
        { role: "system", content: "base" },
        { role: "user", content: "old" },
      ],
      sdkMessages: ["synthetic-sdk"],
      body: { messages: ["synthetic-body"] },
      toolNames: ["tool", 3, ""],
    },
  };
  const delta = {
    type: "model_io",
    sessionId: taskId,
    requestId: "b",
    startedAt: "2026-01-01T00:00:02Z",
    attempt: 0,
    querySource: "subagent",
    request: {
      messagesKind: "delta",
      messageOffset: 1,
      messages: [
        {
          role: "tool",
          tool_call_id: "call",
          name: "synthetic-tool",
          is_error: true,
          content: "failure",
        },
      ],
      sdkMessagesKind: "delta",
      sdkMessageOffset: 0,
      sdkMessages: ["next-sdk"],
      bodyMessagesKind: "delta",
      bodyMessageOffset: 1,
      body: { messages: ["next-body"] },
    },
    response: {
      toolCalls: [{ id: "id", name: "", input: false }, 4],
      usage: { inputTokens: 0, outputTokens: "9", totalTokens: 3 },
      text: "synthetic-response",
    },
  };
  const tail = {
    type: "model_io",
    sessionId: taskId,
    requestId: "c",
    startedAt: "2026-01-01T00:00:03Z",
    model: { role: "compact" },
    request: {
      messagesKind: "tail",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "tail" },
            { type: "file", mediaType: "synthetic/type" },
            { type: "tool-call", input: null, args: 0 },
          ],
        },
      ],
    },
    error: { name: "SyntheticError", message: "" },
  };
  const afterTail = {
    type: "model_io",
    sessionId: taskId,
    requestId: "d",
    startedAt: "2026-01-01T00:00:04Z",
    request: {
      messagesKind: "delta",
      messageOffset: 99,
      messages: [
        { role: "tool", tool_use_id: "result", toolName: "T", content: '{"synthetic":true}' },
      ],
    },
  };
  put("synthetic/debug", ["invalid", " ", { ...base, sessionId: "other" }, delta, afterTail]);
  put("synthetic/rollout", [base, tail]);
  const result = await read(taskId);
  assert.deepEqual(calls.slice(0, 2), ["sanitize", "dirs"]);
  assert.deepEqual(reads, [
    join("synthetic/debug", "model-io-safe-task.jsonl"),
    join("synthetic/rollout", "model-io-safe-task.jsonl"),
  ]);
  assert.deepEqual(result.sourceFiles, reads);
  assert.equal(result.available, true);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.records.map((record) => record.requestId),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(result.records[0]!.callSource, { kind: "main", querySource: "main_turn" });
  assert.deepEqual(result.records[0]!.request.toolNames, ["tool", ""]);
  assert.equal(result.records[1]!.attempt, 0);
  assert.equal(result.records[1]!.request.messages.length, 2);
  assert.deepEqual(result.records[1]!.request.messages[1]!.parts, [
    {
      kind: "tool-result",
      toolCallId: "call",
      toolName: "synthetic-tool",
      output: { type: "error-text", value: "failure" },
    },
  ]);
  assert.deepEqual(result.records[1]!.response!.toolCalls, [
    { kind: "tool-call", toolCallId: "id", toolName: "", input: false },
    { kind: "unknown", raw: 4 },
  ]);
  assert.deepEqual(result.records[1]!.response!.usage, {
    inputTokens: 0,
    outputTokens: undefined,
    totalTokens: 3,
    cacheReadTokens: undefined,
    reasoningTokens: undefined,
  });
  assert.equal(result.records[2]!.request.messages.length, 1);
  assert.deepEqual(result.records[2]!.callSource, { kind: "compact", querySource: undefined });
  assert.deepEqual(result.records[2]!.request.messages[0]!.parts, [
    { kind: "text", text: "tail" },
    { kind: "image", mediaType: "synthetic/type" },
    { kind: "tool-call", toolCallId: undefined, toolName: "tool", input: 0 },
  ]);
  assert.deepEqual(result.records[2]!.error, {
    name: "SyntheticError",
    message: "",
    stack: undefined,
  });
  assert.equal(result.records[3]!.request.messages.length, 2);
  assert.deepEqual(result.records[3]!.request.messages[1]!.parts, [
    { kind: "tool-result", toolCallId: "result", toolName: "T", output: { synthetic: true } },
  ]);
  assert.equal((await read(taskId, 2)).records[0]!.requestId, "c");
  assert.deepEqual((await read(taskId, 0.5)).records, []);
  assert.equal((await read(taskId, Number.NaN)).records.length, 4);
  assert.equal((await read(taskId, -1)).records.length, 4);
  assert.deepEqual(base.request.messages[1], { role: "user", content: "old" });

  dirs = ["synthetic/debug"];
  const title = {
    ...base,
    requestId: "z",
    startedAt: "invalid",
    querySource: undefined,
    request: {
      messages: [
        { role: "system", content: "Generate a concise title for this coding session. extra" },
      ],
    },
  };
  const emptyQuery = {
    ...base,
    requestId: "a",
    startedAt: "",
    querySource: "",
    model: { role: "subagent" },
    request: title.request,
  };
  put("synthetic/debug", [title, emptyQuery]);
  const tied = await read(taskId);
  assert.deepEqual(
    tied.records.map((record) => record.requestId),
    ["a", "z"],
  );
  assert.deepEqual(tied.records[0]!.callSource, { kind: "subagent" });
  assert.deepEqual(tied.records[1]!.callSource, { kind: "compact", querySource: "session_title" });
  put("synthetic/debug", [{ ...base, sessionId: "other" }], true);
  const truncated = await read(taskId);
  assert.equal(truncated.truncated, true);
  assert.deepEqual(truncated.records, []);
  assert.deepEqual(truncated.sourceFiles, []);
  put("synthetic/debug", ["null"]);
  await assert.rejects(read(taskId), TypeError);
  put("synthetic/debug", [base]);
  readError = new Error("synthetic tail failure");
  assert.deepEqual((await read(taskId)).sourceFiles, []);
  assert.equal(logs.at(-1)![2], readError);
  readError = undefined;
  debugFailure = new Error("synthetic log failure");
  failLog = false;
  await assert.rejects(read(taskId), (error) => error === debugFailure);
  debugFailure = undefined;
  failLog = true;
  dirs = ["synthetic/unreadable"];
  assert.deepEqual((await read(taskId)).records, []);
});
