import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  untrackedStatsFixture,
  entry,
  root,
  workspace,
  deferred,
} from "./git-untracked-stats-fixture-fast-20261001.js";

const f = await untrackedStatsFixture();
const path = resolve(root, "sub/owned.txt");
const max = f.config.GIT_UNTRACKED_STAT_MAX_BYTES;
const chunkSize = f.config.GIT_UNTRACKED_STAT_CHUNK_BYTES;
function io(chunks: Buffer[], phase = "", info = { size: 0, isFile: () => true }) {
  const events: unknown[] = [];
  const readError = new Error("owned read/stat/open failure");
  const closeError = new Error("owned close failure");
  let index = 0;
  const file = {
    read(buffer: Buffer, offset: number, length: number, position: unknown) {
      assert.equal(this, file);
      assert.equal(offset, 0);
      assert.equal(position, null);
      assert.ok(length <= buffer.length);
      events.push(["read", buffer.length, length]);
      if (phase === "read" || phase === "read+close") throw readError;
      if (phase === "read-reject") return Promise.reject(readError);
      const content = chunks[index++] ?? Buffer.alloc(0);
      assert.ok(content.length <= length);
      content.copy(buffer);
      return { bytesRead: content.length };
    },
    close() {
      assert.equal(this, file);
      events.push("close");
      if (phase === "close" || phase === "read+close") throw closeError;
      if (phase === "close-reject") return Promise.reject(closeError);
    },
  };
  const options = {
    stat() {
      if (phase === "stat") throw readError;
      return info;
    },
    open(_p: string, flags: string) {
      assert.equal(flags, "r");
      if (phase === "open") throw readError;
      return file;
    },
  };
  return { options, events, readError, closeError };
}

for (const [name, texts, expected] of [
  ["empty", [], 0],
  ["unterminated", ["owned"], 1],
  ["LF", ["a\nb\n"], 2],
  ["CRLF across short reads", ["a\r", "\nb\r", "\n"], 2],
  ["bare CR", ["a\rb\r"], 1],
  ["last-byte charge", ["\n\n", "c"], 3],
  ["binary later chunk", ["a\n", "b\0"], 0],
  ["UTF-8 is counted as bytes", ["文😀", "\n"], 1],
] as const)
  test(`bounded counter: ${name}`, async () => {
    const snapshots: unknown[] = [];
    for (const count of [f.legacy.countUntrackedFileLines, f.currentCount]) {
      const ports = io(texts.map((text) => Buffer.from(text)));
      const s = f.fixture(ports.options);
      const buffer = Buffer.alloc(8, 0); // stale NUL tail must never enter classification.
      assert.equal(await count(path, buffer), expected);
      assert.equal(ports.events.filter((v) => v === "close").length, 1);
      assert.deepEqual(s.trace, [
        ["stat", path],
        ["open", path, "r"],
      ]);
      snapshots.push(ports.events);
    }
    assert.deepEqual(snapshots[1], snapshots[0]);
  });

for (const [name, size, regular, opens] of [
  ["directory", 1, false, false],
  ["oversized", max + 1, true, false],
  ["equal cap", max, true, true],
  ["zero stat still reads", 0, true, true],
] as const)
  test(`counter stat threshold: ${name}`, async () => {
    for (const count of [f.currentCount, f.legacy.countUntrackedFileLines]) {
      const ports = io([Buffer.from("x")], "", { size, isFile: () => regular });
      const s = f.fixture(ports.options);
      assert.equal(await count(path, Buffer.alloc(8)), opens ? 1 : 0);
      assert.equal(s.trace.length, opens ? 2 : 1);
      assert.equal(ports.events.includes("close"), opens);
    }
  });

for (const growth of [false, true])
  test(`counter exact cap then one-byte probe growth=${growth}`, async () => {
    const block = Buffer.alloc(chunkSize, 65);
    block[chunkSize - 1] = 10;
    const chunks = Array(16).fill(block);
    if (growth) chunks.push(Buffer.from([0]));
    const snapshots: unknown[] = [];
    for (const count of [f.currentCount, f.legacy.countUntrackedFileLines]) {
      const ports = io(chunks);
      f.fixture(ports.options);
      assert.equal(await count(path, Buffer.alloc(chunkSize)), growth ? 0 : 16);
      assert.deepEqual(ports.events.at(-2), ["read", chunkSize, 1]);
      assert.equal(ports.events.length, 18);
      snapshots.push(ports.events);
    }
    assert.deepEqual(snapshots[1], snapshots[0]);
  });

for (const phase of ["stat", "open", "read", "read-reject", "close", "close-reject", "read+close"])
  test(`counter cleanup and builder zero fallback: ${phase}`, async () => {
    for (const legacy of [false, true]) {
      const ports = io([Buffer.from("owned")], phase);
      f.fixture(ports.options);
      const count = legacy ? f.legacy.countUntrackedFileLines : f.currentCount;
      await assert.rejects(
        count(path, Buffer.alloc(8)),
        (e: unknown) => e === (phase.includes("close") ? ports.closeError : ports.readError),
      );
      assert.equal(
        ports.events.filter((v) => v === "close").length,
        ["stat", "open"].includes(phase) ? 0 : 1,
      );
      const failed = io([Buffer.from("owned")], phase),
        good = io([Buffer.from("ok\n")]);
      f.fixture({
        stat: (p) => (p.endsWith("bad") ? failed : good).options.stat(),
        open: (p, flags) => (p.endsWith("bad") ? failed : good).options.open(p, flags),
      });
      const build = legacy ? f.legacy.buildUntrackedStats : f.helpers.buildUntrackedStats;
      const entries = Object.freeze([Object.freeze(entry("bad")), Object.freeze(entry("good"))]);
      const value = await build(root, entries as never);
      assert.deepEqual(value.get("bad"), { added: 0, removed: 0 });
      assert.deepEqual(value.get("good"), { added: 1, removed: 0 });
    }
  });

test("workers keep four buffers, sequential reuse and completion-order map insertion", async () => {
  async function observe(legacy: boolean) {
    const keys = ["a", "b", "c", "d", "e", "f"];
    const ready = keys.map(() => deferred<void>()),
      finish = keys.map(() => deferred<void>());
    const bufferIds = new Map<Buffer, number>(),
      seen: unknown[] = [];
    let active = 0,
      peak = 0;
    const s = f.fixture({
      stat: () => ({ size: 2, isFile: () => true }),
      open(p) {
        const key = keys.indexOf(p.slice(root.length + 1));
        assert.ok(key >= 0);
        peak = Math.max(peak, ++active);
        let calls = 0,
          buffer!: Buffer;
        const file = {
          read(b: Buffer, offset: number, length: number, position: unknown) {
            assert.equal(this, file);
            assert.equal(offset, 0);
            assert.equal(position, null);
            assert.equal(length, chunkSize);
            assert.equal(b.length, chunkSize);
            if (buffer) assert.equal(buffer, b);
            buffer = b;
            if (!bufferIds.has(b)) bufferIds.set(b, bufferIds.size);
            seen.push([keys[key], bufferIds.get(b)]);
            b[0] = 65;
            b[1] = 10;
            return { bytesRead: ++calls === 1 ? 2 : 0 };
          },
          close() {
            assert.equal(this, file);
            ready[key]!.resolve();
            return finish[key]!.promise.then(() => {
              active--;
            });
          },
        };
        return file;
      },
    });
    const build = legacy ? f.legacy.buildUntrackedStats : f.helpers.buildUntrackedStats;
    const p = build(root, [entry("tracked", false), ...keys.map((k) => entry(k))]);
    assert.equal(s.trace.filter((v) => Array.isArray(v) && v[0] === "stat").length, 4);
    await Promise.all(ready.slice(0, 4).map((d) => d.promise));
    finish[1]!.resolve();
    await ready[4]!.promise;
    finish[4]!.resolve();
    await ready[5]!.promise;
    for (const n of [2, 5, 0, 3]) finish[n]!.resolve();
    const value = await p;
    assert.deepEqual([...value.keys()], ["b", "e", "c", "f", "a", "d"]);
    assert.ok([...value.values()].every((v) => v.added === 1 && v.removed === 0));
    assert.equal(peak, 4);
    assert.equal(active, 0);
    assert.equal(bufferIds.size, 4);
    assert.deepEqual(
      seen.filter((v) => (v as string[])[0] === "e"),
      [
        ["e", 1],
        ["e", 1],
      ],
    );
    assert.deepEqual(
      seen.filter((v) => (v as string[])[0] === "f"),
      [
        ["f", 1],
        ["f", 1],
      ],
    );
    return { value: [...value], seen, trace: s.trace };
  }
  assert.deepEqual(await observe(false), await observe(true));
});

test("worker empty/filter/path outputs and duplicate overwrite position", async () => {
  for (const legacy of [false, true]) {
    const build = legacy ? f.legacy.buildUntrackedStats : f.helpers.buildUntrackedStats;
    const empty = f.fixture({
      stat: () => assert.fail("empty stat"),
      open: () => assert.fail("empty open"),
    });
    assert.deepEqual([...(await build(root, [entry("tracked", false)]))], []);
    assert.deepEqual(empty.trace, []);
    const paths = ["sub/--文.txt", "sub\\back.txt", "sub/dir/"];
    const s = f.fixture({
      stat: (p) => ({ size: 1, isFile: () => p !== resolve(root, "sub/dir") }),
      open: (_p, flags) => io([Buffer.from("x")]).options.open(_p, flags),
    });
    const value = await build(
      root,
      paths.map((p) => entry(p)),
    );
    assert.deepEqual(value.get(paths[2]!), { added: 0, removed: 0 });
    assert.deepEqual(new Set(value.keys()), new Set(paths));
    assert.deepEqual(
      s.trace.filter((v) => Array.isArray(v) && v[0] === "stat").map((v) => (v as string[])[1]),
      paths.map((p) => resolve(root, ...p.split("/"))),
    );
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const ready = deferred<void>();
    let index = 0,
      closing = 0;
    // Separate owned handles hold final close so duplicate completion order is explicit.
    f.fixture({
      stat: () => ({ size: 1, isFile: () => true }),
      open() {
        const id = index++;
        let reads = 0;
        return {
          read(b: Buffer) {
            if (++reads > 1) return { bytesRead: 0 };
            const data = Buffer.from(id === 2 ? "\n\n\n" : "x");
            data.copy(b);
            return { bytesRead: data.length };
          },
          close: () => {
            if (++closing === 3) ready.resolve();
            return gates[id]!.promise;
          },
        };
      },
    });
    const p = build(root, [entry("dup"), entry("other"), entry("dup")]);
    await ready.promise;
    gates[2]!.resolve();
    gates[1]!.resolve();
    gates[0]!.resolve();
    const duplicate = await p;
    assert.deepEqual(
      [...duplicate],
      [
        ["dup", { added: 1, removed: 0 }],
        ["other", { added: 1, removed: 0 }],
      ],
    );
  }
});

function consumerPorts(onRead?: () => void, close?: () => unknown) {
  return {
    stat: (p: string) => ({
      size: 4,
      isFile: () => p === resolve(root, "sub/a.txt"),
      isDirectory: () => true,
    }),
    open: (_p: string, flags: string) => {
      assert.equal(flags, "r");
      let reads = 0;
      return {
        read(b: Buffer) {
          onRead?.();
          if (++reads > 1) return { bytesRead: 0 };
          Buffer.from("a\nb").copy(b);
          return { bytesRead: 3 };
        },
        close: () => close?.(),
      };
    },
  };
}
for (const transport of ["service", "RPC"] as const)
  test(`actual status/refresh untracked statistics ${transport}`, async (t) => {
    const s = f.fixture(consumerPorts());
    const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    const value = await api.refresh({
      workspacePath: workspace,
      includeIdentity: false,
      includeBranchComparison: false,
    });
    assert.deepEqual(
      value.unstagedChanges.map((v) => [v.workspaceRelativePath, v.section, v.added, v.removed]),
      [
        ["a.txt", "untracked", 2, 0],
        ["dir/", "untracked", 0, 0],
      ],
    );
    assert.equal(value.summary.isDirty, true);
    assert.equal(s.commands.length, 4);
    const commands = s.commands as {
      args: string[];
      cwd: string;
      timeoutMs: number;
      maxOutputBytes: number;
    }[];
    assert.deepEqual(
      commands.slice(1).map((c) => c.args),
      [
        ["status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z"],
        ["diff", "--cached", "--numstat", "-z", "--find-renames", "--"],
        ["diff", "--numstat", "-z", "--find-renames", "--"],
      ],
    );
    assert.ok(
      commands
        .slice(1)
        .every((c) => c.cwd === root && c.timeoutMs === 15000 && c.maxOutputBytes === 524288),
    );
    assert.deepEqual(
      s.trace.filter((v) => Array.isArray(v) && v[0] === "open"),
      [["open", resolve(root, "sub/a.txt"), "r"]],
    );
  });

test("actual queued/reentrant status reuse, invalidation and late close retain ownership", async () => {
  const ready = deferred<void>(),
    finish = deferred<void>();
  let armed = false,
    firstHandle = true,
    nested!: Promise<unknown>;
  let s!: ReturnType<typeof f.fixture>;
  const events: string[] = [];
  const ports = consumerPorts(
    () => {
      if (!armed) {
        armed = true;
        nested = s.repo.getStatus(workspace);
      }
    },
    () => {
      if (firstHandle) {
        firstHandle = false;
        ready.resolve();
        return finish.promise;
      }
    },
  );
  s = f.fixture(ports);
  const first = s.repo.getStatus(workspace).then((v) => {
    events.push("old");
    return v;
  });
  await ready.promise;
  const queued = s.repo.getStatus(workspace);
  s.repo.invalidate(workspace);
  const current = await s.repo.getStatus(workspace).then((v) => {
    events.push("new");
    return v;
  });
  assert.deepEqual(current.untrackedStats.get("sub/a.txt"), { added: 2, removed: 0 });
  finish.resolve();
  const old = await first;
  assert.equal(await queued, old);
  assert.equal(await nested, old);
  assert.deepEqual(events, ["new", "old"]);
  await s.repo.getStatus(workspace);
  assert.equal(
    (s.commands as { args: string[] }[]).filter((c) => c.args[0] === "status").length,
    3,
  );
});
