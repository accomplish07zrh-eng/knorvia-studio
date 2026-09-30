// Allocation regressions are separate from compatibility; old code is expected to fail both.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.KNORVIA_CLAUDE_LEAF_ROOT;
const target = process.env.KNORVIA_CLAUDE_LEAF_TARGET ?? "src";
const folder = root ? pathToFileURL(`${resolve(root)}/`) : new URL("../", import.meta.url);
const load = (name: string) =>
  import(
    new URL(`${target}/session/claude-native/${name}.${target === "src" ? "ts" : "js"}`, folder)
      .href
  );
const history: typeof import("../src/session/claude-native/sessionHistoryJsonl.js") =
  await load("sessionHistoryJsonl");
const filter: typeof import("../src/session/claude-native/importedClaudeTaskFileFilter.js") =
  await load("importedClaudeTaskFileFilter");

test("full reader avoids arrays of all blank lines", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-claude-cost-2057-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "blank-heavy.jsonl");
  await writeFile(path, "\n".repeat(16384) + '{"keep":1}\n');
  const original = String.prototype.split;
  let allocatedLineSlots = 0;
  String.prototype.split = function (
    this: string,
    ...args: [
      string | RegExp | { [Symbol.split](string: string, limit?: number): string[] },
      number?,
    ]
  ) {
    const result = Reflect.apply(original, this, args);
    if (args[0] instanceof RegExp && args[0].source === "\\r?\\n")
      allocatedLineSlots += result.length;
    return result;
  };
  let result;
  try {
    result = await history.readJsonLinesFile(path);
  } finally {
    String.prototype.split = original;
  }
  assert.deepEqual(result, [{ keep: 1 }]);
  t.diagnostic(`allocated line-array slots=${allocatedLineSlots}`);
  assert.ok(
    allocatedLineSlots <= 2,
    `allocated ${allocatedLineSlots} slots for one visible record`,
  );
});

test("selector traversal avoids quadratic remainder copies", (t) => {
  const depth = 300;
  const value = { self: null as unknown, remove: 1, keep: 2 };
  value.self = value;
  const path = [...Array(depth).fill("self"), "remove"].join(".");
  const original = Array.prototype[Symbol.iterator];
  let copiedSelectorTokens = 0;
  Array.prototype[Symbol.iterator] = function* () {
    const iterator = original.call(this);
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      if (step.value === "self" || step.value === "remove") copiedSelectorTokens++;
      yield step.value;
    }
    return undefined;
  };
  let result;
  try {
    result = filter.filterImportedClaudeTaskFilePaths(value, [path]);
  } finally {
    Array.prototype[Symbol.iterator] = original;
  }
  assert.equal("remove" in result, false);
  assert.equal(result.keep, 2);
  assert.equal(result.self, result);
  assert.equal(value.remove, 1);
  t.diagnostic(`selector-token copies=${copiedSelectorTokens}, depth=${depth}`);
  assert.ok(
    copiedSelectorTokens <= (depth + 1) * 4,
    `copied ${copiedSelectorTokens} selector tokens`,
  );
});
