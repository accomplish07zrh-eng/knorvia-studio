import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { KnorviaSessionStateSnapshot } from "@knorvia/shared";

test("synthetic history repair respects active/imported authority and immediate identity", async () => {
  const trace: unknown[][] = [];
  const denied = Object.assign(new Error("synthetic denied"), { code: "EACCES" });
  const missing = Object.assign(new Error("synthetic absent"), { code: "ENOENT" });
  let mode = "missing";
  const legacy = {
    meta: {
      migrationSource: "claudeCode",
      traceId: "synthetic-trace",
      title: "synthetic legacy",
      createdAt: 1,
      updatedAt: 2,
    },
    messages: [
      { role: "user", content: "synthetic user", timestamp: 1 },
      { role: "assistant", content: "synthetic assistant", timestamp: 2 },
    ],
  };
  mock.module("node:fs/promises", {
    namedExports: {
      readFile: async (path: string) => {
        trace.push(["read", path]);
        if (mode === "denied") throw denied;
        if (mode === "missing") throw missing;
        return JSON.stringify(legacy);
      },
    },
  });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: {
      getLegacyTaskSessionSnapshotPath: (...args: unknown[]) => {
        trace.push(["active-path", ...args]);
        return "/synthetic-active.json";
      },
      getLegacyDeletedTaskSessionSnapshotPath: (...args: unknown[]) => {
        trace.push(["deleted-path", ...args]);
        return "/synthetic-deleted.json";
      },
    },
  });
  mock.module(new URL("../src/session/legacyTaskSessionFile.ts", import.meta.url).href, {
    namedExports: { safeParseLegacyTaskSessionFile: (data: unknown) => ({ success: true, data }) },
  });
  mock.module(
    new URL("../src/session/claude-native/buildImportedClaudeTaskFile.ts", import.meta.url).href,
    { namedExports: { buildImportedClaudeTaskId: () => "claude-import-synthetic" } },
  );
  mock.module(
    new URL("../src/session/claude-native/claudeNativeSessionImportRepo.ts", import.meta.url).href,
    {
      namedExports: {
        claudeNativeSessionImportRepo: {
          scanImportableSessions: async (params: unknown) => {
            trace.push(["scan", params]);
            return [
              {
                sessionId: "synthetic-external",
                workspacePath: "/synthetic-workspace",
                sourcePath: "/synthetic-source.jsonl",
                createdAt: 3,
                updatedAt: 4,
              },
            ];
          },
        },
      },
    },
  );
  mock.module(
    new URL("../src/session/claude-native/claudeNativeSessionImportParser.ts", import.meta.url)
      .href,
    {
      namedExports: {
        parseClaudeNativeSessionFile: async (params: unknown) => {
          trace.push(["parse", params]);
          return {
            title: "synthetic native",
            createdAt: 3,
            updatedAt: 4,
            messages: legacy.messages,
          };
        },
      },
    },
  );
  const {
    repairImportedClaudeSessionSnapshot: repair,
    readLegacyImportedClaudeHistory: readLegacy,
  } = await import("../src/session/claude-native/importedClaudeHistoryRepair.js");
  const target = {
    workspacePath: "/synthetic-workspace",
    workspaceIdentity: "remote:synthetic",
    taskId: "claude-import-synthetic",
  };
  const snapshot = {
    session: { sessionId: target.taskId, status: "running", mode: "build" },
    runtime: {},
    messages: [],
    settings: {
      model: { current: "synthetic-model" },
      thoughtLevel: { current: "synthetic-level" },
    },
  } as unknown as KnorviaSessionStateSnapshot;
  const createSession = async (input: unknown) => {
    trace.push(["create", input]);
    return "synthetic-created";
  };
  assert.equal(await repair({ target, snapshot, createSession }), null);
  assert.equal(trace.length, 0);
  snapshot.session.status = "completed";
  snapshot.runtime.activeTurnId = "synthetic-active-turn";
  assert.equal(await repair({ target, snapshot, createSession }), null);
  assert.equal(trace.length, 0);
  snapshot.runtime.activeTurnId = undefined;

  snapshot.session.sessionId = "ordinary-session";
  assert.equal(await repair({ target, snapshot, createSession }), null);
  assert.equal(trace.length, 0);
  snapshot.session.sessionId = target.taskId;
  mode = "denied";
  await assert.rejects(repair({ target, snapshot, createSession }), (e) => e === denied);
  assert.ok(!trace.some((v) => v[0] === "create" || v[0] === "scan"));
  trace.length = 0;
  mode = "legacy";
  assert.equal(
    await repair({
      target,
      snapshot,
      createSession,
      onRepair: (history) => {
        trace.push(["notify", history.source]);
      },
    }),
    "synthetic-created",
  );
  assert.ok(!trace.some((v) => v[0] === "scan"));
  assert.equal(trace.at(-2)?.[0], "notify");
  const input = trace.at(-1)?.[1] as Record<string, unknown>;
  assert.equal(input.workspaceIdentity, target.workspaceIdentity);
  assert.equal(input.sessionId, target.taskId);
  assert.equal(input.persistence, "immediate");
  assert.equal(input.model, "synthetic-model");
  trace.length = 0;
  mode = "missing";
  assert.equal(await readLegacy(target), null);
  assert.deepEqual(
    trace.filter((v) => v[0] === "read").map((v) => v[1]),
    ["/synthetic-active.json", "/synthetic-deleted.json"],
  );
  trace.length = 0;
  assert.equal(await repair({ target, snapshot, createSession }), "synthetic-created");
  assert.ok(
    trace.some((v) => v[0] === "scan" && JSON.stringify(v[1]).includes(target.workspacePath)),
  );
  trace.length = 0;
  mode = "legacy";
  await assert.rejects(
    repair({
      target,
      snapshot,
      createSession,
      onRepair: () => {
        throw denied;
      },
    }),
    (e) => e === denied,
  );
  assert.ok(!trace.some((v) => v[0] === "create"));
});
