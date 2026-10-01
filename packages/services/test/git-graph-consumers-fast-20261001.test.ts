import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  commandResult,
  deferred,
  graphFixture,
  record,
  workspace,
} from "./git-graph-query-fixture-fast-20261001.js";
import { graphUiHarness } from "./git-graph-ui-callback-fast-20261001.js";
const f = await graphFixture();
const { layoutGitGraph } = await import(f.uiUrl("git-graph/layout"));
const { getErrorMessage } = await import(f.uiUrl("lib/errorMessage"));
// Display imports JSX/icon modules; avoid loading any renderer/platform entrypoint.
const warnings: unknown[][] = [];
mock.module(f.uiUrl("logger"), {
  namedExports: { logger: { warn: (...args: unknown[]) => warnings.push(args) } },
});
const harness = graphUiHarness(f.uiUrl("git-graph/GitGraphDialog"));
for (const remote of [false, true])
  test(`actual graph service/RPC projection remote=${remote}`, async (t) => {
    const s = f.fixture({ result: commandResult({ stdout: record("h2", "h1") + record("h1") }) });
    const api = remote ? f.remote(t, s.api) : s.api;
    const result = await api.getCommitGraph({ workspacePath: workspace, maxCount: 1, skip: 3 });
    assert.deepEqual(Object.keys(result), ["commits", "hasMore"]);
    assert.equal(result.commits[0]!.hash, "h2");
    assert.equal(result.hasMore, true);
    assert.deepEqual(s.trace, [["resolve", workspace], "run"]);
    assert.equal(s.commands[0]!.args[7], "--skip=3");
  });
test("service preserves graph property read order and array reference", async () => {
  const s = f.fixture();
  const commits: unknown[] = [];
  const trace: string[] = [];
  s.repo.getCommitGraph = async function (...args) {
    assert.equal(this, s.repo);
    assert.deepEqual(args, [workspace, undefined, undefined]);
    return new Proxy(
      { resolution: {}, commits, hasMore: false },
      {
        get(target, key) {
          trace.push(String(key));
          return Reflect.get(target, key);
        },
      },
    ) as never;
  };
  const result = await s.api.getCommitGraph({ workspacePath: workspace });
  assert.equal(result.commits, commits);
  assert.deepEqual(trace, ["then", "commits", "hasMore"]);
});
test("actual binary RPC propagates command failure wording without retry", async (t) => {
  const s = f.fixture({ result: commandResult({ exitCode: 128, stderr: "owned failure" }) });
  await assert.rejects(
    f.remote(t, s.api).getCommitGraph({ workspacePath: workspace }),
    (e) => e instanceof Error && e.message === "git log visible refs failed: owned failure",
  );
  assert.equal(s.commands.length, 1);
});
test("actual graph layout accepts parsed merge/refs/identity without input mutation", async () => {
  const s = f.fixture({
    result: commandResult({
      stdout:
        record("merge", "left right", "a", "3", "merge", "HEAD -> refs/heads/main") +
        record("left", "root", "b", "2", "left", "tag: v") +
        record("right", "root") +
        record("root"),
    }),
  });
  const result = await s.api.getCommitGraph({ workspacePath: workspace });
  const before = JSON.stringify(result);
  const layout = layoutGitGraph(result.commits);
  assert.deepEqual(
    layout.rows.map((r: any) => r.commit.hash),
    ["merge", "left", "right", "root"],
  );
  assert.equal(layout.rows[0].commit, result.commits[0]);
  assert.equal(layout.edges.length, 4);
  assert.ok(layout.laneCount >= 2);
  assert.equal(JSON.stringify(result), before);
});
test("actual graph layout handles empty and missing-parent pages", async () => {
  const empty = layoutGitGraph([]);
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.laneCount, 1);
  const result = await f
    .fixture({ result: commandResult({ stdout: record("h", "outside") }) })
    .api.getCommitGraph({ workspacePath: workspace });
  const layout = layoutGitGraph(result.commits);
  assert.equal(layout.rows[0].commit.hash, "h");
  assert.equal(layout.edges.length, 1);
});
function uiClosure(api: unknown, overrides: Record<string, unknown> = {}) {
  const events: unknown[][] = [],
    loadingMoreRef = { current: false };
  let current: unknown[] = [];
  const setter = (name: string) => (value: unknown) => events.push([name, value]);
  return {
    events,
    loadingMoreRef,
    closure: {
      gitService: api,
      workspacePath: workspace,
      GIT_GRAPH_PAGE_SIZE: 50,
      commits: [],
      loading: false,
      loadingMore: false,
      refreshing: false,
      hasMore: true,
      loadingMoreRef,
      setLoading: setter("loading"),
      setLoadingMore: setter("loadingMore"),
      setRefreshing: setter("refreshing"),
      setErrorMessage: setter("error"),
      setHasMore: setter("hasMore"),
      setSelectedCommitHash: setter("selected"),
      setCommits: (value: unknown) => {
        current = typeof value === "function" ? value(current) : (value as unknown[]);
        events.push(["commits", current]);
      },
      logger: { warn: (...args: unknown[]) => events.push(["warn", ...args]) },
      toast: (message: unknown) => events.push(["toast", message]),
      intl: {
        formatMessage: ({ id }: { id: string }, values?: unknown) => JSON.stringify({ id, values }),
      },
      getErrorMessage,
      ...overrides,
    },
  };
}
test("actual UI initial graph callback forwards page and selects first commit", async () => {
  const s = f.fixture({ result: commandResult({ stdout: record("first") + record("second") }) });
  const u = uiClosure(s.api);
  await harness.callback("loadInitialCommits", u.closure)();
  assert.deepEqual(s.trace, [["resolve", workspace], "run"]);
  assert.equal(s.commands[0]!.args[7], "--skip=0");
  assert.equal(s.commands[0]!.args[8], "--max-count=51");
  const normalized = JSON.parse(JSON.stringify(u.events));
  assert.deepEqual(normalized.slice(0, 8), [
    ["loading", true],
    ["loadingMore", false],
    ["refreshing", false],
    ["error", null],
    ["commits", []],
    ["hasMore", false],
    ["selected", null],
    ["commits", (await s.api.getCommitGraph({ workspacePath: workspace })).commits],
  ]);
  assert.deepEqual(normalized.slice(-3), [
    ["hasMore", false],
    ["selected", "first"],
    ["loading", false],
  ]);
});
for (const callback of ["loadInitialCommits", "refreshCommits", "loadMoreCommits"])
  test(`actual UI ${callback} failure cleanup and exact log fields`, async () => {
    const failure = new Error("owned command failure");
    const s = f.fixture({ run: () => Promise.reject(failure) });
    const u = uiClosure(s.api, { commits: [{ hash: "already" }] });
    await harness.callback(callback, u.closure)();
    assert.equal(s.commands.length, 1);
    assert.equal(u.loadingMoreRef.current, false);
    const warn = u.events.find((e) => e[0] === "warn")!;
    assert.equal((warn[2] as any).workspacePath, workspace);
    assert.equal((warn[2] as any).error, "owned command failure");
    if (callback === "loadMoreCommits") {
      assert.equal((warn[2] as any).loadedCommitCount, 1);
      assert.equal(s.commands[0]!.args[7], "--skip=1");
    }
    assert.deepEqual(u.events.at(-1), [
      callback === "loadInitialCommits"
        ? "loading"
        : callback === "refreshCommits"
          ? "refreshing"
          : "loadingMore",
      false,
    ]);
    assert.equal(
      u.events.some((e) => e[0] === "toast"),
      callback === "refreshCommits",
    );
  });
for (const guard of ["loading", "loadingMore", "refreshing", "hasMore", "loadingMoreRef"])
  test(`actual UI load-more guard ${guard}`, async () => {
    const u = uiClosure(
      { getCommitGraph: () => assert.fail("guard command") },
      {
        [guard]:
          guard === "hasMore" ? false : guard === "loadingMoreRef" ? { current: true } : true,
      },
    );
    await harness.callback("loadMoreCommits", u.closure)();
    assert.deepEqual(u.events, []);
  });
test("actual UI deferred load-more uses accepted loaded count and releases admission", async () => {
  const gate = deferred<ReturnType<typeof commandResult>>();
  const s = f.fixture({ run: () => gate.promise });
  const u = uiClosure(s.api, { commits: [{ hash: "already" }] });
  const pending = harness.callback("loadMoreCommits", u.closure)();
  assert.equal(u.loadingMoreRef.current, true);
  for (let n = 0; n < 4; n++) await Promise.resolve();
  assert.equal(s.commands[0]!.args[7], "--skip=1");
  gate.resolve(commandResult({ stdout: record("next") }));
  await pending;
  assert.equal(u.loadingMoreRef.current, false);
  assert.deepEqual(u.events.at(-1), ["loadingMore", false]);
  assert.equal((u.events.find((e) => e[0] === "commits")![1] as any[])[0].hash, "next");
});

test("actual UI empty initial page selects null and preserves empty acceptance", async () => {
  const s = f.fixture();
  const u = uiClosure(s.api);
  await harness.callback("loadInitialCommits", u.closure)();
  assert.deepEqual(u.events.slice(-3), [
    ["hasMore", false],
    ["selected", null],
    ["loading", false],
  ]);
});
test("actual UI refresh forwards initial page and updates selection", async () => {
  const s = f.fixture({ result: commandResult({ stdout: record("fresh") }) });
  const u = uiClosure(s.api);
  await harness.callback("refreshCommits", u.closure)();
  assert.equal(s.commands[0]!.args[7], "--skip=0");
  assert.equal(s.commands[0]!.args[8], "--max-count=51");
  assert.deepEqual(u.events.slice(-3), [
    ["hasMore", false],
    ["selected", "fresh"],
    ["refreshing", false],
  ]);
});
for (const guard of ["loading", "loadingMore", "refreshing"])
  test(`actual UI refresh guard ${guard}`, async () => {
    const u = uiClosure({ getCommitGraph: () => assert.fail("guard command") }, { [guard]: true });
    await harness.callback("refreshCommits", u.closure)();
    assert.deepEqual(u.events, []);
  });
test("actual graph display formats owned timestamp through fake Intl and retains hashes", async (t) => {
  const url = f.uiUrl("git-graph/GitGraphDisplay").replace(/\.ts$/, ".tsx");
  const { formatCommitTime, getShortHash } = await import(url);
  const calls: unknown[] = [];
  mock.method(Intl, "DateTimeFormat", function (locale: string, options: unknown) {
    calls.push([locale, options]);
    return {
      format: (date: Date) => {
        calls.push(date.getTime());
        return "owned formatted time";
      },
    };
  });
  t.after(() => mock.restoreAll());
  assert.equal(formatCommitTime(null, "owned-locale"), "");
  assert.equal(formatCommitTime(0, "owned-locale"), "");
  assert.equal(formatCommitTime(123000, "owned-locale"), "owned formatted time");
  assert.deepEqual(calls, [
    ["owned-locale", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }],
    123000,
  ]);
  assert.equal(getShortHash("owned-hash-中文"), "owned-h");
});
