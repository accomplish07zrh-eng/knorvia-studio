import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { mock, test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

const calls: Array<{ operation: string; path: string; value?: unknown }> = [];
const ioFailure = new Error("synthetic write denied");
let denyWrite = false;
let sourceFailure: unknown;
mock.module("node:fs/promises", {
  namedExports: {
    lstat: async (path: string) => {
      calls.push({ operation: "lstat", path });
      if (sourceFailure) throw sourceFailure;
      assert.ok(path.startsWith("/synthetic/source"));
      return {
        mode: path.endsWith("/a") ? 0o100751 : 0o40755,
        mtimeMs: 2000,
        isDirectory: () => path === "/synthetic/source",
        isFile: () => path.endsWith("/a") || path.endsWith("/b"),
      };
    },
    readdir: async (path: string, options: unknown) => {
      calls.push({ operation: "readdir", path, value: options });
      assert.equal(path, "/synthetic/source");
      assert.deepEqual(options, { withFileTypes: true });
      return [{ name: "b" }, { name: "a" }];
    },
    readFile: async (path: string) => {
      calls.push({ operation: "readFile", path });
      assert.ok(path === "/synthetic/source/a" || path === "/synthetic/source/b");
      return Buffer.from(path.endsWith("/a") ? "AA" : "B");
    },
    mkdir: async (path: string, options: unknown) => {
      calls.push({ operation: "mkdir", path, value: options });
      assert.deepEqual(options, { recursive: true });
    },
    writeFile: async (path: string, data: Uint8Array, options: unknown) => {
      calls.push({ operation: "writeFile", path, value: { bytes: Buffer.from(data), options } });
      if (denyWrite) throw ioFailure;
    },
    chmod: async (path: string, mode: number) => {
      calls.push({ operation: "chmod", path, value: mode });
    },
  },
});
const archiveOwner = await import("../src/plugin-sync/pluginSyncArchive.js");

function textField(tar: Buffer, start: number, length: number): string {
  return tar
    .subarray(start, start + length)
    .toString("utf8")
    .split("\0")[0]!;
}
function mutatedArchive(tar: Buffer, field: number, length: number, content: string): Buffer {
  const changed = Buffer.from(tar);
  changed.fill(0, field, field + length);
  changed.write(content, field, length, "utf8");
  return gzipSync(changed);
}

test("synthetic archive preserves source order/modes and contains all extraction writes", async () => {
  const time = mock.method(Date, "now", () => 5000);
  try {
    const metadata = {
      plugins: [{ name: "fake", pluginId: "fake@inline", directoryName: "fake" }],
    };
    const compressed = await archiveOwner.createPluginSyncArchive({
      entries: [
        { content: "X", archivePath: "inline.txt", mode: 0o755, mtimeMs: 1000 },
        { sourcePath: "/synthetic/source", archivePath: "fake" },
      ],
      metadata,
    });
    assert.deepEqual(
      calls.map((row) => [row.operation, row.path]),
      [
        ["lstat", "/synthetic/source"],
        ["readdir", "/synthetic/source"],
        ["lstat", "/synthetic/source/a"],
        ["readFile", "/synthetic/source/a"],
        ["lstat", "/synthetic/source/b"],
        ["readFile", "/synthetic/source/b"],
      ],
    );
    const tar = gunzipSync(compressed);
    const headers = [0, 1024, 1536, 2560, 3584];
    assert.deepEqual(
      headers.map((offset) => textField(tar, offset, 100)),
      ["inline.txt", "fake/", "fake/a", "fake/b", ".knorvia-plugin-sync.json"],
    );
    assert.equal(textField(tar, 100, 8), "0000755");
    assert.equal(textField(tar, 136, 12), "00000000001");
    assert.equal(textField(tar, 257, 6), "ustar");
    assert.equal(textField(tar, 265, 32), "knorvia");
    assert.equal(textField(tar, 1024 + 156, 1), "5");
    assert.equal(textField(tar, 1536 + 100, 8), "0000751");
    assert.equal(
      tar
        .subarray(4096, 4096 + Buffer.byteLength(JSON.stringify(metadata, null, 2)) + 1)
        .toString(),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    assert.ok(tar.subarray(-1024).every((byte) => byte === 0));

    const reads: string[] = [];
    await archiveOwner.createPluginSyncArchive({
      entries: [
        {
          get archivePath() {
            reads.push("path");
            return "getter.txt";
          },
          get content() {
            reads.push("content");
            return "fake";
          },
          get mode() {
            reads.push("mode");
            return 0o644;
          },
          get mtimeMs() {
            reads.push("mtime");
            return 0;
          },
        },
      ],
      metadata,
    });
    assert.deepEqual(reads, ["path", "content", "content", "mode", "mtime"]);
    reads.length = 0;
    await archiveOwner.createPluginSyncArchive({
      entries: [
        new Proxy(
          { sourcePath: "/synthetic/source/a", archivePath: "proxy.txt" },
          {
            has(target, key) {
              reads.push(`has:${String(key)}`);
              return Reflect.has(target, key);
            },
            get(target, key, receiver) {
              reads.push(`get:${String(key)}`);
              return Reflect.get(target, key, receiver);
            },
          },
        ),
      ],
      metadata,
    });
    assert.deepEqual(reads, ["has:sourcePath", "get:sourcePath", "get:archivePath"]);
    const tooLargeTime = Number.MAX_SAFE_INTEGER;
    const encoded = Math.floor(tooLargeTime / 1000)
      .toString(8)
      .padStart(11, "0");
    await assert.rejects(
      archiveOwner.createPluginSyncArchive({
        entries: [{ content: "fake", archivePath: "overflow.txt", mtimeMs: tooLargeTime }],
        metadata,
      }),
      { message: `plugin archive header value is too long: ${encoded}` },
    );

    calls.length = 0;
    const target = resolve("/synthetic/archive-target");
    await archiveOwner.extractPluginSyncArchive(compressed, target);
    const writes = calls.filter((row) => row.operation === "writeFile");
    assert.deepEqual(
      writes.map((row) => row.path),
      [
        join(target, "inline.txt"),
        join(target, "fake/a"),
        join(target, "fake/b"),
        join(target, ".knorvia-plugin-sync.json"),
      ],
    );
    assert.deepEqual(writes[0]!.value, { bytes: Buffer.from("X"), options: { mode: 0o755 } });
    if (process.platform !== "win32") {
      assert.deepEqual(
        calls.filter((row) => row.operation === "chmod").map((row) => row.value),
        [0o755, 0o751, 0o755, 0o644],
      );
    }
    for (const unsafe of [
      "../escape",
      "/absolute",
      "C:/escape",
      "fake/../escape",
      "fake\\escape",
      "fake//escape",
    ]) {
      calls.length = 0;
      await assert.rejects(
        archiveOwner.extractPluginSyncArchive(mutatedArchive(tar, 0, 100, unsafe), target),
        /unsafe plugin archive path:/,
      );
      assert.deepEqual(
        calls.map((row) => row.operation),
        ["mkdir"],
      );
      await assert.rejects(
        archiveOwner.createPluginSyncArchive({
          entries: [{ sourcePath: "/synthetic/source", archivePath: unsafe }],
          metadata,
        }),
        /unsafe plugin archive path:/,
      );
      assert.deepEqual(
        calls.map((row) => row.operation),
        ["mkdir"],
      );
    }
    calls.length = 0;
    await assert.rejects(
      archiveOwner.extractPluginSyncArchive(compressed, target, { maxExtractedBytes: 0 }),
      /plugin sync archive exceeds limit: 1\/0/,
    );
    assert.deepEqual(
      calls.map((row) => row.operation),
      ["mkdir"],
    );
    await assert.rejects(
      archiveOwner.extractPluginSyncArchive(mutatedArchive(tar, 156, 1, "2"), target),
      /unsupported plugin archive entry type: 2/,
    );
    await assert.rejects(
      archiveOwner.extractPluginSyncArchive(mutatedArchive(tar, 124, 12, "77777777777"), target),
      /truncated plugin sync archive entry/,
    );
    await assert.rejects(
      archiveOwner.extractPluginSyncArchive(compressed, target, { maxExtractedBytes: -263000 }),
      /plugin sync archive exceeds limit:/,
    );
    denyWrite = true;
    await assert.rejects(
      archiveOwner.extractPluginSyncArchive(compressed, target),
      (error) => error === ioFailure,
    );
    denyWrite = false;
    sourceFailure = ioFailure;
    await assert.rejects(
      archiveOwner.createPluginSyncArchive({
        entries: [{ sourcePath: "/synthetic/source", archivePath: "fake" }],
        metadata,
      }),
      (error) => error === ioFailure,
    );
    sourceFailure = undefined;
    await assert.rejects(
      archiveOwner.createPluginSyncArchive({
        entries: [{ sourcePath: "/synthetic/source/link", archivePath: "fake" }],
        metadata,
      }),
      /unsupported plugin archive source: \/synthetic\/source\/link/,
    );
  } finally {
    time.mock.restore();
    denyWrite = false;
    sourceFailure = undefined;
  }
});
