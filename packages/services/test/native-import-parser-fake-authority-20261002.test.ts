import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic native parser retains visible turn identity and propagates read permission failures", async () => {
  const trace: unknown[][] = [];
  const denied = Object.assign(new Error("synthetic read denied"), { code: "EACCES" });
  let fail = false;
  const records = [
    { type: "user", isMeta: true, message: { content: "synthetic hidden" } },
    { type: "assistant", cwd: "/synthetic-origin", message: { content: "synthetic orphan" } },
    {
      type: "user",
      timestamp: 1700000001,
      message: {
        content: [
          { type: "tool_result", content: "synthetic excluded" },
          {
            type: "text",
            text: "<ide_opened_file>synthetic path</ide_opened_file> synthetic question",
          },
        ],
      },
    },
    {
      type: "assistant",
      timestamp: 1700000002,
      model: "synthetic-model",
      message: { content: [{ type: "text", text: "synthetic answer " }] },
    },
    {
      type: "assistant",
      timestamp: 1700000003,
      message: { content: [{ type: "text", text: "continued\nNo response requested." }] },
    },
    { type: "assistant", model: "<synthetic>", message: { content: "synthetic ignored" } },
    { type: "user", timestamp: 1700000004, message: { content: "synthetic second" } },
  ];
  mock.module("node:fs/promises", {
    namedExports: {
      stat: async (path: string) => {
        trace.push(["stat", path]);
        return { birthtimeMs: 1, mtimeMs: 2 };
      },
    },
  });
  mock.module(
    new URL("../src/session/claude-native/sessionHistoryJsonl.ts", import.meta.url).href,
    {
      namedExports: {
        readJsonLinesFile: async (path: string) => {
          trace.push(["records", path]);
          if (fail) throw denied;
          return records;
        },
      },
    },
  );
  mock.module(new URL("../src/session/sessionTitle.ts", import.meta.url).href, {
    namedExports: { deriveSessionTitle: (text: string) => `title:${text}` },
  });
  mock.module(new URL("../src/session/claude-native/jsonLineRecord.ts", import.meta.url).href, {
    namedExports: {
      isObjectRecord: (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v),
      readTrimmedString: (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    },
  });
  const {
    parseClaudeNativeSessionFile: parse,
    hasClaudeNativeSidechainMarker: sidechain,
    extractClaudeNativeSessionHeadInfo: head,
  } = await import("../src/session/claude-native/claudeNativeSessionImportParser.js");
  const params = {
    filePath: "/synthetic-source.jsonl",
    workspacePath: "/synthetic-fallback",
    sessionId: "synthetic-id",
  };
  const result = await parse(params);
  assert.deepEqual(trace, [
    ["records", params.filePath],
    ["stat", params.filePath],
  ]);
  assert.equal(result.workspacePath, "/synthetic-origin");
  assert.equal(result.sessionId, params.sessionId);
  assert.equal(result.sourcePath, params.filePath);
  assert.equal(result.migrationSource, "claudeCode");
  assert.equal(result.createdAt, 1700000001000);
  assert.equal(result.updatedAt, 1700000004000);
  assert.equal(result.model, "synthetic-model");
  assert.deepEqual(result.messages, [
    { role: "user", content: "synthetic question", timestamp: 1700000001000, turnIndex: 0 },
    {
      role: "assistant",
      content: "synthetic answercontinued",
      timestamp: 1700000003000,
      model: "synthetic-model",
      turnIndex: 0,
    },
    { role: "user", content: "synthetic second", timestamp: 1700000004000, turnIndex: 1 },
  ]);
  assert.equal(head(records).workspacePath, "/synthetic-origin");
  assert.equal(sidechain([{ message: { isSidechain: true } }]), true);
  fail = true;
  await assert.rejects(parse(params), (e) => e === denied);
});
