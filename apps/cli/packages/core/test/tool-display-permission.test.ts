// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
const contract = await import("@knorvia/cua/request-access-contract");
const status = {
  schemaVersion: 1,
  platform: "darwin",
  grantOwner: "fixture",
  accessibility: "granted",
  screenRecording: "granted",
};
const reads: unknown[] = [];
// 真实合同当前不支持此能力；这里只隔离验证消费方的名称和来源门槛。
mock.module("@knorvia/cua/request-access-contract", {
  namedExports: {
    ...contract,
    cuaRequestAccessStatusSchema: {
      safeParse(input: unknown) {
        reads.push(input);
        return { success: true, data: status };
      },
    },
  },
});
const { createToolResultDisplay } = await import("../src/tool/executor/result-display.js");
test("permission status is consumed only for an explicitly trusted request_access result", () => {
  const output = { _meta: { [contract.CUA_REQUEST_ACCESS_STATUS_META_KEY]: "fixture-state" } };
  for (const [name, flag] of [
    ["request_access", false],
    ["observe", true],
  ] as const) {
    const result = createToolResultDisplay(`mcp__computer_use__${name}`, output, {
      officialCua: flag,
    });
    assert.ok(result?.kind === "cua" && result.permissionStatus === undefined);
  }
  assert.deepEqual(reads, []);
  const actual = createToolResultDisplay("mcp__computer_use__request_access", output, {
    officialCua: true,
  });
  assert.ok(actual?.kind === "cua" && actual.permissionStatus === status);
  assert.deepEqual(reads, ["fixture-state"]);
});
