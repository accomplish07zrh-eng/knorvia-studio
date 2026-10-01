import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import type { GitDiffResult } from "@knorvia/shared";
import {
  comparison,
  entry,
  projectionFixture,
  root,
  snapshot,
  workspace,
} from "./git-read-projection-fixture-fast-20261001.js";
const f = await projectionFixture();
const { loadWorkspaceFileTreeGitStatus } = await import(f.uiUrl("workspace-file-tree/gitStatus"));
const { buildGitBranchSwitchAssistState } = await import(
  f.uiUrl("git-branch-switcher/switchAssist")
);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

for (const includeIdentity of [false, true])
  for (const includeBranchComparison of [false, true])
    test(`refresh optional ports identity=${includeIdentity} branch=${includeBranchComparison}`, async () => {
      const s = f.service();
      const result = await s.api.refresh({
        workspacePath: workspace,
        includeIdentity,
        includeBranchComparison,
      });
      assert.deepEqual(s.trace, [
        "status",
        ...(includeIdentity ? ["identity"] : []),
        ...(includeBranchComparison ? ["branch"] : []),
      ]);
      assert.equal(result.summary, s.status.summary);
      assert.equal(result.identity, includeIdentity ? s.identity : null);
      assert.equal(
        result.branchComparison?.comparisonLabel ?? null,
        includeBranchComparison ? s.branch.comparisonLabel : null,
      );
      assert.deepEqual(Object.keys(result), [
        "summary",
        "identity",
        "unstagedChanges",
        "stagedChanges",
        "branchComparison",
      ]);
      assert.equal(result.unstagedChanges.length, 1);
      assert.equal(result.stagedChanges.length, 1);
    });
test("refresh starts all requested ports before awaiting; branch is projected before either source", async () => {
  const trace: string[] = [],
    status = snapshot(),
    branch = comparison();
  const statusPort = deferred<typeof status>(),
    branchPort = deferred<typeof branch>(),
    identityPort = deferred<null>();
  const statusEntries = status.entries,
    branchEntries = branch.changes;
  Object.defineProperty(status, "entries", {
    get: () => {
      trace.push("status projection");
      return statusEntries;
    },
  });
  Object.defineProperty(branch, "changes", {
    get: () => {
      trace.push("branch projection");
      return branchEntries;
    },
  });
  const api = f.service({
    ports: {
      getStatus: () => {
        trace.push("status IO");
        return statusPort.promise;
      },
      getIdentity: () => {
        trace.push("identity IO");
        return identityPort.promise as never;
      },
      getBranchComparison: () => {
        trace.push("branch IO");
        return branchPort.promise;
      },
    },
  }).api;
  const pending = api.refresh({
    workspacePath: workspace,
    includeIdentity: true,
    includeBranchComparison: true,
  });
  assert.deepEqual(trace, ["status IO", "identity IO", "branch IO"]);
  branchPort.resolve(branch);
  identityPort.resolve(null);
  await Promise.resolve();
  assert.equal(trace.length, 3);
  statusPort.resolve(status);
  await pending;
  assert.deepEqual(trace, [
    "status IO",
    "identity IO",
    "branch IO",
    "branch projection",
    "status projection",
    "status projection",
  ]);
});
for (const port of ["getStatus", "getIdentity", "getBranchComparison"] as const)
  test(`refresh rejects exact owned ${port} failure without projection`, async () => {
    const failure = new Error(`owned ${port} failure`),
      status = snapshot();
    Object.defineProperty(status, "entries", {
      get: () => assert.fail("projection after failed IO"),
    });
    const api = f.service({
      status,
      ports: {
        [port]: async () => {
          throw failure;
        },
      },
    }).api;
    await assert.rejects(
      api.refresh({
        workspacePath: workspace,
        includeIdentity: true,
        includeBranchComparison: true,
      }),
      (error) => error === failure,
    );
  });
test("refresh synchronous port failure prevents subsequent port acquisition", async () => {
  const failure = new Error("owned synchronous status"),
    trace: string[] = [];
  const api = f.service({
    ports: {
      getStatus: () => {
        trace.push("status");
        throw failure;
      },
      getIdentity: async () => {
        assert.fail("identity after throw");
      },
      getBranchComparison: async () => {
        assert.fail("branch after throw");
      },
    },
  }).api;
  await assert.rejects(
    api.refresh({ workspacePath: workspace, includeIdentity: true, includeBranchComparison: true }),
    (error) => error === failure,
  );
  assert.deepEqual(trace, ["status"]);
});
test("refresh branch projection error precedes status selection errors", async () => {
  const failure = new Error("owned branch projection"),
    branch = comparison(),
    status = snapshot();
  Object.defineProperty(branch.changes[0], "kind", {
    get: () => {
      throw failure;
    },
  });
  Object.defineProperty(status, "entries", { get: () => assert.fail("status before branch") });
  await assert.rejects(
    f
      .service({ status, branch })
      .api.refresh({ workspacePath: workspace, includeBranchComparison: true }),
    (error) => error === failure,
  );
});
test("actual binary RPC descriptor carries both source lists and comparison without native effects", async (t) => {
  const s = f.service(),
    remote = f.remote(t, s.api);
  const expected = await s.api.refresh({
    workspacePath: workspace,
    includeIdentity: true,
    includeBranchComparison: true,
  });
  assert.deepEqual(
    await remote.refresh({
      workspacePath: workspace,
      includeIdentity: true,
      includeBranchComparison: true,
    }),
    expected,
  );
  assert.deepEqual(
    await remote.getChanges({ workspacePath: workspace, sourceId: "staged" }),
    expected.stagedChanges,
  );
  assert.deepEqual(
    await remote.getBranchComparison({ workspacePath: workspace }),
    expected.branchComparison,
  );
  assert.deepEqual(s.trace, [
    "status",
    "identity",
    "branch",
    "status",
    "identity",
    "branch",
    "status",
    "branch",
  ]);
});
test("binary RPC preserves projection error wording and missing method error", async (t) => {
  const failure = new Error("owned lookup failure"),
    status = snapshot();
  status.unstagedStats.get = () => {
    throw failure;
  };
  const remote = f.remote(t, f.service({ status }).api);
  await assert.rejects(remote.getChanges({ workspacePath: workspace, sourceId: "unstaged" }), {
    message: failure.message,
  });
  await assert.rejects((remote as unknown as { absent(): Promise<unknown> }).absent(), {
    message: "Method not found: absent",
  });
});
test("actual tree consumer through RPC preserves untracked priority and scope", async (t) => {
  const status = snapshot([
    entry({ kind: "added" }),
    entry({ isUntracked: true }),
    entry({ path: "other/hidden.txt" }),
  ]);
  status.untrackedStats.set("work/owned.txt", { added: 3, removed: 0 });
  const s = f.service({ status }),
    remote = f.remote(t, s.api);
  const result = await loadWorkspaceFileTreeGitStatus({
    gitService: remote,
    workspacePath: workspace,
  });
  assert.equal(result.available, true);
  assert.deepEqual([...result.statusByPath], [[resolve(root, "work/owned.txt"), "untracked"]]);
  assert.deepEqual(s.trace, ["status"]);
});
test("actual tree consumer unavailable repo returns empty without extended reads", async () => {
  const status = snapshot();
  status.summary.isRepository = false;
  const s = f.service({ status });
  const result = await loadWorkspaceFileTreeGitStatus({
    gitService: s.api,
    workspacePath: workspace,
  });
  assert.equal(result.available, false);
  assert.equal(result.statusByPath.size, 0);
  assert.deepEqual(s.trace, ["status"]);
});
test("actual branch assist consumes both projected sources read-only through RPC", async (t) => {
  const status = snapshot();
  status.stagedStats.set("work/owned.txt", { added: 2, removed: 3 });
  status.unstagedStats.set("work/owned.txt", { added: 5, removed: 7 });
  const s = f.service({ status }),
    remote = f.remote(t, s.api);
  const result = await buildGitBranchSwitchAssistState({
    gitService: remote,
    workspacePath: workspace,
    result: {
      action: "switch",
      created: false,
      didChange: false,
      branchName: "owned-target",
      summary: status.summary,
      issues: [{ code: "tracked-changes-would-be-overwritten", paths: ["work/owned.txt"] }],
    },
  });
  assert.equal(result?.fileCount, 1);
  assert.equal(result?.targetBranchName, "owned-target");
  assert.equal(result?.totalAdded, 7);
  assert.equal(result?.totalRemoved, 10);
  assert.deepEqual(result?.stagePaths, [resolve(root, "work/owned.txt"), "work/owned.txt"]);
  assert.deepEqual(s.trace, ["status", "status", "identity"]);
});
test("unchanged generator preserves filtered source order, allSettled diffs and metadata", async () => {
  const status = snapshot([
    entry({ path: "work/owned.txt" }),
    entry({ path: "work/excluded.txt" }),
  ]);
  const calls: unknown[] = [],
    diff: GitDiffResult = {
      path: resolve(root, "work/owned.txt"),
      availability: "patch",
      patch: "owned patch",
      beforeContent: null,
      afterContent: null,
    };
  let generated: Record<string, unknown> | undefined;
  const s = f.service({
    status,
    ports: {
      getDiff: async (query) => {
        calls.push(query);
        if (query.sourceId === "staged") throw new Error("owned rejected diff");
        return diff;
      },
    },
    generator: {
      generate: async (params) => {
        generated = params;
        return { message: "owned message", providerId: "owned", model: "owned" };
      },
    },
  });
  const context = { messages: [{ role: "user" as const, content: "owned synthetic request" }] };
  const result = await s.api.generateCommitMessage({
    workspacePath: workspace,
    workspaceIdentity: "owned-identity",
    locale: "en",
    conversationContext: context,
    currentSessionFilePaths: ["owned.txt"],
  });
  assert.equal(result.message, "owned message");
  assert.deepEqual(
    calls,
    ["unstaged", "staged"].map((sourceId) => ({
      workspacePath: workspace,
      path: diff.path,
      sourceId,
    })),
  );
  assert.deepEqual(
    (generated!.files as { section: string }[]).map((file) => file.section),
    ["unstaged", "staged"],
  );
  assert.deepEqual(generated!.diffs, [diff]);
  assert.equal(generated!.workspaceIdentity, "owned-identity");
  assert.equal(generated!.locale, "en");
  assert.equal(generated!.conversationContext, context);
});
test("unchanged generator first-eight cap and staged-only selection", async () => {
  const status = snapshot(
    Array.from({ length: 10 }, (_, index) => entry({ path: `work/${index}.txt` })),
  );
  const paths: string[] = [];
  let sections: string[] = [];
  const api = f.service({
    status,
    ports: {
      getDiff: async (query) => {
        paths.push(query.path);
        return {
          path: query.path,
          availability: "unavailable",
          patch: null,
          beforeContent: null,
          afterContent: null,
        };
      },
    },
    generator: {
      generate: async (params) => {
        sections = params.files.map((file) => file.section);
        assert.deepEqual(params.diffs, []);
        return { message: "owned", providerId: "owned", model: "owned" };
      },
    },
  }).api;
  await api.generateCommitMessage({ workspacePath: workspace, includeUnstaged: false });
  assert.deepEqual(
    paths,
    Array.from({ length: 8 }, (_, index) => resolve(root, "work", `${index}.txt`)),
  );
  assert.deepEqual(sections, Array(10).fill("staged"));
});
test("unchanged unavailable/empty generator errors retain ordering", async () => {
  const s = f.service();
  await assert.rejects(s.api.generateCommitMessage({ workspacePath: workspace }), {
    message: "Commit message generation is not available.",
  });
  assert.deepEqual(s.trace, []);
  const empty = f.service({
    status: snapshot([]),
    generator: { generate: async () => assert.fail("no empty generation") },
  });
  await assert.rejects(empty.api.generateCommitMessage({ workspacePath: workspace }), {
    message: "There are no changes available to commit.",
  });
  assert.deepEqual(empty.trace, ["status"]);
});
