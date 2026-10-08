import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { saveTurnEvent } from "../src/studio-runtime/app/turnEvents.js";
import { createRemoteKernelAdapter } from "../src/studio-runtime/adapters/kernels/remoteKernelBridge.js";
import { remoteStudioKernelId } from "../src/studio-runtime/adapters/kernels/remoteAgentIdentity.js";
import type {
  IStudioRuntimeService,
  StudioKernelEvent,
  StudioMessage,
} from "../src/studio-runtime/contract.js";
import type { StoredRun, StudioClock } from "../src/studio-runtime/app/storePort.js";

const first: Extract<StudioKernelEvent, { type: "tool" }> = {
  type: "tool",
  id: "tool",
  name: "Fixture",
  state: "running",
  input: "input",
  output: "output",
  content: '[{"type":"text","text":"typed"}]',
  statusDetail: "in_progress",
};
test("real SQLite tool fields survive sparse update and reopen; old text stays readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-projection-"));
  const path = join(directory, "test.sqlite");
  let db = new StudioDatabase(path);
  const clock = { now: Date.now, id: randomUUID } as StudioClock;
  const run = { id: "run", targetId: "chat" } as StoredRun;
  try {
    db.transaction(() => saveTurnEvent(db, clock, run, "turn", "codex", first, "step"));
    db.transaction(() =>
      saveTurnEvent(
        db,
        clock,
        run,
        "turn",
        "codex",
        {
          type: "tool",
          id: "tool",
          name: "Fixture",
          state: "unknown",
          statusDetail: "vendor_pending",
        },
        "step",
      ),
    );
    const legacy = {
      id: "old",
      targetId: "chat",
      runId: "run",
      sender: "codex",
      kind: "tool",
      text: "legacy only",
      createdAt: 1,
      updatedAt: 1,
    };
    db.transaction(() => db.write("message", "old", legacy, "chat"));
    db.close();
    db = new StudioDatabase(path);
    const message = db.read<StudioMessage>("message", "turn:tool:tool")!;
    assert.equal(message.input, "input");
    assert.equal(message.output, "output");
    assert.equal(message.content, first.content);
    assert.equal(message.statusDetail, "vendor_pending");
    assert.equal(message.state, "unknown");
    assert.deepEqual(db.read("message", "old"), legacy);
    db.transaction(() =>
      saveTurnEvent(
        db,
        clock,
        run,
        "turn",
        "codex",
        {
          type: "tool",
          id: "remote-legacy",
          name: "Legacy",
          state: "unknown",
          legacyText: "old undifferentiated detail",
          statusDetail: "vendor_pending",
        },
        "step",
      ),
    );
    const remoteLegacy = db.read<StudioMessage>("message", "turn:tool:remote-legacy")!;
    assert.equal(remoteLegacy.text, "old undifferentiated detail");
    assert.equal(remoteLegacy.output, undefined);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("remote bridge preserves and detects detail-only changes without inventing status", async () => {
  const identity = "ssh://fixture/project";
  const kernel = remoteStudioKernelId(identity, "codex");
  let polls = 0;
  const events: StudioKernelEvent[] = [];
  const service = {
    async command() {
      return { id: "run", revision: 1 };
    },
    async timeline() {
      polls++;
      return {
        revision: polls,
        interactions: [],
        messages:
          polls === 3
            ? [
                {
                  id: "legacy",
                  kind: "tool",
                  runId: "run",
                  text: "old undifferentiated detail",
                  state: "vendor_pending",
                },
              ]
            : [
                {
                  ...first,
                  id: "tool",
                  kind: "tool",
                  targetId: "chat",
                  runId: "run",
                  sender: "codex",
                  state: "vendor_pending",
                  text: "output",
                  input: polls === 1 ? "input" : "changed input",
                  createdAt: 1,
                  updatedAt: polls,
                },
              ],
        runs: [{ id: "run", state: polls < 3 ? "running" : "succeeded", resultKnown: true }],
      };
    },
  } as unknown as IStudioRuntimeService;
  const result = await createRemoteKernelAdapter(kernel, () => [
    { workspaceIdentity: identity, workspacePath: "/fixture", label: "fixture", service },
  ]).run(
    {
      kernel,
      runId: "local",
      turnId: "turn",
      conversationId: "chat",
      workspacePath: "/fixture",
      permission: "ask",
      text: "fixture",
    },
    {
      async emit(event) {
        events.push(event);
      },
      async ask() {
        return { decision: "deny" };
      },
    },
    new AbortController().signal,
  );
  assert.equal(result.status, "succeeded");
  const tools = events.filter((e) => e.type === "tool");
  assert.equal(tools.length, 3);
  assert.equal(tools[0].input, "input");
  assert.equal(tools[1].input, "changed input");
  assert.equal(tools[1].output, "output");
  assert.equal(tools[1].content, first.content);
  assert.equal(tools[1].state, "unknown");
  assert.match(tools[1].statusDetail ?? "", /vendor_pending/);
  assert.equal(tools[2].output, undefined);
  assert.equal(tools[2].legacyText, "old undifferentiated detail");
});

test("remote unknown terminal cannot become a known failed result", async () => {
  const identity = "ssh://fixture/project";
  const kernel = remoteStudioKernelId(identity, "codex");
  const service = {
    async command() {
      return { id: "run", revision: 1 };
    },
    async timeline() {
      return {
        revision: 1,
        messages: [],
        interactions: [],
        runs: [{ id: "run", state: "vendor_finished", resultKnown: true }],
      };
    },
  } as unknown as IStudioRuntimeService;
  const result = await createRemoteKernelAdapter(kernel, () => [
    { workspaceIdentity: identity, workspacePath: "/fixture", label: "fixture", service },
  ]).run(
    {
      kernel,
      runId: "local",
      turnId: "turn",
      conversationId: "chat",
      workspacePath: "/fixture",
      permission: "ask",
      text: "fixture",
    },
    {
      async emit() {},
      async ask() {
        return { decision: "deny" };
      },
    },
    new AbortController().signal,
  );
  assert.equal(result.status, "interrupted");
  assert.equal(result.resultKnown, false);
  assert.match(result.error ?? "", /vendor_finished/);
});
