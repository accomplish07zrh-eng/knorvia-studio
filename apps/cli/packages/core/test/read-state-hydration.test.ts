// Synthetic compatibility tests; retain the repository's transition licence.
import assert from "node:assert/strict";
import test from "node:test";
import type { MessageId, MessagePart, MessageWithParts } from "@knorvia/contracts";
import { hydrateReadFileStateFromSession } from "../src/agent/read-file-state-hydrator.js";
import { createReadFileStateKey } from "../src/tool/read-file-state.js";
import type { ReadFileStateMap } from "../src/tool/types.js";

function snapshot(tool = "Read", extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    tool,
    path: "/synthetic/no-disk.txt",
    content: "saved\n",
    isPartialView: false,
    readAtMs: 1500,
    revisionId: "saved-revision",
    mtimeMs: 99.9,
    sizeBytes: 6,
    ...extra,
  };
}
function part(id: string, tool = "Read", extra: Record<string, unknown> = {}): MessagePart {
  return {
    id,
    type: "tool",
    tool,
    state: {
      status: "completed",
      input: {},
      output: "display text is not file content",
      metadata: { readFileState: snapshot(tool) },
      ...extra,
    },
  } as unknown as MessagePart;
}
function message(id: string, parts: MessagePart[], role = "assistant"): MessageWithParts {
  return { info: { id, role }, parts } as unknown as MessageWithParts;
}
async function restore(messages: MessageWithParts[], extra: Record<string, unknown> = {}) {
  const states: ReadFileStateMap = new Map();
  const result = await hydrateReadFileStateFromSession({
    messages,
    readFileState: states,
    workingDirectory: "/synthetic/unavailable",
    workspaceRoot: "/synthetic/unavailable",
    ...extra,
  });
  return { states, result };
}
const counts = (restoredCount: number, skippedRangeReadCount = 0) => ({
  restoredCount,
  skippedRangeReadCount,
  skippedUnreadableEditCount: 0,
});

test("recovery clears previous state even with empty history", async () => {
  const states: ReadFileStateMap = new Map([
    ["old", { path: "/old", content: "", isPartialView: false, readAt: new Date() }],
  ]);
  const { result } = await restore([], { readFileState: states });
  assert.equal(states.size, 0);
  assert.deepEqual(result, counts(0));
});

for (const tool of ["Read", "Write", "Edit"]) {
  test(`${tool} restores its persisted full snapshot without inspecting the path`, async () => {
    const { states, result } = await restore([message("m", [part("p", tool)])]);
    assert.deepEqual(result, counts(1));
    assert.deepEqual(
      [...states],
      [
        [
          createReadFileStateKey("/synthetic/no-disk.txt", 1, undefined),
          {
            path: "/synthetic/no-disk.txt",
            content: "saved\n",
            offset: undefined,
            limit: undefined,
            isPartialView: false,
            readAt: new Date(1500),
            sourceTool: tool,
            revisionId: "saved-revision",
            mtimeMs: 99,
            sizeBytes: 6,
          },
        ],
      ],
    );
  });
}

test("Read windows are counted before invalid or absent metadata is examined", async () => {
  const parts = [{ offset: 2 }, { limit: 1 }, { offset: 0, limit: 0 }].map((input, i) =>
    part(String(i), "Read", { input, metadata: undefined }),
  );
  assert.deepEqual((await restore([message("m", parts)])).result, counts(0, 3));
});

test("non-object Read input is ignored without range accounting", async () => {
  for (const input of [undefined, null, [], "text", 5]) {
    assert.deepEqual(
      (await restore([message("m", [part("p", "Read", { input })])])).result,
      counts(0),
    );
  }
});

test("Write and Edit accept valid metadata even when input and output cannot reconstruct a file", async () => {
  for (const tool of ["Write", "Edit"]) {
    const { result } = await restore([
      message("m", [part("p", tool, { input: null, output: undefined })]),
    ]);
    assert.deepEqual(result, counts(1));
  }
});

test("metadata tool mismatches, range windows and missing freshness never restore", async () => {
  for (const tool of ["Read", "Write", "Edit"]) {
    for (const change of [
      { tool: "wrong" },
      { offset: 2 },
      { limit: 1 },
      { revisionId: "" },
      { mtimeMs: undefined },
      { sizeBytes: undefined },
    ]) {
      const { states, result } = await restore([
        message("m", [part("p", tool, { metadata: { readFileState: snapshot(tool, change) } })]),
      ]);
      assert.equal(states.size, 0);
      assert.deepEqual(result, counts(0));
    }
  }
});

test("only completed assistant tool parts with an output property are eligible", async () => {
  for (const status of ["pending", "running", "error"]) {
    assert.deepEqual(
      (await restore([message("m", [part("p", "Read", { status })])])).result,
      counts(0),
    );
  }
  const missingOutput = part("p") as unknown as { state: Record<string, unknown> };
  delete missingOutput.state.output;
  assert.deepEqual(
    (await restore([message("m", [missingOutput as unknown as MessagePart])])).result,
    counts(0),
  );
  assert.deepEqual((await restore([message("m", [part("p")], "user")])).result, counts(0));
  assert.deepEqual((await restore([message("m", [part("p", "Bash")])])).result, counts(0));
});

test("duplicate IDs keep first position and last payload, not last occurrence position", async () => {
  const state = (content: string) => ({
    metadata: { readFileState: snapshot("Read", { content }) },
  });
  const a = part("a", "Read", state("first"));
  const b = part("b", "Read", state("middle"));
  const aAgain = part("a", "Read", state("replacement"));
  const { states, result } = await restore([message("m", [a, b, aAgain])]);
  assert.deepEqual(result, counts(2));
  assert.equal([...states.values()][0]?.content, "middle");
});

test("history order wins over readAt timestamps and counts each accepted snapshot", async () => {
  const first = part("a", "Read", {
    metadata: { readFileState: snapshot("Read", { readAtMs: 99999, content: "older message" }) },
  });
  const later = part("b", "Edit", {
    metadata: {
      readFileState: snapshot("Edit", {
        readAtMs: 1,
        content: "later message",
        isPartialView: true,
        sizeBytes: 999,
      }),
    },
  });
  const { states, result } = await restore([message("m1", [first]), message("m2", [later])]);
  assert.deepEqual(result, counts(2));
  assert.equal(states.size, 1);
  const value = [...states.values()][0]!;
  assert.equal(value.content, "later message");
  assert.equal(value.readAt.getTime(), 1);
  assert.equal(value.sizeBytes, 999);
  assert.equal(value.isPartialView, true);
});

test("rewind kept IDs and branch-cut continuation exclude abandoned snapshots", async () => {
  const messages = ["kept", "target", "cut", "new"].map((id) =>
    message(id, [
      part(id, "Read", { metadata: { readFileState: snapshot("Read", { path: `/${id}` }) } }),
    ]),
  );
  const { states, result } = await restore(messages, {
    rewindTargetMessageId: "target" as MessageId,
    rewindKeptMessageIds: ["kept"],
    branchCutAfterMessageId: "cut",
  });
  assert.deepEqual(result, counts(2));
  assert.deepEqual(
    [...states.values()].map((value) => value.path),
    ["/kept", "/new"],
  );
});

test("restoring the same transcript twice is stable and does not mutate input", async () => {
  const messages = [message("m", [part("p")])];
  const before = JSON.stringify(messages);
  const one = await restore(messages);
  const two = await restore(messages, { readFileState: one.states });
  assert.deepEqual(two.result, counts(1));
  assert.equal(one.states.size, 1);
  assert.equal(JSON.stringify(messages), before);
});

test("compaction never revives preserved pre-boundary file watermarks", async () => {
  const before = message("before", [
    part("old", "Read", { metadata: { readFileState: snapshot("Read", { path: "/old" }) } }),
  ]);
  const boundary = message("boundary", [
    {
      id: "compact",
      type: "compaction",
      compactBoundary: {
        preservedSegment: {
          headMessageId: "before",
          tailMessageId: "before",
          anchorMessageId: "boundary",
        },
      },
    } as unknown as MessagePart,
  ]);
  const after = message("after", [
    part("new", "Read", { metadata: { readFileState: snapshot("Read", { path: "/new" }) } }),
  ]);
  const { result, states } = await restore([before, boundary, after]);
  assert.deepEqual(result, counts(1));
  assert.deepEqual(
    [...states.values()].map((value) => value.path),
    ["/new"],
  );
});
