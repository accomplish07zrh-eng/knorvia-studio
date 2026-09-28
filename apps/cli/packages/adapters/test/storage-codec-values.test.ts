// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_TASK_TYPES, SESSION_TITLE_SOURCES, type MessagePart } from "@knorvia/contracts";
import { encodeJson, decodeJson } from "../src/storage/session-store/json.js";
import {
  decodeSessionRow,
  decodeTodoRow,
  isCollaborationMode,
  partCreatedAt,
} from "../src/storage/session-store/codecs.js";
import { fullAccessPayload } from "../src/storage/session-store/repositories/permission-full-access-payload.js";
import { sessionRow } from "./storage-codec-fixture.js";

test("JSON cells distinguish SQL absence, empty text and JSON null", () => {
  for (const absent of [null, undefined]) assert.equal(encodeJson(absent), null);
  assert.equal(decodeJson(null), undefined);
  assert.equal(decodeJson(""), undefined);
  assert.equal(decodeJson("null"), null);
  for (const value of [false, 0, "", [null], { a: 0 }])
    assert.deepEqual(decodeJson(encodeJson(value)!), value);
  assert.throws(() => decodeJson("  "), SyntaxError);
  assert.throws(() => decodeJson("{"), SyntaxError);
});

test("legacy untyped falsy optional cells remain absent", () => {
  for (const value of [undefined, false, 0, Number.NaN])
    assert.equal(decodeJson(value as unknown as string), undefined);
});

test("JSON cells retain native nonrepresentable roots and exception identity", () => {
  assert.equal(
    encodeJson(() => 1),
    undefined,
  );
  assert.equal(encodeJson(Symbol("fixture")), undefined);
  assert.throws(() => encodeJson(1n), TypeError);
  const cyclic: unknown[] = [];
  cyclic.push(cyclic);
  assert.throws(() => encodeJson(cyclic), TypeError);
  const reason = new Error("fixture toJSON failure");
  assert.throws(
    () =>
      encodeJson({
        toJSON() {
          throw reason;
        },
      }),
    (error) => error === reason,
  );
  assert.equal(encodeJson({ toJSON: () => null }), "null");
  assert.equal(encodeJson({ toJSON: () => undefined }), undefined);
});

test("session projection owns absent fields and keeps its fixed output order", () => {
  const row = sessionRow();
  const result = decodeSessionRow(row);
  assert.deepEqual(Object.keys(result), [
    "id",
    "projectID",
    "workspaceID",
    "parentID",
    "traceID",
    "taskType",
    "slug",
    "directory",
    "path",
    "title",
    "titleSource",
    "titleMessageID",
    "version",
    "shareURL",
    "summaryAdditions",
    "summaryDeletions",
    "summaryFiles",
    "summaryDiffs",
    "revert",
    "permission",
    "time",
  ]);
  for (const key of ["workspaceID", "path", "summaryDiffs", "permission"] as const) {
    assert.equal(Object.hasOwn(result, key), true);
    assert.equal(result[key], undefined);
  }
  assert.deepEqual(result.time, {
    created: 0,
    updated: 12,
    titleUpdated: undefined,
    compacting: undefined,
    archived: undefined,
  });
  assert.deepEqual(row, sessionRow());
});

test("session projection distinguishes truthy identity from empty and zero values", () => {
  const result = decodeSessionRow(
    sessionRow({
      workspace_id: "",
      parent_id: "",
      trace_id: "",
      title_message_id: "",
      path: "",
      share_url: "",
      summary_additions: 0,
      summary_deletions: 0,
      summary_files: 0,
      time_title_updated: 0,
      time_compacting: 0,
      time_archived: 0,
      summary_diffs: "[]",
      revert: "null",
      permission: "{}",
    }),
  );
  assert.equal(result.workspaceID, undefined);
  assert.equal(result.parentID, undefined);
  assert.equal(result.traceID, undefined);
  assert.equal(result.titleMessageID, undefined);
  assert.equal(result.path, "");
  assert.equal(result.shareURL, "");
  assert.equal(result.summaryAdditions, 0);
  assert.equal(result.summaryDeletions, 0);
  assert.equal(result.summaryFiles, 0);
  assert.equal(result.time.archived, 0);
  assert.equal(result.time.titleUpdated, 0);
  assert.equal(result.time.compacting, 0);
  assert.deepEqual(result.summaryDiffs, []);
  assert.equal(result.revert, null);
  assert.deepEqual(result.permission, {});
});

test("session enums retain known values and default unknown values without validating other columns", () => {
  for (const task_type of [...SESSION_TASK_TYPES, "future"])
    for (const title_source of [...SESSION_TITLE_SOURCES, "future"])
      assert.deepEqual(
        [
          decodeSessionRow(sessionRow({ task_type, title_source })).taskType,
          decodeSessionRow(sessionRow({ task_type, title_source })).titleSource,
        ],
        [
          task_type === "future" ? "interactive" : task_type,
          title_source === "future" ? "first_input" : title_source,
        ],
      );
  const row = Object.assign(sessionRow(), { extra: "discarded" });
  assert.equal(Object.hasOwn(decodeSessionRow(row), "extra"), false);
  assert.throws(() => decodeSessionRow(sessionRow({ summary_diffs: "{" })), SyntaxError);
});

test("todo and collaboration modes retain their distinct validation policies", () => {
  assert.deepEqual(
    decodeTodoRow({
      session_id: "s",
      content: "todo",
      status: "future",
      priority: "future",
      position: 0,
      time_created: 0,
      time_updated: 1,
    }),
    { content: "todo", status: "future", priority: "future" },
  );
  for (const value of ["plan", "build", "edit", "yolo", "auto"])
    assert.equal(isCollaborationMode(value), true);
  for (const value of ["PLAN", "unknown", null, false, {}, ["plan"]])
    assert.equal(isCollaborationMode(value), false);
});

test("part timestamps keep nullish fallback and strict state-owned timestamps", () => {
  const at = (value: unknown) => partCreatedAt(value as MessagePart, 91);
  for (const type of ["text", "reasoning", "compaction", "timeline"]) {
    assert.equal(at({ type }), 91);
    assert.equal(at({ type, time: { start: 0 } }), 0);
    assert.equal(at({ type, time: { start: null } }), 91);
  }
  for (const status of ["running", "completed", "error"]) {
    assert.equal(at({ type: "tool", state: { status, time: { start: 0 } } }), 0);
    assert.equal(at({ type: "tool", state: { status, time: {} } }), undefined);
    assert.throws(() => at({ type: "tool", state: { status } }), TypeError);
  }
  assert.equal(at({ type: "tool", state: { status: "pending" } }), 91);
  assert.equal(at({ type: "retry", time: { created: 0 } }), 0);
  assert.throws(() => at({ type: "retry" }), TypeError);
  assert.equal(at({ type: "future", time: { start: 0 } }), 91);
});

test("full access retains non-object intents and changes only existing record intents", () => {
  for (const value of [undefined, null, false, 0, "", [], [1]]) {
    const input = { extra: 2, intent: value, conversationInputIntent: { other: true } };
    const result = fullAccessPayload(JSON.stringify(input));
    assert.deepEqual(
      result,
      JSON.parse(
        JSON.stringify({ ...input, conversationInputIntent: { other: true, mode: "yolo" } }),
      ),
    );
  }
  assert.deepEqual(fullAccessPayload("{}"), {});
  for (const value of [[], true, 0, "text"])
    assert.deepEqual(fullAccessPayload(JSON.stringify(value)), value);
  assert.throws(() => fullAccessPayload("null"), TypeError);
  assert.throws(() => fullAccessPayload("{"), SyntaxError);
});

test("full access preserves property order and treats __proto__ as ordinary data", () => {
  const result = fullAccessPayload(
    '{"__proto__":{"safe":true},"intent":{"mode":"build","__proto__":{"safe":true},"x":1},"conversationInputIntent":{"x":1}}',
  );
  const intent = result.intent as Record<string, unknown>;
  assert.deepEqual(Object.keys(result), ["__proto__", "intent", "conversationInputIntent"]);
  assert.deepEqual(Object.keys(intent), ["mode", "__proto__", "x"]);
  assert.deepEqual(Object.keys(result.conversationInputIntent as object), ["x", "mode"]);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.getPrototypeOf(intent), Object.prototype);
  assert.equal(Object.hasOwn(intent, "__proto__"), true);
  assert.equal(intent.mode, "yolo");
});
