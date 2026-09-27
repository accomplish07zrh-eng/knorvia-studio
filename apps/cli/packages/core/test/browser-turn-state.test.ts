// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { SessionId, TurnId } from "@knorvia/contracts";
import {
  recordBrowserTurnToolResult,
  consumeBrowserTurnState,
  clearBrowserTurnState,
} from "../src/repl/browser-turn-state.js";

const session = (value: string) => value as SessionId;
const turn = (value: string) => value as TurnId;
const candidate = (id = "browser-fixture", generation = 3) => ({
  browserGeneration: generation,
  browserId: id,
});
const output = (id = "browser-fixture", generation = 3) => ({
  _meta: { "knorvia/browserTurnScreenshot": candidate(id, generation) },
});
function record(id: string, t: string, toolName: string, value: unknown) {
  recordBrowserTurnToolResult({ sessionId: session(id), turnId: turn(t), toolName, output: value });
}
const consume = (id: string, t: string) => consumeBrowserTurnState(session(id), turn(t));
const clear = (id: string, t: string) => clearBrowserTurnState(session(id), turn(t));

test("both supported REPL surfaces record a hint which is consumed exactly once", () => {
  for (const toolName of ["js", "mcp__node_repl__js"]) {
    record("surfaces", toolName, toolName, output());
    assert.deepEqual(consume("surfaces", toolName), { candidate: candidate() });
    assert.equal(consume("surfaces", toolName), undefined);
  }
});
test("other tools cannot record hints and legacy responseMeta obeys _meta precedence", () => {
  for (const toolName of ["read", "mcp__custom__js", "node_repl.js"]) {
    record("other", "t", toolName, output());
    assert.equal(consume("other", "t"), undefined);
  }
  record("meta", "t", "js", { responseMeta: output()._meta });
  assert.deepEqual(consume("meta", "t"), { candidate: candidate() });
  record("meta", "t", "js", { _meta: {}, responseMeta: output()._meta });
  assert.equal(consume("meta", "t"), undefined);
});
test("a new valid hint wins while malformed and unrelated output leave the current hint intact", () => {
  record("retain", "t", "js", output("first"));
  for (const value of [
    undefined,
    null,
    {},
    { _meta: { "knorvia/browserTurnScreenshot": null } },
    output("fraction", 1.5),
    output("infinite", Infinity),
  ]) {
    record("retain", "t", "js", value);
  }
  assert.deepEqual(consume("retain", "t"), { candidate: candidate("first") });
  record("retain", "t", "js", output("first"));
  record("retain", "t", "js", output("latest", 0));
  assert.deepEqual(consume("retain", "t"), { candidate: candidate("latest", 0) });
});
test("clear is idempotent and preserves other sessions and turns", () => {
  record("clear-a", "one", "js", output("one"));
  record("clear-a", "two", "js", output("two"));
  record("clear-b", "one", "js", output("other"));
  clear("clear-a", "one");
  clear("clear-a", "one");
  assert.equal(consume("clear-a", "one"), undefined);
  assert.deepEqual(consume("clear-a", "two"), { candidate: candidate("two") });
  assert.deepEqual(consume("clear-b", "one"), { candidate: candidate("other") });
});
test("session and turn identifiers containing delimiters remain distinct", () => {
  try {
    record("one:two", "three", "js", output("correct"));
    assert.equal(consume("one", "two:three"), undefined);
    assert.deepEqual(consume("one:two", "three"), { candidate: candidate("correct") });
  } finally {
    clear("one:two", "three");
    clear("one", "two:three");
  }
});
