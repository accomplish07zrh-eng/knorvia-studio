// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  authFailureDiagnostic,
  emitAuthFailureDiagnostic,
} from "./auth-runtime-contract/harness/failure-diagnostic.mjs";
const input = () => ({
  mode: "source",
  id: "A-STO-10",
  timeoutMs: 30000,
  process: { exitCode: 1, signal: null, timedOut: false, overflowed: false },
  summary: { caseAssertion: false, tests: 1, pass: 0, fail: 1, skipped: 0, cancelled: 0 },
  stdout: "",
  stderr: "",
});
test("first-failure fields are explicit and bounded", () => {
  const result = authFailureDiagnostic(input());
  assert.equal(result.mode, "source");
  assert.equal(result.caseId, "A-STO-10");
  assert.equal(result.process.exitCode, 1);
  assert.equal(result.counts.fail, 1);
  assert.equal(result.timeoutMs, 30000);
  assert.equal(result.schemaVersion, 1);
});
for (const [message, marker] of [
  ["workers did not reach barrier: C:/private/name", "worker-readiness-barrier"],
  ["owned worker barrier timed out", "worker-start-barrier"],
  ["Owned test lock timed out: /private/auth.json", "owned-lock-timeout"],
  ["lock remained after decrypt failure", "lock-after-decrypt-failure"],
  ["lock remained after write failure", "lock-after-write-failure"],
])
  test(`controlled marker ${marker}`, () => {
    const f = input();
    f.stdout = message;
    assert.deepEqual(authFailureDiagnostic(f).observedMarkers, [marker]);
  });
test("codes, operator and approved frame coordinates survive without raw messages", () => {
  const f = input();
  f.stderr = "EPERM arbitrary secret\n";
  f.stdout =
    "  failureType: 'testCodeFailure'\n  code: 'ERR_ASSERTION'\n  operator: 'strictEqual'\n at fn (C:\\secret\\store-concurrency.test.mjs:110:14)\n";
  const result = authFailureDiagnostic(f);
  assert.deepEqual(result.observedErrorCodes, ["ERR_ASSERTION", "EPERM"]);
  assert.deepEqual(result.observedFailureTypes, ["testCodeFailure"]);
  assert.deepEqual(result.observedOperators, ["strictEqual"]);
  assert.deepEqual(result.observedFrames, [
    { file: "store-concurrency.test.mjs", line: 110, column: 14 },
  ]);
});
test("worker status projection never forwards captured worker output", () => {
  const f = input();
  f.stdout =
    '# {"workerResult":{"code":1,"signal":null,"stderr":"token=secret","stdout":"private data"}}';
  const r = authFailureDiagnostic(f);
  assert.deepEqual(r.workerStatuses, [{ exitCode: 1, signal: null }]);
  assert.doesNotMatch(JSON.stringify(r), /secret|private|stderr|stdout/);
});
test("credentials, absolute paths and unknown keys never become diagnostic text", () => {
  const f = input();
  Object.assign(f, { secret: "do-not-publish", env: { API_KEY: "credential-value" } });
  f.process.error = "credential-value";
  f.stdout =
    "Bearer top-secret\napiKey=private-key\n/home/person/auth.json\nfile:///C:/Users/person/auth.json\nactual: private-key\n";
  f.stderr = "C:\\Users\\person\\credentials.json";
  assert.doesNotMatch(
    JSON.stringify(authFailureDiagnostic(f)),
    /top-secret|private-key|credential-value|person|auth.json|do-not-publish/,
  );
});
test("malformed identity/status/count values cannot leak arbitrary strings", () => {
  const f = input();
  f.mode = "secret";
  f.id = "../../secret";
  f.timeoutMs = Infinity;
  f.process.exitCode = "secret";
  f.process.signal = "secret";
  f.summary.tests = "secret";
  const r = authFailureDiagnostic(f);
  assert.equal(r.mode, "unknown");
  assert.equal(r.caseId, "unknown");
  assert.equal(r.process.exitCode, null);
  assert.equal(r.process.signal, "unknown");
  assert.equal(r.counts.tests, null);
  assert.doesNotMatch(JSON.stringify(r), /secret/);
});
test("huge input and repeated frames keep bounded output and explicit scan truncation", () => {
  const f = input();
  f.stdout = "store-worker.mjs:7:2 ERR_ASSERTION private-key\n".repeat(100000);
  const r = authFailureDiagnostic(f);
  assert.equal(r.scanTruncated, true);
  assert.ok(JSON.stringify(r).length < 4096);
  assert.equal(r.observedFrames.length, 1);
  assert.doesNotMatch(JSON.stringify(r), /private-key/);
});
test("emission is one prefixed safe line", () => {
  const lines = [];
  assert.equal(
    emitAuthFailureDiagnostic(input(), (line) => lines.push(line)),
    true,
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^KNORVIA_AUTH_FIRST_FAILURE \{/);
  assert.ok(lines[0].endsWith("\n"));
});
test("writer failure cannot hide the existing assertion", () => {
  assert.throws(() => {
    assert.equal(
      emitAuthFailureDiagnostic(input(), () => {
        throw Error("writer failed");
      }),
      false,
    );
    assert.equal(1, 0, "original auth assertion");
  }, /original auth assertion/);
});
