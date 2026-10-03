import assert from "node:assert/strict";
import { sep } from "node:path";
import { mock, test } from "node:test";
import type { GitCommandExecutionResult } from "../src/git/providers/gitCommandProvider.js";
import type { GitResolvedRepository, GitStatusEntry } from "../src/git/repo/gitCliTypes.js";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

test("synthetic CLI parsing, repository paths and permission-limited file reads", async () => {
  const denial = Object.assign(new Error("owned read denied"), { code: "EACCES" });
  const closeDenial = Object.assign(new Error("owned close denied"), { code: "EPERM" });
  const reads: string[] = [];
  const closes: string[] = [];
  const files = new Map([
    [fakeFsPath("/owned root/quote ' text"), Buffer.from("first\nlast")],
    [fakeFsPath("/owned root/zero"), Buffer.from([65, 0, 10])],
    [fakeFsPath("/owned root/close denied"), Buffer.from("ok\n")],
    [fakeFsPath("/owned root/last newline"), Buffer.from("first\n")],
    [fakeFsPath("/owned root/empty"), Buffer.alloc(0)],
  ]);
  mock.module("node:fs/promises", {
    namedExports: {
      access: async (p: string) => {
        if (!files.has(p)) throw denial;
      },
      realpath: async (p: string) => {
        if (p.endsWith("outside link")) return fakeFsPath("/outside/escape");
        throw denial;
      },
      stat: async (p: string) => {
        if (p.endsWith("denied")) {
          if (!files.has(p)) throw denial;
        }
        return { isFile: () => true, size: files.get(p)?.length ?? 0 };
      },
      readFile: async (p: string) => {
        reads.push(p);
        const value = files.get(p);
        if (!value) throw denial;
        return value;
      },
      open: async (p: string, mode: string) => {
        assert.equal(mode, "r");
        const value = files.get(p);
        if (!value) throw denial;
        let offset = 0;
        return {
          read: async (buffer: Buffer, start: number, length: number, position: null) => {
            assert.equal(position, null);
            reads.push(p);
            const bytesRead = value.copy(buffer, start, offset, offset + length);
            offset += bytesRead;
            return { bytesRead };
          },
          close: async () => {
            closes.push(p);
            if (p.endsWith("close denied")) throw closeDenial;
          },
        };
      },
    },
  });
  mock.module(new URL("../src/git/config.ts", import.meta.url).href, {
    namedExports: {
      GIT_UNTRACKED_STAT_CHUNK_BYTES: 65536,
      GIT_UNTRACKED_STAT_CONCURRENCY: 4,
      GIT_UNTRACKED_STAT_MAX_BYTES: 1048576,
      normalizeGitPath: (p: string) => p.replace(/\\/g, "/"),
    },
  });
  const h = await import("../src/git/repo/gitCliHelpers.js");
  const resolution: GitResolvedRepository = {
    workspacePath: fakeFsPath("/owned root/sub"),
    repoRoot: fakeFsPath("/owned root"),
    workspaceInRepoPath: "sub",
    autoRefreshWatchPaths: [],
    isGitAvailable: true,
    isRepository: true,
  };
  assert.equal(await h.normalizeInputPath(resolution, "../quote ' text"), "quote ' text");
  await assert.rejects(
    h.normalizeInputPath(resolution, "../../outside"),
    /outside repository scope/,
  );
  await assert.rejects(
    h.normalizeInputPath(resolution, "outside link"),
    /outside repository scope/,
  );
  assert.equal(await h.fileExists(fakeFsPath("/owned root/no permission")), false);
  const parsed = h.parseStatusPorcelain(
    "# branch.head owned\0# branch.ab +2 -3\0" +
      "2 R. N... 100644 100644 100644 a b R100 quote ' new\0old path\0? zero\0",
  );
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.entries[0].path, "quote ' new");
  assert.equal(parsed.entries[0].originalPath, "old path");
  assert.deepEqual(h.parseNumstat("2\t-\t\0old path\0quote ' new\0").get("quote ' new"), {
    added: 2,
    removed: 0,
    kind: "renamed",
    originalPath: "old path",
  });
  assert.ok(Object.is(h.parseNumstat("-0\t0\tzero\0").get("zero")?.added, -0));
  const entry = (path: string): GitStatusEntry => ({
    path,
    originalPath: null,
    kind: "added",
    x: null,
    y: "?",
    isUntracked: true,
    isConflicted: false,
  });
  const stats = await h.buildUntrackedStats(
    fakeFsPath("/owned root"),
    ["quote ' text", "zero", "no permission", "close denied", "last newline", "empty"].map(entry),
  );
  assert.deepEqual(stats.get("quote ' text"), { added: 2, removed: 0 });
  assert.deepEqual(stats.get("last newline"), { added: 1, removed: 0 });
  for (const p of ["zero", "no permission", "close denied", "empty"])
    assert.deepEqual(stats.get(p), { added: 0, removed: 0 });
  assert.equal(closes.length, 5);
  assert.equal(new Set(closes).size, 5);
  const preview = await h.buildUntrackedTextDiffResult(
    fakeFsPath("/owned root/quote ' text"),
    "quote ' text",
    99,
  );
  assert.equal(preview?.path, fakeFsPath("/owned root/quote ' text"));
  assert.equal(
    preview?.patch,
    "--- /dev/null\n+++ b/quote ' text\n@@ -0,0 +1,2 @@\n+first\n+last\n\\ No newline at end of file\n",
  );
  assert.equal(
    await h.buildUntrackedTextDiffResult(
      fakeFsPath("/owned root/no permission"),
      "no permission",
      99,
    ),
    null,
  );
  assert.equal(
    (await h.buildUntrackedTextDiffResult(fakeFsPath("/owned root/zero"), "zero", 1))?.availability,
    "binary",
  );
  assert.equal(
    (await h.buildUntrackedTextDiffResult(fakeFsPath("/owned root/zero"), "zero", 1))?.path,
    fakeFsPath("/owned root/zero"),
  );
  const result: GitCommandExecutionResult = {
    binaryPath: "owned git",
    cwd: fakeFsPath("/owned root"),
    args: [],
    stdout: "",
    stderr: "owned denied",
    exitCode: 1,
    signal: null,
    durationMs: 8,
    timedOut: false,
    outputTruncated: false,
  };
  assert.throws(
    () => h.ensureGitCommandSucceeded("owned command", result),
    /owned command failed: owned denied/,
  );
  assert.equal(h.ensureGitCommandSucceeded("owned", result, [1]), result);
  assert.ok(reads.every((p) => p.startsWith(`${fakeFsPath("/owned root")}${sep}`)));
});
