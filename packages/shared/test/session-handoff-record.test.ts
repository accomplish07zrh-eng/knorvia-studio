import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyHandoffRecord,
  handoffScopeKey,
  parseHandoffRecord,
  parseHandoffRecords,
} from "../src/sessionHandoff.js";

test("unknown persisted scope fields cannot carry raw credentials into task notes", () => {
  const scope = { sessionId: "session", kernelId: "codex", workspacePath: "C:/project" };
  const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
  const record = { ...emptyHandoffRecord(scope), scope: { ...scope, credential: secret } };
  const parsed = parseHandoffRecord(record);
  assert.deepEqual(parsed?.scope, scope);
  const restored = parseHandoffRecords({ [handoffScopeKey(scope)]: record });
  assert.equal(JSON.stringify(restored).includes(secret), false);
});

test("bounded legacy native IDs remain valid JSON tuple keys without prototype pollution", () => {
  const scope = {
    sessionId: "legacy:native/session",
    kernelId: "knorvia",
    workspacePath: "/project",
  };
  const record = parseHandoffRecord(emptyHandoffRecord(scope));
  assert.equal(record?.scope.sessionId, scope.sessionId);
  assert.equal(Object.keys(parseHandoffRecords({ [handoffScopeKey(scope)]: record })).length, 1);
  assert.equal(parseHandoffRecord(emptyHandoffRecord({ ...scope, sessionId: "bad\nID" })), null);
});
