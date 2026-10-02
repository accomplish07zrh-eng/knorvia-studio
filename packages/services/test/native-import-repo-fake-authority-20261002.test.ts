import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { mock, test } from "node:test";

test("synthetic native import repository preserves isolation, copy order and failure identity", async () => {
  const trace: unknown[][] = [];
  const denied = Object.assign(new Error("synthetic copy denied"), { code: "EACCES" });
  const missing = Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
  let existed = false,
    fail = "",
    head = "plain";
  const env = process.env;
  const clock = Date.now;
  const random = Math.random;
  mock.module("node:os", { namedExports: { homedir: () => "/synthetic-home" } });
  mock.module("node:fs/promises", {
    namedExports: {
      stat: async (path: string) => {
        trace.push(["stat", path]);
        if (path.endsWith(".jsonl") && !path.includes("agent-config")) return { mtimeMs: 123.8 };
        if (!existed) throw missing;
        return {};
      },
      mkdir: async (...args: unknown[]) => {
        trace.push(["mkdir", ...args]);
        if (fail === "mkdir") throw denied;
      },
      copyFile: async (...args: unknown[]) => {
        trace.push(["copy", ...args]);
        if (fail === "copy") throw denied;
      },
      rename: async (...args: unknown[]) => {
        trace.push(["rename", ...args]);
        if (fail === "rename") throw denied;
      },
      readdir: async (path: string) => {
        trace.push(["readdir", path]);
        return path === join("/synthetic-home", ".claude", "projects")
          ? [{ name: "owned.jsonl", isFile: () => true, isDirectory: () => false }]
          : [];
      },
    },
  });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: {
      getAppConfigDir: () => "/synthetic-config",
      getDataBaseDir: () => "/synthetic-home",
      getWorkspaceHash: (path: string, identity?: string) => {
        trace.push(["hash", path, identity]);
        return "synthetic-hash";
      },
    },
  });
  mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
    namedExports: { createServiceLogger: () => ({ info: () => {}, warn: () => {} }) },
  });
  mock.module(
    new URL("../src/session/claude-native/sessionHistoryJsonl.ts", import.meta.url).href,
    {
      namedExports: {
        readJsonLinesFileHead: async (path: string, count: number) => {
          trace.push(["head", path, count]);
          return [];
        },
      },
    },
  );
  mock.module(
    new URL("../src/session/claude-native/claudeNativeSessionHeadParser.ts", import.meta.url).href,
    {
      namedExports: {
        hasClaudeNativeSidechainMarker: () => head === "sidechain",
        extractClaudeNativeSessionHeadInfo: () => ({
          workspacePath:
            head === "worktree" ? "/synthetic/.claude/worktrees/temporary" : "/synthetic-workspace",
          createdAt: 12,
          previewTitle: "synthetic",
        }),
      },
    },
  );
  const { claudeNativeSessionImportRepo: repo } =
    await import("../src/session/claude-native/claudeNativeSessionImportRepo.js");
  try {
    process.env = { HOME: " /synthetic-home " };
    Date.now = () => 1000;
    Math.random = () => 0.5;
    const source = join("/synthetic-home", ".claude", "projects", "project", "owned.jsonl");
    const target = join(
      "/synthetic-config",
      "agent-config",
      "claude",
      "synthetic-hash",
      "projects",
      "project",
      "owned.jsonl",
    );
    const params = {
      workspacePath: "/synthetic-workspace",
      workspaceIdentity: "remote:synthetic-identity",
      sourcePath: source,
    };
    assert.deepEqual(await repo.copySessionFileToWorkspace(params), {
      outputPath: target,
      createdOutputPaths: [target],
    });
    assert.deepEqual(
      trace.map((v) => v[0]),
      ["hash", "stat", "mkdir", "copy", "rename"],
    );
    assert.deepEqual(trace[0], ["hash", params.workspacePath, params.workspaceIdentity]);
    assert.equal(trace[3][1], source);
    assert.equal(trace[4][2], target);
    assert.equal(trace[3][2], trace[4][1]);
    assert.ok(String(trace[3][2]).endsWith(".tmp"));
    existed = true;
    trace.length = 0;
    assert.deepEqual((await repo.copySessionFileToWorkspace(params)).createdOutputPaths, []);
    for (const next of ["mkdir", "copy", "rename"]) {
      fail = next;
      trace.length = 0;
      await assert.rejects(repo.copySessionFileToWorkspace(params), (e) => e === denied);
      assert.equal(trace.at(-1)?.[0], next);
    }
    fail = "";
    trace.length = 0;
    await assert.rejects(
      repo.copySessionFileToWorkspace({
        ...params,
        sourcePath: `${sep}synthetic${sep}invalid.jsonl`,
      }),
      /路径非法/,
    );
    assert.equal(trace.length, 0);
    const scanned = await repo.scanImportableSessions({ workspacePath: "/synthetic-workspace" });
    assert.equal(scanned.length, 1);
    assert.equal(scanned[0].updatedAt, 123);
    head = "worktree";
    assert.equal(await repo.findImportableSession({ sessionId: "owned" }), null);
    head = "sidechain";
    assert.deepEqual(await repo.scanImportableSessions({}), []);
  } finally {
    process.env = env;
    Date.now = clock;
    Math.random = random;
  }
});
