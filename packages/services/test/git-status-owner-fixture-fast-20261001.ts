// Existing owned fake ports and disclosed oracle; never a live Git repository.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  resolutionFixture,
  result,
  deferred,
  workspace,
  root,
  revArgs,
} from "./git-repository-resolution-fixture-fast-20261001.js";
export { result, deferred, workspace, root, revArgs };
export const stdout =
  "# branch.head owned-main\0# branch.ab +2 -1\0" +
  "1 MM owned owned owned owned owned owned subdir/owned.txt\0? subdir/dir/\0";
export const statusArgs = (mode: "all" | "normal") => [
  "status",
  "--porcelain=v2",
  "--branch",
  `--untracked-files=${mode}`,
  "-z",
];
export const statArgs = [
  ["diff", "--cached", "--numstat", "-z", "--find-renames", "--"],
  ["diff", "--numstat", "-z", "--find-renames", "--"],
];
export function answer(c: { args: string[] }) {
  if (c.args[0] === "rev-parse") return result();
  if (c.args[0] === "status") return result({ stdout });
  assert.equal(c.args[0], "diff", "unowned command");
  return result({ stdout: `${c.args.includes("--cached") ? "3\t2" : "4\t1"}\tsubdir/owned.txt\0` });
}
export async function statusOwnerFixture() {
  mock.method(Date, "now", () => 123456);
  const f = await resolutionFixture(),
    oracle = JSON.parse(
      readFileSync(
        new URL("./git-status-owner-legacy-fast-20261001.json", import.meta.url),
        "utf8",
      ),
    );
  assert.equal(oracle.commit, "45bdf9e5b67f971fad3999b374e8cd2373d0bec0");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.deepEqual(
    oracle.spans.map((s: { name: string }) => s.name),
    ["runGitStatus", "getStatus"],
  );
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  return {
    ...f,
    fixture(options: Parameters<typeof f.fixture>[0] = {}) {
      f.logs.length = 0;
      return f.fixture({ ...options, run: options.run ?? answer });
    },
  };
}
