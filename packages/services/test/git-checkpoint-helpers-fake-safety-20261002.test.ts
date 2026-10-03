import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

test("fake checkpoint paths/parsers keep quoting vocabulary and deletion failure identity", async (t) => {
  const removals: { path: string; options: unknown }[] = [];
  let denied: Error | undefined;
  t.mock.module("node:fs/promises", {
    namedExports: {
      rm: async (path: string, options: unknown) => {
        if (denied) throw denied;
        removals.push({ path, options });
      },
    },
  });
  t.mock.module("../src/paths.js", { namedExports: { getWorkspaceHash: () => "synthetic-hash" } });
  t.mock.module("../src/git/config.js", {
    namedExports: {
      normalizeGitPath: (path: string) => path.replace(/\\/g, "/"),
      toWorkspaceRelativeGitPath: (path: string, scope: string) =>
        path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path,
    },
  });
  const helpers = await import("../src/git/repo/gitCheckpointHelpers.js");
  assert.equal(
    helpers.getCheckpointRefName(fakeFsPath("/synthetic/workspace"), "checkpoint"),
    "refs/knorvia/checkpoints/synthetic-hash/checkpoint",
  );
  const names = helpers.parseNameStatus(
    "R100\0workspace/old name\0workspace/new 'name'\0D\0workspace/deleted\0",
  );
  const stats = helpers.parseNumstat("2\t1\t\0workspace/old name\0workspace/new 'name'\0");
  assert.deepEqual(stats.get("workspace/new 'name'"), { added: 2, removed: 1 });
  const root = fakeFsPath("/synthetic/repo");
  const diff = helpers.mergeCheckpointDiff({
    repoRoot: root,
    workspaceInRepoPath: "workspace",
    fromCheckpointId: "from",
    toCheckpointId: "to",
    nameStatusEntries: names,
    numstat: stats,
  });
  assert.equal(diff.files[0].workspaceRelativePath, "new 'name'");
  assert.equal(diff.files[0].originalPath, join(root, "workspace", "old name"));
  assert.deepEqual(
    helpers
      .buildAffectedRepoPaths(diff.files)
      .map((path) => helpers.normalizeAffectedRepoPath(root, path)),
    ["workspace/new 'name'", "workspace/old name", "workspace/deleted"],
  );
  const env = helpers.buildCheckpointEnv(fakeFsPath("/synthetic/index"));
  assert.equal(env.GIT_INDEX_FILE, fakeFsPath("/synthetic/index"));
  assert.equal(Object.keys(env).length, 5);
  const selected = join(root, "workspace", "deleted");
  await helpers.removeFileIfExists(selected);
  assert.deepEqual(removals, [{ path: selected, options: { force: true, recursive: true } }]);
  denied = new Error("synthetic deletion permission refusal");
  await assert.rejects(helpers.removeFileIfExists(selected), (error) => error === denied);
  assert.equal(removals.length, 1);
});
