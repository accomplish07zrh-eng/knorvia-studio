import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  selectedIndexFixture,
  answer,
  result,
  root,
  workspace,
  deferred,
} from "./git-selected-index-fixture-fast-20261001.js";
const f = await selectedIndexFixture();
const selected = "sub/--selected 文.txt",
  original = "sub/--original 文.txt";
const scopedStatus = `2 R. ${Array(7).fill("owned").join(" ")} ${selected}\0${original}\0`;
const query = {
  workspacePath: workspace,
  message: "  fix: owned selected index  ",
  paths: ["--selected 文.txt"],
  stagedOnly: true,
};
for (const kind of ["malformed", "conflict"] as const)
  test(`actual service ${kind} index stops before head/temp effects`, async () => {
    const stdout =
      kind === "malformed" ? `m h 1\t${selected}\0missing tab\0` : `m h 1\t${selected}\0`;
    const s = f.fixture({
      commitFixture: true,
      run(c) {
        if (c.args[0] === "status" && !c.args.includes("--branch"))
          return result({ stdout: scopedStatus });
        if (c.args[0] === "ls-files") return result({ stdout });
        return answer(c);
      },
    });
    await assert.rejects(s.api.commit(query), {
      message:
        kind === "malformed"
          ? "Failed to parse staged Git index entry."
          : "Cannot commit selected staged paths while index conflicts exist.",
    });
    assert.deepEqual(
      s.commands.map((c) => c.args[0]),
      ["rev-parse", "status", "ls-files"],
    );
    assert.equal(
      s.trace.some((e) => Array.isArray(e) && ["mkdir", "mkdtemp", "rm"].includes(e[0])),
      false,
    );
  });
for (const reject of [false, true])
  test(`actual RPC late index preserves shared status/rejection cleanup: reject=${reject}`, async (t) => {
    const gate = deferred<ReturnType<typeof result>>(),
      started = deferred<void>();
    const error = new Error("owned delayed index failure");
    const s = f.fixture({
      commitFixture: true,
      run(c) {
        if (c.args[0] === "status" && !c.args.includes("--branch"))
          return result({ stdout: scopedStatus });
        if (c.args[0] === "ls-files") {
          started.resolve();
          return gate.promise;
        }
        if (c.args[0] === "rev-parse" && c.args[1] === "--verify")
          return result({ exitCode: 1, stdout: "" });
        if (c.args[0] === "rev-parse" && c.args[1] === "HEAD")
          return result({ stdout: "owned-commit-hash\n" });
        return answer(c);
      },
    });
    const remote = f.remote(t, s.api),
      pending = remote.commit(query);
    await started.promise;
    const queued = await Promise.all([s.repo.getStatus(workspace), s.repo.getStatus(workspace)]);
    assert.equal(queued[0], queued[1]);
    assert.equal(
      s.commands.filter((c) => c.args[0] === "status" && c.args.includes("--branch")).length,
      1,
    );
    if (reject) {
      gate.reject(error);
      await assert.rejects(pending, { name: "Error", message: error.message });
      assert.equal(
        s.trace.some((e) => Array.isArray(e) && e[0] === "rm"),
        false,
      );
      await s.repo.getStatus(workspace);
    } else {
      gate.resolve(
        result({
          stdout: `100644 owned-first 0\t${selected}\0\0m owned-second 0\tsub/owned-two\t路径\0`,
        }),
      );
      const output = await pending;
      assert.equal(output.commitHash, "owned-commit-hash");
      assert.equal(output.summary.workspacePath, workspace);
      assert.deepEqual(
        s.commands.filter((c) => c.args[0] === "update-index").map((c) => c.args),
        [
          ["update-index", "--force-remove", "--", selected, original],
          ["update-index", "--add", "--cacheinfo", "100644", "owned-first", selected],
          ["update-index", "--add", "--cacheinfo", "m", "owned-second", "sub/owned-two\t路径"],
        ],
      );
      assert.deepEqual(s.commands.find((c) => c.args[0] === "read-tree")?.args, [
        "read-tree",
        "--empty",
      ]);
      const native = s.commands.filter((c) =>
        ["read-tree", "update-index", "commit"].includes(c.args[0]!),
      );
      assert.ok(native.every((c) => c.cwd === root && c.timeoutMs === 15000));
      assert.ok(
        native.every(
          (c) =>
            JSON.stringify(c.env) ===
            JSON.stringify({ GIT_INDEX_FILE: resolve(root, "owned-temp-index", "index") }),
        ),
      );
      assert.equal(s.commands.find((c) => c.args[0] === "reset")?.env, undefined);
      assert.equal(s.trace.filter((e) => Array.isArray(e) && e[0] === "rm").length, 1);
    }
    assert.equal(s.commands.filter((c) => c.args[0] === "ls-files").length, 1);
    assert.equal(
      s.commands.filter((c) => c.args[0] === "status" && c.args.includes("--branch")).length,
      2,
    );
  });
