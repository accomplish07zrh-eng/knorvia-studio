import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import type { KnorviaTaskMeta } from "@knorvia/shared";

test("synthetic import service preserves workspace gates, persistence and created-only cleanup", async () => {
  const trace: unknown[][] = [];
  const payload = (kind: string) => {
    const entry = trace.find((v) => v[0] === kind);
    assert.ok(entry);
    return entry[1] as Record<string, unknown>;
  };
  const denied = Object.assign(new Error("synthetic snapshot denied"), { code: "EACCES" });
  let failSnapshot = false;
  let mutateCandidate = false;
  const candidate = {
    workspacePath: "/synthetic-workspace",
    sourcePath: "/synthetic-source.jsonl",
    createdAt: 1,
    updatedAt: 2,
  };
  const meta = {
    taskId: "synthetic-task",
    workspacePath: candidate.workspacePath,
    workspaceIdentity: "creator:identity",
    title: "synthetic",
    createdAt: 1,
    updatedAt: 2,
    status: "completed",
    mode: "build",
  } as KnorviaTaskMeta;
  const source = {
    provider: "claude",
    sessionId: "synthetic-external",
    workspacePath: candidate.workspacePath,
    sourcePath: candidate.sourcePath,
    createdAt: 1,
    updatedAt: 2,
    messages: [{ role: "user", content: "synthetic text" }],
  };
  mock.module("node:fs/promises", {
    namedExports: {
      access: async (path: string) => {
        trace.push(["access", path]);
        if (path === "/synthetic-missing") throw denied;
        if (mutateCandidate) candidate.workspacePath = "/synthetic-changed-after-access";
      },
      rm: async (...args: unknown[]) => {
        trace.push(["rm", ...args]);
      },
    },
  });
  mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
    namedExports: { createServiceLogger: () => ({ info: () => {}, warn: () => {} }) },
  });
  mock.module(
    new URL("../src/session/claude-native/claudeNativeSessionImportRepo.ts", import.meta.url).href,
    {
      namedExports: {
        claudeNativeSessionImportRepo: {
          findImportableSession: async (params: { sessionId: string }) => {
            trace.push(["find", params]);
            if (params.sessionId === "mutable") return candidate;
            return params.sessionId === "none"
              ? null
              : {
                  ...candidate,
                  workspacePath:
                    params.sessionId === "mismatch"
                      ? "/synthetic-other"
                      : params.sessionId === "missing"
                        ? "/synthetic-missing"
                        : candidate.workspacePath,
                };
          },
          copySessionFileToWorkspace: async (params: unknown) => {
            trace.push(["copy", params]);
            return {
              outputPath: "/synthetic-copied.jsonl",
              createdOutputPaths: ["/synthetic-new.jsonl", "/synthetic-new.jsonl"],
            };
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
          return source;
        },
      },
    },
  );
  mock.module(
    new URL("../src/session/claude-native/buildImportedClaudeTaskFile.ts", import.meta.url).href,
    {
      namedExports: {
        buildImportedClaudeTaskFile: (...args: unknown[]) => {
          trace.push(["build", ...args]);
          return { meta, messages: source.messages };
        },
      },
    },
  );
  mock.module(
    new URL("../src/session/claude-native/persistImportedClaudeTask.ts", import.meta.url).href,
    {
      namedExports: {
        writeImportedClaudeTaskSnapshot: async (params: unknown) => {
          trace.push(["snapshot", params]);
          if (failSnapshot) throw denied;
        },
        persistImportedClaudeTask: async (params: unknown) => {
          trace.push(["persist", params]);
          return meta;
        },
        buildSearchableTextFromMessages: () => "synthetic-search",
      },
    },
  );
  const taskIndexRepo = {
    syncTaskMeta: async (params: { meta: KnorviaTaskMeta }) => {
      trace.push(["index", params]);
      return params.meta;
    },
  } as unknown as TaskIndexRepo;
  const { importClaudeNativeSessions: run } =
    await import("../src/session/claude-native/claudeNativeSessionImportService.js");
  const params = {
    taskIndexRepo,
    workspacePath: candidate.workspacePath,
    workspaceIdentity: "remote:synthetic",
    sessionIds: [" none ", "none", "mismatch", "missing", " good ", "good"],
    createImportedSession: async (input: unknown) => {
      trace.push(["create", input]);
      return meta;
    },
    onTaskImported: (input: unknown) => {
      trace.push(["notify", input]);
    },
  };
  const result = await run(params);
  assert.equal(result.imported.length, 1);
  assert.equal(result.skipped.length, 3);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(
    trace.filter((v) => v[0] === "find").map((v) => (v[1] as { sessionId: string }).sessionId),
    ["none", "mismatch", "missing", "good"],
  );
  assert.equal(trace.filter((v) => v[0] === "copy").length, 1);
  assert.deepEqual(
    trace
      .filter((v) =>
        ["copy", "parse", "create", "build", "snapshot", "index", "notify"].includes(String(v[0])),
      )
      .map((v) => v[0]),
    ["copy", "parse", "create", "build", "snapshot", "index", "notify"],
  );
  const copied = trace.find((v) => v[0] === "copy")?.[1] as Record<string, unknown>;
  assert.equal(copied.workspaceIdentity, params.workspaceIdentity);
  const indexed = trace.find((v) => v[0] === "index")?.[1] as {
    meta: KnorviaTaskMeta;
    archived: boolean;
    deleted: boolean;
  };
  assert.equal(indexed.meta.workspaceIdentity, params.workspaceIdentity);
  assert.equal(indexed.meta.migrationSource, "claudeCode");
  assert.equal(indexed.archived, false);
  assert.equal(indexed.deleted, false);
  trace.length = 0;
  failSnapshot = true;
  const failed = await run({ ...params, sessionIds: ["good"] });
  assert.equal(failed.failed[0].reason, denied.message);
  assert.ok(!trace.some((v) => v[0] === "index" || v[0] === "notify"));
  assert.deepEqual(
    trace.filter((v) => v[0] === "rm"),
    [["rm", "/synthetic-new.jsonl", { force: true }]],
  );
  trace.length = 0;
  failSnapshot = false;
  await run({
    ...params,
    workspacePath: undefined,
    sessionIds: ["good"],
    createImportedSession: undefined,
  });
  assert.equal(payload("copy").workspaceIdentity, undefined);
  assert.equal(payload("persist").workspaceIdentity, undefined);
  trace.length = 0;
  mutateCandidate = true;
  const mutable = await run({ ...params, sessionIds: ["mutable"] });
  assert.equal(mutable.imported.length, 1);
  assert.equal(payload("copy").workspacePath, "/synthetic-workspace");
  candidate.workspacePath = "/synthetic-workspace";
});
