import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commandResult,
  deferred,
  graphFixture,
  record,
  repoRoot,
  resolution,
  workspace,
} from "./git-graph-query-fixture-fast-20261001.js";
const f = await graphFixture();
const argv = (max = 100, skip = 0) => [
  "log",
  "HEAD",
  "--branches",
  "--tags",
  "--remotes",
  "--date-order",
  "--topo-order",
  `--skip=${skip}`,
  `--max-count=${max + 1}`,
  "--format=%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e",
];
const maxCases: [unknown, number][] = [
  [undefined, 100],
  [null, 100],
  ["7", 100],
  [false, 100],
  [{}, 100],
  [new Number(7), 100],
  [NaN, 100],
  [Infinity, 100],
  [-Infinity, 100],
  [-99, 1],
  [-0, 1],
  [0, 1],
  [0.99, 1],
  [1, 1],
  [1.99, 1],
  [99.99, 99],
  [100, 100],
  [199.99, 199],
  [200, 200],
  [200.99, 200],
  [201, 200],
  [Number.MAX_VALUE, 200],
  [Number.MIN_VALUE, 1],
];
for (const [input, expected] of maxCases)
  test(`max normalization input=${String(input)} expected=${expected}`, async () => {
    const s = f.fixture();
    const result = await s.repo.getCommitGraph(workspace, input as number, 7);
    assert.deepEqual(s.commands, [
      { cwd: repoRoot, args: argv(expected, 7), timeoutMs: 15000, maxOutputBytes: 524288 },
    ]);
    assert.equal(result.resolution, resolution);
    assert.deepEqual(result.commits, []);
    assert.equal(result.hasMore, false);
    assert.deepEqual(Object.keys(s.commands[0]!), ["cwd", "args", "timeoutMs", "maxOutputBytes"]);
    assert.deepEqual(Object.keys(result), ["resolution", "commits", "hasMore"]);
  });
const skipCases: [unknown, number][] = [
  [undefined, 0],
  [null, 0],
  ["7", 0],
  [true, 0],
  [{}, 0],
  [new Number(7), 0],
  [NaN, 0],
  [Infinity, 0],
  [-Infinity, 0],
  [-99, 0],
  [-0, 0],
  [0, 0],
  [0.99, 0],
  [1, 1],
  [1.99, 1],
  [200.9, 200],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  [Number.MAX_VALUE, Number.MAX_VALUE],
  [Number.MIN_VALUE, 0],
];
for (const [input, expected] of skipCases)
  test(`skip normalization input=${String(input)} expected=${expected}`, async () => {
    const s = f.fixture();
    await s.repo.getCommitGraph(workspace, 7, input as number);
    assert.deepEqual(s.commands[0]!.args, argv(7, expected));
  });
for (const [available, repository] of [
  [false, false],
  [false, true],
  [true, false],
])
  test(`unavailable short-circuits graph available=${available} repo=${repository}`, async () => {
    const own = Object.freeze({
      ...resolution,
      isGitAvailable: available,
      isRepository: repository,
    });
    const s = f.fixture({ resolve: () => own });
    const result = await s.repo.getCommitGraph(workspace, {} as number, {} as number);
    assert.equal(result.resolution, own);
    assert.deepEqual(result.commits, []);
    assert.equal(result.hasMore, false);
    assert.deepEqual(s.trace, [["resolve", workspace]]);
    assert.equal(s.commands.length, 0);
  });
test("availability and provider/request/result getters retain exact read order", async () => {
  const trace: string[] = [];
  const own = new Proxy(resolution, {
    get(target, key) {
      trace.push(`resolution.${String(key)}`);
      return Reflect.get(target, key);
    },
  });
  const result = new Proxy(commandResult({ stdout: record() }), {
    get(target, key) {
      trace.push(`result.${String(key)}`);
      return Reflect.get(target, key);
    },
  });
  const s = f.fixture({ resolve: () => own, result });
  const run = s.provider.run;
  Object.defineProperty(s.provider, "run", {
    get() {
      trace.push("provider.run");
      return run;
    },
  });
  const got = await s.repo.getCommitGraph(workspace, 1, 0);
  assert.deepEqual(trace, [
    "resolution.then",
    "resolution.then",
    "resolution.isGitAvailable",
    "resolution.isRepository",
    "provider.run",
    "resolution.repoRoot",
    "result.then",
    "result.exitCode",
    "result.stdout",
  ]);
  assert.equal(got.resolution, own);
});
test("false Git availability never reads repository/root", async () => {
  const own = { ...resolution, isGitAvailable: false };
  Object.defineProperty(own, "isRepository", {
    get() {
      assert.fail("repository admission read");
    },
  });
  Object.defineProperty(own, "repoRoot", {
    get() {
      assert.fail("root read");
    },
  });
  const s = f.fixture({ resolve: () => own });
  await s.repo.getCommitGraph(workspace);
  assert.equal(s.commands.length, 0);
});
for (const boundary of ["resolve", "run"] as const)
  for (const mode of ["throw", "reject"] as const)
    test(`${boundary} ${mode} propagates the same failure without retries`, async () => {
      const failure = new Error(`owned ${boundary} ${mode}`);
      const port = () => {
        if (mode === "throw") throw failure;
        return Promise.reject(failure);
      };
      const s = f.fixture({ [boundary]: port });
      await assert.rejects(s.repo.getCommitGraph(workspace), (e) => e === failure);
      assert.equal(s.commands.length, boundary === "run" ? 1 : 0);
    });
for (const stderr of [
  "fatal: Does Not Have Any Commits Yet",
  "YOUR CURRENT BRANCH owns no commits",
  "fatal: bad default revision",
  "fatal: AMBIGUOUS ARGUMENT 'HEAD'",
])
  for (const flags of [{}, { timedOut: true, outputTruncated: true }])
    test(`unborn phrase ${stderr} flags=${JSON.stringify(flags)}`, async () => {
      const result = commandResult({ exitCode: 128, stderr, ...flags });
      Object.defineProperty(result, "stdout", {
        get() {
          assert.fail("unborn stdout read");
        },
      });
      const s = f.fixture({ result });
      assert.deepEqual(await s.repo.getCommitGraph(workspace), {
        resolution,
        commits: [],
        hasMore: false,
      });
    });
for (const [result, message] of [
  [
    commandResult({ exitCode: 1, stderr: "owned fatal" }),
    "git log visible refs failed: owned fatal",
  ],
  [commandResult({ exitCode: null, stderr: "" }), "git log visible refs failed: exitCode=null"],
  [
    commandResult({ exitCode: 2, stdout: "owned stdout", stderr: "" }),
    "git log visible refs failed: owned stdout",
  ],
  [
    commandResult({
      exitCode: 1,
      timedOut: true,
      outputTruncated: true,
      timeoutMs: 15000,
      durationMs: 17,
      timeoutElapsedMs: 15,
      timeoutCloseDelayMs: 2,
      forceKillAttempted: true,
      orphaned: true,
    }),
    "git log visible refs timed out after 15000ms (elapsed=17ms, killAt=15ms, cleanup=2ms, forceKill=true, orphaned=true)",
  ],
  [
    commandResult({ exitCode: 1, outputTruncated: true }),
    "git log visible refs output exceeded limit",
  ],
] as const)
  test(`failure precedence ${message}`, async () => {
    const s = f.fixture({ result });
    await assert.rejects(
      s.repo.getCommitGraph(workspace),
      (e) => e instanceof Error && e.message === message && !("cause" in e),
    );
  });
for (const flags of [
  { timedOut: true },
  { outputTruncated: true },
  { timedOut: true, outputTruncated: true },
])
  test(`legacy successful exit ignores synthetic failure flags ${JSON.stringify(flags)}`, async () => {
    const s = f.fixture({ result: commandResult({ stdout: record(), ...flags }) });
    assert.equal((await s.repo.getCommitGraph(workspace)).commits.length, 1);
  });
test("deferred resolution and command preserve await boundaries; graph has no cache", async () => {
  const res = deferred<typeof resolution>(),
    run = deferred<ReturnType<typeof commandResult>>();
  const s = f.fixture({ resolve: () => res.promise, run: () => run.promise });
  const pending = s.repo.getCommitGraph(workspace, 2, 1);
  assert.equal(s.commands.length, 0);
  res.resolve(resolution);
  for (let n = 0; n < 4; n++) await Promise.resolve();
  assert.equal(s.commands.length, 1);
  run.resolve(commandResult({ stdout: record() }));
  assert.equal((await pending).commits.length, 1);
  await s.repo.getCommitGraph(workspace, 2, 1);
  assert.equal(s.commands.length, 2);
});
test("actual unchanged resolution forwards fixed argv and returned repo root", async () => {
  const root = "owned synthetic alternate root";
  const s = f.fixture({
    actualResolution: true,
    run: (command) =>
      command.args[0] === "rev-parse"
        ? commandResult({ stdout: `${root}\r\nowned-subdir/\r\n${root}/.git\r\n${root}/.git\r\n` })
        : commandResult({ stdout: record() }),
  });
  const result = await s.repo.getCommitGraph(workspace, 1, 4);
  assert.deepEqual(s.trace, ["binary", "run", "run"]);
  assert.deepEqual(s.commands[0], {
    cwd: workspace,
    args: [
      "rev-parse",
      "--show-toplevel",
      "--show-prefix",
      "--absolute-git-dir",
      "--git-common-dir",
    ],
    timeoutMs: 15000,
  });
  assert.equal(result.resolution.repoRoot, root);
  assert.equal(s.commands[1]!.cwd, root);
  assert.deepEqual(s.commands[1]!.args, argv(1, 4));
});
test("unrelated defaults and native filesystem ports are never acquired", async () => {
  const s = f.fixture({ result: commandResult({ stdout: record() }) });
  await s.repo.getCommitGraph("--owned-workspace-that-is-not-a-repo");
  assert.deepEqual(s.trace, [["resolve", "--owned-workspace-that-is-not-a-repo"], "run"]);
  assert.deepEqual(f.logs, []);
});

for (const value of [undefined, null])
  test(`malformed command response ${value} retains exitCode TypeError`, async () => {
    const s = f.fixture({ run: () => value as never });
    await assert.rejects(
      s.repo.getCommitGraph(workspace),
      (error) =>
        error instanceof TypeError &&
        error.message === `Cannot read properties of ${value} (reading 'exitCode')`,
    );
  });
for (const field of ["stderr", "stdout"] as const)
  test(`malformed ${field} retains exact operation TypeError`, async () => {
    const result = commandResult({ exitCode: field === "stderr" ? 1 : 0, [field]: null as never });
    const s = f.fixture({ result });
    await assert.rejects(
      s.repo.getCommitGraph(workspace),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          `Cannot read properties of null (reading '${field === "stderr" ? "toLowerCase" : "split"}')`,
    );
  });
test("failed command reads unborn stderr before timeout validation and never stdout", async () => {
  const trace: string[] = [];
  const result = new Proxy(
    commandResult({ exitCode: 1, stderr: "owned failure", timedOut: true }),
    {
      get(target, key) {
        trace.push(String(key));
        return Reflect.get(target, key);
      },
    },
  );
  await assert.rejects(
    f.fixture({ result }).repo.getCommitGraph(workspace),
    /timed out after 7ms \(elapsed=7ms\)/,
  );
  assert.deepEqual(trace, [
    "then",
    "exitCode",
    "stderr",
    "timedOut",
    "timeoutMs",
    "durationMs",
    "durationMs",
    "timeoutElapsedMs",
    "timeoutCloseDelayMs",
    "forceKillAttempted",
    "orphaned",
  ]);
});
test("concurrent graph requests independently issue one command and preserve page/result ownership", async () => {
  const first = deferred<ReturnType<typeof commandResult>>(),
    second = deferred<ReturnType<typeof commandResult>>();
  const s = f.fixture({
    run: (command) => (command.args[7] === "--skip=0" ? first.promise : second.promise),
  });
  const a = s.repo.getCommitGraph(workspace, 1, 0),
    b = s.repo.getCommitGraph(workspace, 2, 1);
  for (let n = 0; n < 4; n++) await Promise.resolve();
  assert.equal(s.commands.length, 2);
  second.resolve(commandResult({ stdout: record("b") }));
  assert.equal((await b).commits[0]!.hash, "b");
  first.resolve(commandResult({ stdout: record("a") + record("overflow") }));
  const got = await a;
  assert.equal(got.commits[0]!.hash, "a");
  assert.equal(got.hasMore, true);
});
