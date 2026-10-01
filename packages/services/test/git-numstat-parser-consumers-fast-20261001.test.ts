import assert from "node:assert/strict";
import { test } from "node:test";
import {
  numstatParserFixture,
  ordinary,
  result,
  workspace,
  revOutput,
} from "./git-numstat-parser-fixture-fast-20261001.js";
const f = await numstatParserFixture();
const records = "1\t0\tsub/b\0-\t-\tsub/a\0\t\t\0outside/old\0sub/new\0 7x\t-2\tsub/b\0";
const status = [
  "# branch.head owned",
  "# branch.upstream remote/main",
  ordinary("1", "MM", "sub/b"),
  ordinary("1", "MM", "sub/a"),
  ordinary("2", "MM", "sub/new"),
  "outside/old",
  "",
].join("\0");
const run = (c: { args: string[] }) =>
  result({
    stdout: c.args[0] === "rev-parse" ? revOutput : c.args[0] === "status" ? status : records,
  });
test("actual status staged/unstaged Maps use exact frozen numstat results", async () => {
  const s = f.fixture({ run }),
    v = await s.repo.getStatus(workspace);
  assert.deepEqual(v.stagedStats, f.legacyNumstat(records));
  assert.deepEqual(v.unstagedStats, f.legacyNumstat(records));
});
for (const transport of ["service", "RPC"] as const)
  test(`actual comparison ${transport} order/stats/rename selection`, async (t) => {
    const s = f.fixture({ run }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api,
      v = await api.getBranchComparison({ workspacePath: workspace });
    assert.deepEqual(
      v.changes.map((x) => [x.workspaceRelativePath, x.kind, x.added, x.removed]),
      [
        ["b", "modified", 7, -2],
        ["a", "modified", 0, 0],
        ["new", "renamed", 0, 0],
      ],
    );
    assert.equal(v.comparisonLabel, "owned -> remote/main");
    assert.deepEqual(s.commands.at(-1)!.args, [
      "diff",
      "--numstat",
      "-z",
      "--find-renames",
      "remote/main...HEAD",
      "--",
    ]);
  });
for (const transport of ["service", "RPC"] as const)
  test(`actual refresh ${transport} shared status and branch effects`, async (t) => {
    const s = f.fixture({ run }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api,
      v = await api.refresh({
        workspacePath: workspace,
        includeIdentity: false,
        includeBranchComparison: true,
      });
    assert.deepEqual(
      v.stagedChanges.map((x) => [x.workspaceRelativePath, x.added, x.removed]),
      [
        ["b", 7, -2],
        ["a", 0, 0],
        ["new", 0, 0],
      ],
    );
    assert.deepEqual(
      v.branchComparison!.changes.map((x) => x.workspaceRelativePath),
      ["b", "a", "new"],
    );
    assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 1);
    assert.equal(s.commands.filter((c) => c.args[0] === "diff").length, 3);
  });
