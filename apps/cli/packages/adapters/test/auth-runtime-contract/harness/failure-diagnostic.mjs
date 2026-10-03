// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

const MAX_SCAN_CHARS = 2 * 1024 * 1024;
const MAX_FRAMES = 12;
const CODES = [
  "ERR_ASSERTION",
  "EPERM",
  "EACCES",
  "ENOENT",
  "EEXIST",
  "EBUSY",
  "ENOTEMPTY",
  "ELOCKED",
  "ETIMEDOUT",
  "ERR_TEST_FAILURE",
  "ERR_TEST_TIMEOUT",
];
const MARKERS = [
  ["worker-readiness-barrier", "workers did not reach barrier"],
  ["worker-start-barrier", "owned worker barrier timed out"],
  ["owned-lock-timeout", "Owned test lock timed out"],
  ["lock-after-decrypt-failure", "lock remained after decrypt failure"],
  ["lock-after-write-failure", "lock remained after write failure"],
];
const FRAMES = [
  "store-concurrency.test.mjs",
  "store-worker.mjs",
  "shared-persistence-port.mjs",
  "checked-child.mjs",
  "run-group.mjs",
];
const FAILURE_TYPES = [
  "testCodeFailure",
  "testTimeoutFailure",
  "cancelledByParent",
  "uncaughtException",
  "unhandledRejection",
];
const OPERATORS = [
  "strictEqual",
  "deepStrictEqual",
  "equal",
  "deepEqual",
  "match",
  "doesNotMatch",
  "rejects",
  "throws",
  "fail",
  "ok",
  "==",
  "===",
];
const integer = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff ? value : null;
const signal = (value) =>
  value === null
    ? null
    : typeof value === "string" && /^SIG[A-Z0-9]{1,12}$/.test(value)
      ? value
      : "unknown";
const text = (value) => (typeof value === "string" ? value : "");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function frames(output) {
  const result = [];
  const seen = new Set();
  const pattern = new RegExp(`(${FRAMES.map(escape).join("|")}):(\\d{1,7}):(\\d{1,7})`, "g");
  for (const match of output.matchAll(pattern)) {
    const key = `${match[1]}:${match[2]}:${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ file: match[1], line: Number(match[2]), column: Number(match[3]) });
    if (result.length === MAX_FRAMES) break;
  }
  return result;
}

function fieldValues(output, field, allowed) {
  return allowed.filter((value) =>
    new RegExp(`^\\s*${field}:\\s*['"]?${escape(value)}['"]?\\s*$`, "m").test(output),
  );
}

function workerStatuses(output) {
  const result = [];
  const pattern =
    /"workerResult"\s*:\s*\{\s*"code"\s*:\s*(null|\d{1,10})\s*,\s*"signal"\s*:\s*(null|"SIG[A-Z0-9]{1,12}")/g;
  for (const match of output.matchAll(pattern)) {
    result.push({
      exitCode: match[1] === "null" ? null : integer(Number(match[1])),
      signal: match[2] === "null" ? null : signal(match[2].slice(1, -1)),
    });
    if (result.length === 4) break;
  }
  return result;
}

/** Only whitelisted structural observations leave the owned child-output boundary. */
export function authFailureDiagnostic(input) {
  const stdout = text(input.stdout);
  const stderr = text(input.stderr);
  const output = `${stdout.slice(0, MAX_SCAN_CHARS)}\n${stderr.slice(0, MAX_SCAN_CHARS)}`;
  const process = input.process ?? {};
  const summary = input.summary ?? {};
  return {
    schemaVersion: 1,
    mode: input.mode === "source" || input.mode === "dist" ? input.mode : "unknown",
    caseId:
      typeof input.id === "string" && /^A-[A-Z]{2,8}-\d{2}$/.test(input.id) ? input.id : "unknown",
    timeoutMs: integer(input.timeoutMs),
    process: {
      exitCode: integer(process.exitCode),
      signal: signal(process.signal),
      timedOut: process.timedOut === true,
      overflowed: process.overflowed === true,
    },
    counts: Object.fromEntries(
      ["tests", "pass", "fail", "skipped", "cancelled"].map((key) => [key, integer(summary[key])]),
    ),
    caseAssertion: summary.caseAssertion === true,
    observedErrorCodes: CODES.filter((code) => new RegExp(`\\b${code}\\b`).test(output)),
    observedMarkers: MARKERS.filter(([, value]) => output.includes(value)).map(([label]) => label),
    observedFailureTypes: fieldValues(output, "failureType", FAILURE_TYPES),
    observedOperators: fieldValues(output, "operator", OPERATORS),
    observedFrames: frames(output),
    workerStatuses: workerStatuses(output),
    scanTruncated: stdout.length > MAX_SCAN_CHARS || stderr.length > MAX_SCAN_CHARS,
  };
}

export function emitAuthFailureDiagnostic(input, write) {
  try {
    write(`KNORVIA_AUTH_FIRST_FAILURE ${JSON.stringify(authFailureDiagnostic(input))}\n`);
    return true;
  } catch {
    // 诊断本身失败不能覆盖原有测试断言；认证结果和验收条件仍由原 runner 决定。
    return false;
  }
}
