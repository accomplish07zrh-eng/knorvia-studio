import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { LegacyTaskSessionFile } from "../src/session/legacyTaskSessionFile.js";
import type { TaskIndexRepo } from "../src/session/taskIndexRepo.js";

test("synthetic import commits normalized snapshot before restoring index visibility", async () => {
  const trace: unknown[][] = [];
  let stage = "";
  let parses = 0;
  let blockSearch = false;
  let firstParsed: LegacyTaskSessionFile | undefined;
  const failure = new Error("synthetic authority denied");
  const searchFailure = new Error("synthetic search forbidden before repo admission");
  const checkpoint = (name: string, ...values: unknown[]) => {
    trace.push([name, ...values]);
    if (stage === name) throw failure;
    if (name === "rename" && blockSearch && firstParsed) {
      Object.defineProperty(firstParsed, "messages", {
        get() {
          throw searchFailure;
        },
      });
    }
  };
  const input = {
    meta: {
      taskId: "synthetic-task",
      workspacePath: "/synthetic-workspace",
      workspaceIdentity: "source:identity",
      title: "synthetic title",
      createdAt: 1,
      updatedAt: 2,
      status: "completed",
      migrationSource: "claudeCode",
    },
    messages: [{ role: "user", content: " first ", timestamp: 1 }],
  } as LegacyTaskSessionFile;
  const normalized = (value: LegacyTaskSessionFile) => structuredClone(value);
  mock.module(new URL("../src/session/legacyTaskSessionFile.ts", import.meta.url).href, {
    namedExports: {
      parseLegacyTaskSessionFile: (value: LegacyTaskSessionFile) => {
        checkpoint("parse", ++parses);
        const parsed = normalized(value);
        if (parses === 1) firstParsed = parsed;
        if (parses === 2) parsed.meta.title = "second validation title";
        return parsed;
      },
    },
  });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: {
      getLegacyTaskSessionSnapshotPath: (...values: unknown[]) => {
        checkpoint("path", ...values);
        return "/synthetic-snapshots/target.json";
      },
    },
  });
  mock.module("node:fs/promises", {
    namedExports: {
      mkdir: async (...values: unknown[]) => checkpoint("mkdir", ...values),
      writeFile: async (...values: unknown[]) => checkpoint("write", ...values),
      rename: async (...values: unknown[]) => checkpoint("rename", ...values),
    },
  });
  const repoResult = { syntheticResult: "exact identity" };
  const repo = {
    syncTaskMeta: async (values: unknown) => {
      checkpoint("index", values);
      return repoResult;
    },
  } as unknown as TaskIndexRepo;
  Object.defineProperty(repo.syncTaskMeta, "call", {
    get() {
      throw new Error("method.call is not a repository authority");
    },
  });
  const owner = await import("../src/session/claude-native/persistImportedClaudeTask.js");
  const before = structuredClone(input);
  const result = await owner.persistImportedClaudeTask({
    sessionFile: input,
    taskIndexRepo: repo,
    workspaceIdentity: " target:raw identity ",
  });
  assert.equal(result, repoResult);
  assert.deepEqual(input, before);
  assert.deepEqual(
    trace.map((event) => event[0]),
    ["parse", "parse", "path", "mkdir", "write", "rename", "index"],
  );
  assert.deepEqual(trace[2], [
    "path",
    "/synthetic-workspace",
    "synthetic-task",
    " target:raw identity ",
  ]);
  const write = trace.find((event) => event[0] === "write");
  const rename = trace.find((event) => event[0] === "rename");
  const index = trace.find((event) => event[0] === "index")?.[1] as Record<string, unknown>;
  assert.ok(write && rename);
  assert.match(
    String(write[1]),
    /^\/synthetic-snapshots\/target\.json\.\d+\.[a-z0-9]+\.[a-z0-9]{0,6}\.tmp$/,
  );
  const saved = JSON.parse(String(write[2])) as LegacyTaskSessionFile;
  assert.equal(saved.meta.workspaceIdentity, " target:raw identity ");
  assert.equal(saved.meta.title, "second validation title");
  assert.equal(Object.hasOwn(saved.meta, "mode"), false);
  assert.equal(String(write[2]), `${JSON.stringify(saved, null, 2)}\n`);
  assert.equal(write[3], "utf-8");
  assert.deepEqual(rename, ["rename", write[1], "/synthetic-snapshots/target.json"]);
  assert.deepEqual(index, {
    meta: { ...input.meta, workspaceIdentity: " target:raw identity ", mode: "build" },
    archived: false,
    deleted: false,
    searchableText: "first",
  });
  for (const boundary of ["parse", "mkdir", "write", "rename", "index"]) {
    trace.length = 0;
    parses = 0;
    stage = boundary;
    await assert.rejects(
      owner.persistImportedClaudeTask({ sessionFile: input, taskIndexRepo: repo }),
      (error) => error === failure,
    );
    assert.equal(trace.at(-1)?.[0], boundary);
    if (boundary !== "index")
      assert.equal(
        trace.some((event) => event[0] === "index"),
        false,
      );
    assert.deepEqual(input, before);
  }
  stage = "";
  trace.length = 0;
  parses = 0;
  blockSearch = true;
  const repoFailure = new Error("synthetic index method denied");
  const deniedRepo = {
    get syncTaskMeta() {
      throw repoFailure;
    },
  } as unknown as TaskIndexRepo;
  await assert.rejects(
    owner.persistImportedClaudeTask({ sessionFile: input, taskIndexRepo: deniedRepo }),
    (error) => error === repoFailure,
  );
  assert.equal(trace.at(-1)?.[0], "rename");
  blockSearch = false;
  trace.length = 0;
  parses = 0;
  await owner.writeImportedClaudeTaskSnapshot({ sessionFile: input });
  assert.deepEqual(trace[1], ["path", "/synthetic-workspace", "synthetic-task", "source:identity"]);
  assert.equal(
    trace.some((event) => event[0] === "index"),
    false,
  );
  const tail = {
    get content(): string {
      throw new Error("past cap must remain unread");
    },
  };
  const messages = [{ content: "x".repeat(199999) }, { content: " y " }, tail];
  assert.equal(
    owner.buildSearchableTextFromMessages(messages as LegacyTaskSessionFile["messages"]),
    `${"x".repeat(199999)}\n`,
  );
});
