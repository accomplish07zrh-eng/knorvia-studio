import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConversationRow,
  V4ConversationRowsRangeParams,
  V4ConversationRowsRangeResult,
} from "@knorvia/shared/protocol-v4";
import {
  exportNativeConversationMarkdown,
  nativeVisibleMessages,
} from "../src/v4/nativeSessionHandoff.js";

const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
const base = (rowId: number) => ({
  rowId,
  turnId: "turn",
  createdAt: rowId * 1000,
  createdAtSeq: rowId,
});
const user = (rowId: number): ConversationRow => ({
  ...base(rowId),
  kind: "userInput",
  origin: "realUser",
  text: `Check ${secret}\n[hidden epilogue]`,
  epilogueStart: `Check ${secret}`.length,
});
const tool = (rowId: number): ConversationRow => ({
  ...base(rowId),
  kind: "toolCall",
  toolCallId: "tool",
  toolName: "read_file",
  status: "success",
  inputText: `private input ${secret}`,
  output: { kind: "text", text: `private output ${secret}` } as never,
});
const assistant = (rowId: number): ConversationRow => ({
  ...base(rowId),
  kind: "assistantText",
  state: "complete",
  text: "Done",
});
const snapshot = { logEpoch: "epoch", rows: { window: [assistant(4)] } };
function result(
  rows: ConversationRow[],
  hasMore: boolean,
  atRevision = 2,
): V4ConversationRowsRangeResult {
  return { rows, hasMore, atSeq: 4, atRevision, atLogEpoch: "epoch" };
}

test("native source keeps real user text and visible tool metadata only", () => {
  const hidden = { ...user(2), origin: "synthetic" as const };
  const messages = nativeVisibleMessages([user(1), hidden, tool(3), assistant(4)], "session");
  assert.deepEqual(
    messages.map((item) => item.kind),
    ["text", "tool", "text"],
  );
  assert.equal(messages[0]?.text.includes("hidden epilogue"), false);
  assert.equal(messages[1]?.text, "");
  assert.equal(messages[1]?.name, "read_file");
});

test("native Markdown export reads the full branch and omits hidden payloads and credentials", async () => {
  const calls: number[] = [];
  const range = async (params: V4ConversationRowsRangeParams) => {
    calls.push(params.beforeRowId ?? 0);
    return params.beforeRowId === 5
      ? result([tool(3), assistant(4)], true)
      : result([user(1), { ...user(2), origin: "synthetic" }], false);
  };
  const markdown = await exportNativeConversationMarkdown(range, "session", snapshot, "Review");
  assert.deepEqual(calls, [5, 3]);
  assert.ok(markdown.indexOf("Check") < markdown.indexOf("read_file"));
  assert.ok(markdown.indexOf("read_file") < markdown.indexOf("Done"));
  assert.equal(markdown.includes(secret), false);
  assert.equal(markdown.includes("private input"), false);
  assert.equal(markdown.includes("private output"), false);
  assert.equal(markdown.includes("hidden epilogue"), false);
});

test("native export rejects changing history and stalled pages", async () => {
  const changing = async (params: V4ConversationRowsRangeParams) =>
    params.beforeRowId === 5 ? result([assistant(4)], true) : result([user(1)], false, 3);
  await assert.rejects(
    exportNativeConversationMarkdown(changing, "session", snapshot, "Review"),
    /发生变化/,
  );
  const stalled = async () => result([], true);
  await assert.rejects(
    exportNativeConversationMarkdown(stalled, "session", snapshot, "Review"),
    /分页/,
  );
});
