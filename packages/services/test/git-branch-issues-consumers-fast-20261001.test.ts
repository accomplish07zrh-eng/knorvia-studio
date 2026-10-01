// Actual failure-return callers; fake switch commands never execute Git mutations.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchIssuesFixture,
  result,
  tracked,
  untracked,
  workspace,
  root,
  deferred,
} from "./git-branch-issues-fixture-fast-20261001.js";
const f = await branchIssuesFixture();
for (const transport of ["service", "RPC"] as const)
  for (const action of ["switch", "create"] as const)
    for (const detail of [
      `${tracked}\r\n\t"sub\\owned 文.txt"\r\nStop`,
      `${untracked}\n\towned\nStop`,
      "invalid reference: owned",
    ])
      test(`actual static branch failure ${transport}/${action}/${JSON.stringify(detail)}`, async (t) => {
        const failure = Object.freeze(
            result({ exitCode: 1, stderr: detail, stdout: "ignored owned stdout" }),
          ),
          s = f.fixture(failure),
          api = transport === "RPC" ? f.remote(t, s.api) : s.api;
        const output =
          action === "switch"
            ? await api.switchBranch({ workspacePath: workspace, targetBranchName: " owned-new " })
            : await api.createBranchAndSwitch({
                workspacePath: workspace,
                branchName: " owned-new ",
                startPoint: " --owned-base ",
              });
        assert.equal(output.ok, false);
        assert.equal(output.action, action === "switch" ? "switch" : "create-and-switch");
        assert.equal(output.branchName, "owned-new");
        assert.equal(output.didChange, false);
        assert.equal(output.created, false);
        assert.deepEqual(output.issues, f.legacy(failure));
        assert.equal(output.summary.repoRoot, root);
        assert.equal(output.summary.branchName, "main");
        const commands = s.commands.filter((c) => c.args[0] === "switch");
        assert.equal(commands.length, 1);
        assert.deepEqual(commands[0], {
          cwd: root,
          args:
            action === "switch"
              ? ["switch", "--no-guess", "owned-new"]
              : ["switch", "--no-guess", "-c", "owned-new", "--", "--owned-base"],
          timeoutMs: 15000,
          maxOutputBytes: 524288,
        });
        assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 1);
        assert.equal(s.commands.at(-1), commands[0]);
      });
for (const reject of [false, true])
  test(`actual delayed fake branch failure rejection=${reject}`, async () => {
    const gate = deferred<ReturnType<typeof result>>(),
      started = deferred<void>(),
      error = new Error("owned fake switch rejection");
    const s = f.fixture(() => {
      started.resolve();
      return gate.promise;
    });
    const pending = s.api.switchBranch({ workspacePath: workspace, targetBranchName: "owned-new" });
    await started.promise;
    const before = s.commands.length;
    if (reject) {
      gate.reject(error);
      await assert.rejects(pending, (e) => e === error);
    } else {
      const failure = result({ exitCode: 1, stderr: `${tracked}\n\towned\nStop` });
      gate.resolve(failure);
      assert.deepEqual((await pending).issues, f.legacy(failure));
    }
    assert.equal(s.commands.length, before);
  });
