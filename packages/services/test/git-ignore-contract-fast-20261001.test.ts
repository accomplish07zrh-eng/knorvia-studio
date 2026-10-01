import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  ignoreFixture,
  root,
  workspace,
  result,
  revOutput,
  deferred,
} from "./git-ignore-fixture-fast-20261001.js";
const f = await ignoreFixture();
const abs = (path: string) => resolve(workspace, path);
test("empty input never reads resolver", async () => {
  const s = f.fixture();
  Object.defineProperty(s.repo, "resolveRepository", { get: () => assert.fail("empty read") });
  assert.deepEqual(await s.repo.getIgnoredPaths(workspace, []), []);
  assert.deepEqual(s.trace, []);
});
for (const available of [false, true])
  test(`unavailable/not repo available=${available}`, async () => {
    const s = f.fixture({
      binary: () => (available ? "owned" : null),
      run: () => result({ exitCode: 128, stderr: "not a git repository" }),
    });
    assert.deepEqual(await s.repo.getIgnoredPaths(workspace, ["item"]), []);
    assert.equal(
      s.trace.some((x) => Array.isArray(x) && x[0] === "realpath"),
      false,
    );
  });
for (const paths of [[], ["../.."], [".."], [root], ["../../../outside", "../.."]])
  test(`empty or outside scope ${JSON.stringify(paths)}`, async () => {
    const s = f.fixture();
    assert.deepEqual(await s.repo.getIgnoredPaths(workspace, paths), []);
    assert.equal(
      s.commands.some((c) => c.args[0] === "check-ignore"),
      false,
    );
  });
for (const newline of ["\n", "\r\n"])
  test(`ordered duplicates, whitespace, flags, unicode, separator ${JSON.stringify(newline)}`, async () => {
    const paths = Object.freeze([
      "--flag",
      " item ",
      "中 文",
      "item",
      "item",
      "../../../outside",
      abs("abs"),
    ]);
    const s = f.fixture({
      run: (c) =>
        result({
          stdout:
            c.args[0] === "rev-parse"
              ? revOutput
              : ["sub/abs", "sub/item", "sub/中 文", "sub/ item ", "sub/--flag", ""].join(newline),
        }),
    });
    assert.deepEqual(
      await s.repo.getIgnoredPaths(workspace, paths as string[]),
      paths.filter((p) => !p.includes("outside")).map((p) => abs(p)),
    );
    assert.deepEqual(s.commands[1], {
      cwd: root,
      args: [
        "check-ignore",
        "--",
        "sub/--flag",
        "sub/ item ",
        "sub/中 文",
        "sub/item",
        "sub/item",
        "sub/abs",
      ],
      timeoutMs: 15000,
      maxOutputBytes: 524288,
    });
    assert.equal(paths.length, 7);
  });
const outputs: [string, string[]][] = [
  ["sub\\item\n", [abs("item")]],
  ["sub/item\nsub/item\n", [abs("item")]],
  ["sub/item\0", []],
  ['"sub/item"\n', []],
  [" sub/item\n", []],
  ["sub/item \n", []],
  ["sub/item\r", []],
  ["\n\r\n", []],
  ["sub/item\n../outside\n", [abs("item")]],
  ["sub/item\nsub/--flag\n", [abs("--flag"), abs("item")]],
];
for (const [stdout, expected] of outputs)
  test(`stdout literal parser ${JSON.stringify(stdout)}`, async () => {
    const s = f.fixture({
      run: (c) => result({ stdout: c.args[0] === "rev-parse" ? revOutput : stdout }),
    });
    assert.deepEqual(await s.repo.getIgnoredPaths(workspace, ["--flag", "item"]), expected);
  });
for (const flags of [
  {},
  { timedOut: true },
  { outputTruncated: true },
  { timedOut: true, outputTruncated: true },
])
  test(`exit1 early empty ${JSON.stringify(flags)}`, async () => {
    const s = f.fixture({
      run: (c) =>
        c.args[0] === "rev-parse"
          ? result({ stdout: revOutput })
          : result({ exitCode: 1, stdout: "sub/item\n", ...flags }),
    });
    assert.deepEqual(await s.repo.getIgnoredPaths(workspace, ["item"]), []);
  });
for (const [values, message] of [
  [{ timedOut: true, outputTruncated: true }, "git check-ignore timed out after 7ms (elapsed=7ms)"],
  [{ outputTruncated: true }, "git check-ignore output exceeded limit"],
  [{ exitCode: 128, stderr: "owned stderr" }, "git check-ignore failed: owned stderr"],
  [{ exitCode: 128, stderr: "", stdout: "owned stdout" }, "git check-ignore failed: owned stdout"],
  [{ exitCode: null, stderr: "owned null" }, "git check-ignore failed: owned null"],
] as const)
  test(`exact command failure ${message}`, async () => {
    const s = f.fixture({
      run: (c) => (c.args[0] === "rev-parse" ? result({ stdout: revOutput }) : result(values)),
    });
    await assert.rejects(s.repo.getIgnoredPaths(workspace, ["item"]), { message });
  });
for (const port of ["binary", "resolution", "command"] as const)
  for (const sync of [false, true])
    test(`port ${port} throw sync=${sync}`, async () => {
      const error = new Error("owned exact rejection");
      const fail = () => {
        if (sync) throw error;
        return Promise.reject(error);
      };
      const s = f.fixture({
        binary: port === "binary" ? fail : undefined,
        run: (c) =>
          port === "resolution" || c.args[0] === "check-ignore"
            ? fail()
            : result({ stdout: revOutput }),
      });
      await assert.rejects(s.repo.getIgnoredPaths(workspace, ["item"]), (e) => e === error);
    });
test("realpath rejection falls back; synchronous throw omitted, outside symlink omitted", async () => {
  const s = f.fixture({
    realpath: (p) => {
      if (p === abs("throw")) throw new Error("owned sync");
      if (p === abs("reject")) return Promise.reject(new Error("owned async"));
      if (p === abs("outside")) return resolve(root, "..", "outside");
      return p;
    },
    run: (c) => result({ stdout: c.args[0] === "rev-parse" ? revOutput : "sub/reject\nsub/ok\n" }),
  });
  assert.deepEqual(await s.repo.getIgnoredPaths(workspace, ["throw", "reject", "outside", "ok"]), [
    abs("reject"),
    abs("ok"),
  ]);
  assert.deepEqual(s.commands[1]!.args, ["check-ignore", "--", "sub/reject", "sub/ok"]);
});
test("parallel realpath reverse completion retains original display path and order", async () => {
  const a = deferred<string>(),
    b = deferred<string>(),
    started = deferred<void>();
  let n = 0;
  const s = f.fixture({
    realpath: () => {
      if (++n === 2) started.resolve();
      return n === 1 ? a.promise : b.promise;
    },
    run: (c) =>
      result({
        stdout: c.args[0] === "rev-parse" ? revOutput : "sub/resolved-b\nsub/resolved-a\n",
      }),
  });
  const pending = s.repo.getIgnoredPaths(workspace, ["a", "b"]);
  await started.promise;
  b.resolve(abs("resolved-b"));
  a.resolve(abs("resolved-a"));
  assert.deepEqual(await pending, [abs("a"), abs("b")]);
  assert.deepEqual(s.commands[1]!.args, ["check-ignore", "--", "sub/resolved-a", "sub/resolved-b"]);
});
test("sparse/malformed item inputs omit individual failures", async () => {
  const paths: string[] = [];
  paths.length = 4;
  paths[1] = null as never;
  paths[3] = "item";
  const s = f.fixture();
  assert.deepEqual(await s.repo.getIgnoredPaths(workspace, paths), [abs("item")]);
  assert.deepEqual(s.commands[1]!.args, ["check-ignore", "--", "sub/item"]);
});
for (const variant of ["input-map", "resolution-getters", "result-getters"])
  test(`frozen getter/error order ${variant}`, async () => {
    async function observe(legacy: boolean) {
      const trace: string[] = [],
        s = f.fixture({}, legacy),
        error = new Error("owned getter");
      let paths = ["item"];
      if (variant === "input-map")
        paths = new Proxy(paths, {
          get(t, k) {
            trace.push(String(k));
            if (k === "map") throw error;
            return Reflect.get(t, k);
          },
        });
      if (variant === "resolution-getters") {
        const resolution = await s.repo.resolveRepository(workspace);
        s.repo.resolveRepository = function () {
          assert.equal(this, s.repo);
          trace.push("resolver");
          return Promise.resolve(
            new Proxy(resolution, {
              get(t, k) {
                trace.push(String(k));
                return Reflect.get(t, k);
              },
            }),
          );
        };
      }
      if (variant === "result-getters")
        s.provider.run = function (c) {
          assert.equal(this, s.provider);
          const value = result({ stdout: c.args[0] === "rev-parse" ? revOutput : "sub/item\n" });
          return c.args[0] === "rev-parse"
            ? value
            : new Proxy(value, {
                get(t, k) {
                  trace.push(String(k));
                  return Reflect.get(t, k);
                },
              });
        };
      try {
        return { trace, value: await s.repo.getIgnoredPaths(workspace, paths) };
      } catch (e) {
        assert.equal(e, error);
        return { trace, error: (e as Error).message };
      }
    }
    assert.deepEqual(await observe(false), await observe(true));
  });
