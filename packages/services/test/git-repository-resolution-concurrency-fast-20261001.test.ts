import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deferred,
  entry,
  resolutionFixture,
  result,
  workspace,
} from "./git-repository-resolution-fixture-fast-20261001.js";
const f = await resolutionFixture();
test("same exact workspace concurrent resolver callers reuse one discovery/run/result", async () => {
  const binary = deferred<string>(),
    s = f.fixture({ binary: () => binary.promise });
  const reads = Array.from({ length: 8 }, () => s.repo.resolveRepository(workspace));
  assert.deepEqual(s.trace, ["binary"]);
  binary.resolve("owned");
  const values = await Promise.all(reads);
  values.forEach((v) => assert.equal(v, values[0]));
  assert.equal(s.commands.length, 1);
});
test("same exact info key reuses metadata while concurrent resolution/status/identity share resolver", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    started = deferred<void>(),
    metadata = deferred<ReturnType<typeof entry>>();
  const s = f.fixture({
    run: (command) => {
      if (command.args[0] === "rev-parse") {
        started.resolve();
        return gate.promise;
      }
      if (command.args[0] === "config") return result({ exitCode: 1, stdout: "" });
      return result({ stdout: "" });
    },
    stat: () => metadata.promise,
  });
  const infoA = s.repo.getWorkspaceRepositoryInfo(workspace),
    infoB = s.repo.getWorkspaceRepositoryInfo(workspace),
    direct = s.repo.resolveRepository(workspace),
    status = s.repo.getStatus(workspace),
    identity = s.repo.getIdentity(workspace);
  await started.promise;
  gate.resolve(result());
  await Promise.all([direct, status, identity]);
  assert.equal(s.commands.filter((c) => c.args[0] === "rev-parse").length, 1);
  assert.equal(s.trace.filter((v) => Array.isArray(v) && v[0] === "stat").length, 1);
  metadata.resolve(entry(true, false));
  assert.equal(await infoA, await infoB);
});
for (const key of [
  workspace + "/",
  workspace + " ",
  workspace.toUpperCase(),
  "owned entirely different workspace",
])
  test(`different exact keys remain distinct ${JSON.stringify(key)}`, async () => {
    const gate = deferred<string>(),
      s = f.fixture({ binary: () => gate.promise });
    const a = s.repo.resolveRepository(workspace),
      b = s.repo.resolveRepository(key);
    assert.deepEqual(s.trace, ["binary", "binary"]);
    gate.resolve("owned");
    const [av, bv] = await Promise.all([a, b]);
    assert.equal(av.workspacePath, workspace);
    assert.equal(bv.workspacePath, key);
    assert.deepEqual(
      s.commands.map((c) => c.cwd),
      [workspace, key],
    );
  });
for (const method of ["resolveRepository", "getWorkspaceRepositoryInfo"] as const)
  test(`${method} rejected old request is cleaned and legitimate retry works`, async () => {
    const bad = new Error("owned shared failure"),
      gate = deferred<string>();
    let n = 0;
    const s = f.fixture({ binary: () => (n++ === 0 ? gate.promise : "owned") });
    const a = s.repo[method](workspace),
      b = s.repo[method](workspace);
    const pa = assert.rejects(a, (e) => e === bad),
      pb = assert.rejects(b, (e) => e === bad);
    gate.reject(bad);
    await Promise.all([pa, pb]);
    assert.ok(await s.repo[method](workspace));
    assert.equal(n, 2);
  });
for (const outcome of ["resolve", "reject"] as const)
  test(`late old resolver ${outcome} cannot evict new request after invalidate`, async () => {
    const old = deferred<ReturnType<typeof result>>(),
      next = deferred<ReturnType<typeof result>>(),
      oldStarted = deferred<void>(),
      nextStarted = deferred<void>();
    let n = 0;
    const s = f.fixture({
      run: () => {
        if (n++ === 0) {
          oldStarted.resolve();
          return old.promise;
        }
        nextStarted.resolve();
        return next.promise;
      },
    });
    const a = s.repo.resolveRepository(workspace);
    const observed =
      outcome === "reject" ? assert.rejects(a, { message: "owned late failure" }) : a;
    await oldStarted.promise;
    s.repo.invalidate(workspace);
    const b = s.repo.resolveRepository(workspace);
    await nextStarted.promise;
    if (outcome === "reject") old.reject(new Error("owned late failure"));
    else old.resolve(result({ stdout: "owned old root\n\n\n\n" }));
    await observed;
    const c = s.repo.resolveRepository(workspace);
    assert.equal(s.commands.length, 2);
    next.resolve(result({ stdout: "owned new root\n\n\n\n" }));
    assert.equal(await b, await c);
    assert.equal((await b).repoRoot, "owned new root");
  });
test("late metadata fail-open completion cannot evict new info request", async () => {
  const old = deferred<ReturnType<typeof entry>>(),
    next = deferred<ReturnType<typeof entry>>(),
    oldStarted = deferred<void>(),
    nextStarted = deferred<void>();
  let n = 0;
  const s = f.fixture({
    stat: () => {
      if (n++ === 0) {
        oldStarted.resolve();
        return old.promise;
      }
      nextStarted.resolve();
      return next.promise;
    },
    read: () => "gitdir: /owned/.git/worktrees/next",
  });
  const a = s.repo.getWorkspaceRepositoryInfo(workspace);
  await oldStarted.promise;
  s.repo.invalidate(workspace);
  const b = s.repo.getWorkspaceRepositoryInfo(workspace);
  await nextStarted.promise;
  old.reject(new Error("owned old metadata failure"));
  assert.equal((await a).kind, "main-tree");
  const c = s.repo.getWorkspaceRepositoryInfo(workspace);
  assert.equal(n, 2);
  next.resolve(entry(false, true));
  assert.equal(await b, await c);
  assert.equal((await b).kind, "linked-worktree");
  assert.equal(s.commands.length, 2);
});
test("invalidate unrelated key preserves current resolver/info entries", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    started = deferred<void>();
  const s = f.fixture({
    run: () => {
      started.resolve();
      return gate.promise;
    },
  });
  const a = s.repo.getWorkspaceRepositoryInfo(workspace);
  await started.promise;
  s.repo.invalidate(workspace + "/");
  const b = s.repo.getWorkspaceRepositoryInfo(workspace);
  gate.resolve(result());
  assert.equal(await a, await b);
  assert.equal(s.commands.length, 1);
});
test("invalidate status owner forces new empty snapshot without changing resolution policy", async () => {
  const s = f.fixture({ run: () => result({ exitCode: 128, stderr: "not a git repository" }) });
  const a = await s.repo.getStatus(workspace);
  s.repo.invalidate(workspace);
  const b = await s.repo.getStatus(workspace);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  assert.equal(s.commands.length, 2);
});
