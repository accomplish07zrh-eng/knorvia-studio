// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function parseNodeTestSummary(output, expectedCaseId) {
  const readCount = (label) => {
    const match = output.match(new RegExp(`^(?:#|ℹ)\\s+${label}\\s+(\\d+)\\s*$`, "mu"));
    return match ? Number(match[1]) : undefined;
  };
  const escaped = expectedCaseId?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const caseAssertion = escaped
    ? new RegExp(`^ok\\s+\\d+\\s+-\\s+${escaped}(?:\\s|$)`, "mu").test(output)
    : /^ok\s+\d+\s+-\s+/mu.test(output);
  return {
    caseAssertion,
    cancelled: readCount("cancelled"),
    fail: readCount("fail"),
    pass: readCount("pass"),
    skipped: readCount("skipped"),
    tests: readCount("tests"),
  };
}

export function isAssertedSuccess({ exitCode, signal, summary }) {
  return (
    exitCode === 0 &&
    signal === null &&
    summary.caseAssertion &&
    Number.isInteger(summary.tests) &&
    summary.tests > 0 &&
    Number.isInteger(summary.pass) &&
    summary.pass > 0 &&
    summary.fail === 0
  );
}
