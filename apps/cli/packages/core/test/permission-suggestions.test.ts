// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { PermissionCapabilityGroup } from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";
import { buildDefaultPermissionUpdates } from "../src/tool/executor/permission-suggestions.js";

const rule = (input: unknown) => buildDefaultPermissionUpdates("Fixture", input)[0]!.rules[0]!;

test("trusted capability suggestions precede input inspection and preserve output order", () => {
  const input = {
    get command(): string {
      throw new Error("must not inspect");
    },
  };
  const result = buildDefaultPermissionUpdates(
    "ignored",
    input,
    PermissionCapabilityGroup.OfficialCua,
  );
  assert.deepEqual(result, [
    {
      behavior: "allow",
      rules: [{ toolName: OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME }],
      type: "addRules",
    },
  ]);
  assert.deepEqual(Object.keys(result[0]!), ["behavior", "rules", "type"]);
  assert.throws(
    () => buildDefaultPermissionUpdates("Fixture", input, "unknown" as PermissionCapabilityGroup),
    { message: "Unsupported permission capability group: unknown" },
  );
});

test("suggestions preserve raw text and skip empty or whitespace-only values", () => {
  assert.deepEqual(rule("  echo fixture\t"), {
    toolName: "Fixture",
    ruleContent: "  echo fixture\t",
  });
  for (const input of [undefined, null, false, 0, 1, "", " \n\t", {}])
    assert.deepEqual(rule(input), { toolName: "Fixture" });
  assert.deepEqual(rule({ command: " \t", url: " https://example.org/docs " }), {
    toolName: "Fixture",
    ruleContent: " https://example.org/docs ",
  });
  assert.deepEqual(rule({ command: "", patch_text: "fixture" }), { toolName: "Fixture" });
});

test("suggestion input fields use first nonblank priority and stop reading after a match", () => {
  const keys = ["command", "url", "file_path", "path", "pattern"];
  for (const [index, key] of keys.entries()) {
    const input = Object.fromEntries(
      keys.map((name, position) => [name, position < index ? "  " : name]),
    );
    assert.equal(rule(input).ruleContent, key);
  }
  const input = {
    command: "fixture",
    get url(): string {
      throw new Error("late read");
    },
  };
  assert.equal(rule(input).ruleContent, "fixture");
  const failure = { fixture: "early getter" };
  assert.throws(
    () =>
      rule({
        get command(): string {
          throw failure;
        },
        url: "later",
      }),
    (error) => error === failure,
  );
});

test("each suggestion result owns new arrays and records without mutating input", () => {
  const input = Object.freeze({ file_path: "  fixture.md  " });
  const first = buildDefaultPermissionUpdates("Fixture", input);
  const second = buildDefaultPermissionUpdates("Fixture", input);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.notEqual(first[0]!.rules, second[0]!.rules);
  assert.notEqual(first[0]!.rules[0], second[0]!.rules[0]);
  assert.deepEqual(Object.keys(first[0]!.rules[0]!), ["toolName", "ruleContent"]);
  assert.equal(input.file_path, "  fixture.md  ");
});
