import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  checkpointConflictsFixture,
  root,
  workspace,
  tree,
  fileStat,
  result,
  deferred,
} from "./checkpoint-conflicts-fixture-fast-20261001.js";
const f = await checkpointConflictsFixture(),
  path = "sub/owned 文.txt";
const query = { workspacePath: workspace, fromCheckpointId: "from", toCheckpointId: "to" };
function answer(c: { args: string[] }) {
  if (c.args.includes("--name-status")) return result({ stdout: `M\0${path}\0` });
  if (c.args.includes("--numstat")) return result({ stdout: `1\t2\t${path}\0` });
  if (c.args[0] === "ls-tree")
    return result({
      stdout: tree(path, "100644", c.args[3] === "owned-from" ? "owned-before" : "owned-after"),
    });
  return result({ stdout: "owned-different" });
}
for (const transport of ["service", "RPC"] as const)
  test(`actual checkpoint ${transport} preflight returns conflicts before mutation`, async (t) => {
    const s = f.fixture({ run: answer }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    assert.deepEqual(await api.restoreBetweenCheckpoints(query), {
      success: false,
      conflicts: [
        {
          path: resolve(root, path),
          repoRelativePath: path,
          workspaceRelativePath: "owned 文.txt",
          reason: "content-mismatch",
        },
      ],
    });
    assert.deepEqual(
      s.commands.map((c) => c.args[0]),
      ["diff", "diff", "ls-tree", "hash-object"],
    );
    assert.ok(
      s.commands.every((c) => c.cwd === root && c.env === undefined && c.timeoutMs === undefined),
    );
    assert.deepEqual(
      s.trace.filter((e) => Array.isArray(e) && e[0] === "load"),
      [
        ["load", workspace, "from"],
        ["load", workspace, "to"],
      ],
    );
  });
for (const transport of ["service", "RPC"] as const)
  for (const badVerify of [false, true])
    test(`actual checkpoint ${transport} force + target verification bad=${badVerify}`, async (t) => {
      let changed = false;
      const s = f.fixture({
          mutate: true,
          run: (c) => {
            if (c.args[0] === "restore") {
              changed = true;
              return result({ stdout: "" });
            }
            if (c.args[0] === "hash-object")
              return result({
                stdout: changed && !badVerify ? " owned-after \r\n" : "owned-different",
              });
            return answer(c);
          },
        }),
        api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const pending = api.restoreBetweenCheckpoints({ ...query, force: true });
      if (badVerify)
        await assert.rejects(pending, { message: "Checkpoint restore verification failed." });
      else assert.deepEqual(await pending, { success: true, restoredPaths: [resolve(root, path)] });
      assert.deepEqual(
        s.commands.map((c) => c.args[0]),
        ["diff", "diff", "ls-tree", "hash-object", "restore", "ls-tree", "hash-object"],
      );
      assert.deepEqual(s.commands[4], {
        cwd: root,
        args: ["restore", "--source=owned-to", "--worktree", "--", path],
      });
      assert.equal(s.trace.filter((e) => Array.isArray(e) && e[0] === "lstat").length, 2);
    });
for (const reject of [false, true])
  test(`actual RPC late preflight completion reject=${reject}`, async (t) => {
    const gate = deferred<ReturnType<typeof result>>(),
      ready = deferred<void>(),
      error = new Error("owned deferred tree failure");
    const s = f.fixture({
      run: (c) => {
        if (c.args[0] === "ls-tree") {
          ready.resolve();
          return gate.promise;
        }
        return answer(c);
      },
      lstat: () => fileStat(),
    });
    const pending = f.remote(t, s.api).restoreBetweenCheckpoints(query);
    await ready.promise;
    assert.equal(s.commands.length, 3);
    if (reject) {
      gate.reject(error);
      await assert.rejects(pending, { message: error.message });
    } else {
      gate.resolve(answer({ args: ["ls-tree", "-r", "-z", "owned-from"] }));
      assert.equal((await pending).success, false);
    }
    assert.equal(
      s.commands.some((c) => c.args[0] === "restore"),
      false,
    );
  });
