import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localBranchesFixture,
  result,
  workspace,
  root,
  deferred,
} from "./git-local-branches-fixture-fast-20261001.js";
const f = await localBranchesFixture();
const record = (name: string, seconds = "1", upstream = "", hash = "") =>
  [name, upstream, hash, seconds].join("\u0000");
for (const available of [false, true])
  test(`local branches unavailable ${available}`, async () => {
    const s = f.fixture(),
      status = f.status();
    status.resolution.isGitAvailable = available;
    status.resolution.isRepository = false;
    s.repo.getStatus = async function (w) {
      assert.equal(this, s.repo);
      assert.equal(w, workspace);
      return status;
    };
    assert.deepEqual(await s.repo.listLocalBranches(workspace), {
      headRefType: "branch",
      currentBranchName: "owned-main",
      branches: [],
    });
    assert.equal(s.commands.length, 0);
  });
test("exact argv/cwd/timeouts and record output", async () => {
  const s = f.fixture({
    run: () => result({ stdout: record("owned-main", "123", "owned/upstream", "ownedhash") }),
  });
  s.repo.getStatus = async () => f.status();
  assert.deepEqual(await s.repo.listLocalBranches(workspace), {
    headRefType: "branch",
    currentBranchName: "owned-main",
    branches: [
      {
        name: "owned-main",
        isCurrent: true,
        upstreamName: "owned/upstream",
        commitHash: "ownedhash",
        commitTimestampMs: 123000,
      },
    ],
  });
  assert.deepEqual(s.commands, [
    {
      cwd: root,
      args: [
        "for-each-ref",
        "refs/heads",
        "--format=%(refname:short)%00%(upstream:short)%00%(objectname)%00%(committerdate:unix)",
      ],
      timeoutMs: 15000,
      maxOutputBytes: 524288,
    },
  ]);
});
const timestamps = [
  "",
  "0",
  "-2",
  " 7",
  "12tail",
  "0x20",
  "+4",
  "NaN",
  "Infinity",
  "1.8",
  "9e3",
  "9".repeat(400),
];
for (const seconds of timestamps)
  test(`timestamp preserved ${JSON.stringify(seconds)}`, async () => {
    const s = f.fixture({ run: () => result({ stdout: record("owned-main", seconds) }) });
    s.repo.getStatus = async () => f.status();
    const value = (await s.repo.listLocalBranches(workspace)).branches[0]!;
    const parsed = seconds ? Number.parseInt(seconds, 10) : Number.NaN;
    assert.equal(value.commitTimestampMs, Number.isNaN(parsed) ? null : parsed * 1000);
  });
for (const headRefType of ["branch", "detached", "unborn", "unknown"] as const)
  test(`current matching ${headRefType}`, async () => {
    const s = f.fixture({
        run: () => result({ stdout: record("owned-main", "1") + "\n" + record("other", "2") }),
      }),
      status = f.status();
    status.summary.headRefType = headRefType as never;
    s.repo.getStatus = async () => status;
    const branches = (await s.repo.listLocalBranches(workspace)).branches;
    assert.equal(branches[0]!.name, headRefType === "branch" ? "owned-main" : "other");
    assert.equal(
      branches.some((b) => b.isCurrent),
      headRefType === "branch",
    );
  });
const outputs = [
  "",
  "\n\r\n",
  "\u0000ignored\u0000hash\u00001",
  "single",
  " spaced \u0000up stream\u0000bad-hash\u0000x",
  "a\u0000u\u0000h\u00001\u0000extra\u0000ignored",
  "a\rb\u0000u\u0000h\u00001",
  "中文🚀\u0000远程\\分支\u0000hash\u00002",
  "flag--\u0000\u0000\u0000-1\x1e",
  "a\npart\u0000up\u0000hash\u00002",
];
for (const stdout of outputs)
  test(`literal malformed/delimiter records ${JSON.stringify(stdout)}`, async () => {
    async function observe(legacy: boolean) {
      const s = f.fixture({ run: () => result({ stdout }) }, legacy);
      s.repo.getStatus = async () => f.status();
      return s.repo.listLocalBranches(workspace);
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
for (const lineEnd of ["\n", "\r\n"])
  test(`stable current/time/locale/duplicate order ${JSON.stringify(lineEnd)}`, async () => {
    const rows = [
      record("z", "7", "first"),
      record("a", "7"),
      record("owned-main", "-2"),
      record("z", "7", "second"),
      record("none", ""),
      record("old", "-4"),
    ];
    const s = f.fixture({ run: () => result({ stdout: rows.join(lineEnd) }) });
    s.repo.getStatus = async () => f.status();
    const values = (await s.repo.listLocalBranches(workspace)).branches;
    assert.deepEqual(
      values.map((b) => b.name),
      ["owned-main", "a", "z", "z", "old", "none"],
    );
    assert.deepEqual(
      values.filter((b) => b.name === "z").map((b) => b.upstreamName),
      ["first", "second"],
    );
  });
for (const [flags, message] of [
  [
    { timedOut: true, outputTruncated: true },
    "git for-each-ref refs/heads timed out after 7ms (elapsed=7ms)",
  ],
  [{ outputTruncated: true }, "git for-each-ref refs/heads output exceeded limit"],
  [{ exitCode: 1, stderr: "owned stderr" }, "git for-each-ref refs/heads failed: owned stderr"],
  [{ exitCode: 128, stdout: "owned stdout" }, "git for-each-ref refs/heads failed: owned stdout"],
] as const)
  test(`exact failure ${message}`, async () => {
    const s = f.fixture({ run: () => result(flags) });
    s.repo.getStatus = async () => f.status();
    await assert.rejects(s.repo.listLocalBranches(workspace), { message });
  });
for (const port of ["status", "command"] as const)
  for (const sync of [true, false])
    test(`${port} rejects sync=${sync}`, async () => {
      const error = new Error("owned exact failure"),
        fail = () => {
          if (sync) throw error;
          return Promise.reject(error);
        };
      const s = f.fixture({ run: fail });
      s.repo.getStatus = function () {
        assert.equal(this, s.repo);
        return (port === "status" ? fail() : Promise.resolve(f.status())) as never;
      };
      await assert.rejects(s.repo.listLocalBranches(workspace), (e) => e === error);
    });
test("delayed command awaits only after status", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    started = deferred<void>();
  const s = f.fixture({
    run: () => {
      started.resolve();
      return gate.promise;
    },
  });
  s.repo.getStatus = async () => f.status();
  const p = s.repo.listLocalBranches(workspace);
  await started.promise;
  gate.resolve(result({ stdout: record("a") }));
  assert.equal((await p).branches[0]!.name, "a");
});
for (const unavailable of [false, true])
  test(`frozen receiver/getter order unavailable=${unavailable}`, async () => {
    async function observe(legacy: boolean) {
      const trace: string[] = [],
        s = f.fixture(
          {
            run: () =>
              new Proxy(result({ stdout: record("owned-main") }), {
                get(t, k) {
                  trace.push("result:" + String(k));
                  return Reflect.get(t, k);
                },
              }),
          },
          legacy,
        ),
        status = f.status();
      status.resolution.isRepository = !unavailable;
      for (const key of ["resolution", "summary"] as const)
        status[key] = new Proxy(status[key], {
          get(t, k) {
            trace.push(key + ":" + String(k));
            return Reflect.get(t, k);
          },
        }) as never;
      s.repo.getStatus = function (w) {
        assert.equal(this, s.repo);
        trace.push("status:" + w);
        return Promise.resolve(
          new Proxy(status, {
            get(t, k) {
              trace.push(String(k));
              return Reflect.get(t, k);
            },
          }),
        );
      };
      return { trace, value: await s.repo.listLocalBranches(workspace) };
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
