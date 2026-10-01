import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  checkpointConflictsFixture,
  root,
  meta,
  tree,
  fileStat,
  result,
  deferred,
} from "./checkpoint-conflicts-fixture-fast-20261001.js";
const f = await checkpointConflictsFixture();
const params = (affectedRepoPaths: string[]) => ({
  repoRoot: root,
  workspaceInRepoPath: "sub",
  from: meta("from"),
  affectedRepoPaths,
});
const conflict = (path: string, reason: string) => ({
  path: resolve(root, ...path.replaceAll("\\", "/").split("/")),
  repoRelativePath: path,
  workspaceRelativePath: path.replaceAll("\\", "/").replace(/^sub\//, ""),
  reason,
});

test("empty scanner returns without command or filesystem effects", async () => {
  for (const legacy of [false, true]) {
    const s = f.fixture({}, legacy);
    assert.deepEqual(await s.scan(params([])), []);
    assert.deepEqual(s.trace, []);
  }
});
test("ordered presence/type/hash classification and exact read options", async () => {
  const names = [
    "unexpected",
    "absent",
    "missing",
    "directory",
    "symlink",
    "mismatch",
    "matched",
  ].map((n) => `sub/${n}`);
  for (const legacy of [false, true]) {
    const methods: unknown[] = [];
    const s = f.fixture(
      {
        run: (c) =>
          result({
            stdout:
              c.args[0] === "ls-tree"
                ? names
                    .slice(2)
                    .map((p) => tree(p, p.endsWith("symlink") ? "120000" : "100644"))
                    .join("")
                : c.args[2]!.endsWith("matched")
                  ? " owned-match \r\n"
                  : "owned-different",
          }),
        lstat: (p) => {
          if (p.endsWith("absent") || p.endsWith("missing")) throw new Error("owned lstat failure");
          return fileStat(p.endsWith("directory"), false, methods);
        },
      },
      legacy,
    );
    assert.deepEqual(await s.scan(params(names)), [
      conflict(names[0]!, "unexpected-file-in-worktree"),
      conflict(names[2]!, "missing-in-worktree"),
      conflict(names[3]!, "type-mismatch"),
      conflict(names[4]!, "type-mismatch"),
      conflict(names[5]!, "content-mismatch"),
    ]);
    assert.deepEqual(s.commands[0], {
      cwd: root,
      args: ["ls-tree", "-r", "-z", "owned-from", "--", ...names],
    });
    assert.deepEqual(
      s.commands.slice(1),
      ["mismatch", "matched"].map((n) => ({
        cwd: root,
        args: ["hash-object", "--no-filters", resolve(root, "sub", n)],
      })),
    );
    assert.deepEqual(
      s.trace.filter((e) => Array.isArray(e) && e[0] === "lstat").map((e) => (e as string[])[1]),
      names.map((p) => resolve(root, p)),
    );
    assert.deepEqual(methods, ["directory", "directory", "symlink", "directory", "directory"]);
  }
});
test("duplicate conflicts keep first position/latest value and matching reads do not erase", async () => {
  for (const legacy of [false, true]) {
    let a = 0;
    const s = f.fixture(
      {
        run: (c) =>
          result({
            stdout: c.args[0] === "ls-tree" ? tree("sub/a") + tree("sub/b") : "owned-match",
          }),
        lstat: (p) => {
          if (p.endsWith("a") && ++a === 1) throw new Error("owned missing");
          return fileStat(p.endsWith("b") || a === 2);
        },
      },
      legacy,
    );
    assert.deepEqual(await s.scan(params(["sub/a", "sub/b", "sub/a", "sub/a"])), [
      conflict("sub/a", "type-mismatch"),
      conflict("sub/b", "type-mismatch"),
    ]);
    assert.equal(s.commands.filter((c) => c.args[0] === "hash-object").length, 1);
    assert.equal(a, 3);
  }
});
test("wire/path spellings, malformed tree records and raw identity remain lexical", async () => {
  const paths = ['sub/--文\t"quoted"\r\n', "sub\\windows", "sub/./dots"];
  for (const legacy of [false, true]) {
    const s = f.fixture(
      {
        run: () => result({ stdout: "malformed\0mode too-short\tignored\0" + tree("sub/windows") }),
        lstat: () => fileStat(),
      },
      legacy,
    );
    assert.deepEqual(
      await s.scan(params(paths)),
      paths.map((p) => conflict(p, "unexpected-file-in-worktree")),
    );
    assert.equal(s.commands.length, 1);
  }
});
test("tree/hash failure priority and prose stop later reads", async () => {
  for (const phase of ["ls-tree", "hash-object"])
    for (const kind of ["timeout", "truncated", "exit"])
      for (const legacy of [false, true]) {
        const s = f.fixture(
          {
            run: (c) =>
              c.args[0] === phase
                ? result({
                    timedOut: kind === "timeout",
                    outputTruncated: kind !== "exit",
                    timeoutMs: 3,
                    exitCode: 1,
                    stderr: "owned failure",
                  })
                : result({ stdout: tree("sub/a") + tree("sub/later") }),
          },
          legacy,
        );
        const label =
          phase === "ls-tree"
            ? "git ls-tree checkpoint paths"
            : "git hash-object checkpoint verify";
        await assert.rejects(s.scan(params(["sub/a", "sub/later"])), {
          message:
            kind === "timeout"
              ? `${label} timed out after 3ms (elapsed=7ms)`
              : kind === "truncated"
                ? `${label} output exceeded limit`
                : `${label} failed: owned failure`,
        });
        assert.equal(
          s.trace.filter((e) => Array.isArray(e) && e[0] === "lstat").length,
          phase === "ls-tree" ? 0 : 1,
        );
      }
});
test("thrown command/type methods escape with identity; missing probes stay swallowed", async () => {
  const error = new Error("owned throwing port", { cause: "owned synthetic cause" });
  for (const phase of ["tree", "hash", "directory", "symlink"])
    for (const legacy of [false, true]) {
      const s = f.fixture(
        {
          run: (c) => {
            if (
              (phase === "tree" && c.args[0] === "ls-tree") ||
              (phase === "hash" && c.args[0] === "hash-object")
            )
              throw error;
            return result({ stdout: tree("sub/a", "120000") });
          },
          lstat: () => ({
            isDirectory() {
              if (phase === "directory") throw error;
              return false;
            },
            isSymbolicLink() {
              if (phase === "symlink") throw error;
              return true;
            },
          }),
        },
        legacy,
      );
      await assert.rejects(s.scan(params(["sub/a", "sub/later"])), (e) => e === error);
      assert.ok(
        !s.trace.some(
          (e) => Array.isArray(e) && e[0] === "lstat" && String(e[1]).endsWith("later"),
        ),
      );
    }
});
test("tree completion reads current paths and workspace prefix lazily", async () => {
  async function observe(legacy: boolean) {
    const gate = deferred<ReturnType<typeof result>>(),
      p = params(["sub/original"]),
      events: unknown[] = [];
    Object.defineProperty(p, "workspaceInRepoPath", {
      get() {
        events.push("prefix");
        return "sub";
      },
    });
    const s = f.fixture(
      {
        run: () => gate.promise,
        lstat: (path) => {
          events.push(["probe", path]);
          return fileStat();
        },
      },
      legacy,
    );
    const pending = s.scan(p);
    p.affectedRepoPaths.push("sub/late");
    assert.deepEqual(events, []);
    gate.resolve(result({ stdout: "" }));
    const output = await pending;
    assert.deepEqual(output, [
      conflict("sub/original", "unexpected-file-in-worktree"),
      conflict("sub/late", "unexpected-file-in-worktree"),
    ]);
    assert.deepEqual(s.commands[0]!.args, [
      "ls-tree",
      "-r",
      "-z",
      "owned-from",
      "--",
      "sub/original",
    ]);
    return { output, events, trace: s.trace };
  }
  assert.deepEqual(await observe(false), await observe(true));
});
test("queued/reentrant independent scans preserve settlement and effect ordering", async () => {
  async function observe(legacy: boolean, reentrant: boolean, reject: boolean) {
    const gate = deferred<ReturnType<typeof result>>(),
      events: unknown[] = [];
    let first = true,
      second!: Promise<unknown>,
      s!: ReturnType<typeof f.fixture>;
    const settle = (label: string, p: Promise<unknown>) =>
      p.then(
        (v) => events.push([label, v]),
        (e) => events.push([label, e.message]),
      );
    const start = () => {
      events.push("second-start");
      second = settle("second", s.scan({ ...params(["sub/b"]), from: meta("second") }));
    };
    s = f.fixture(
      {
        run: (c) => {
          if (first) {
            first = false;
            if (reentrant) start();
            else queueMicrotask(start);
            return gate.promise;
          }
          return result({ stdout: c.args[0] === "ls-tree" ? tree("sub/b") : "owned-match" });
        },
      },
      legacy,
    );
    const one = settle("first", s.scan(params(["sub/a"])));
    await Promise.resolve();
    if (reject) gate.reject(new Error("owned late tree rejection"));
    else gate.resolve(result({ stdout: "" }));
    await Promise.all([one, second]);
    assert.equal(s.commands.filter((c) => c.args[0] === "ls-tree").length, 2);
    return { events, trace: s.trace, commands: s.commands };
  }
  for (const reentrant of [false, true])
    for (const reject of [false, true])
      assert.deepEqual(
        await observe(false, reentrant, reject),
        await observe(true, reentrant, reject),
      );
});
