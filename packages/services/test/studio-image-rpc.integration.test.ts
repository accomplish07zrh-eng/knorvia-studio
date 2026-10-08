import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import { connectStudioRpc } from "./fixtures/studio-rpc.integration.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { seedLegacyStudioDatabase } from "./fixtures/studio-legacy-v010.integration.js";

async function host(project: string, path: string) {
  await seedLegacyStudioDatabase(path, project);
  const db = new StudioDatabase(path);
  const owner = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => delay(ms, undefined, { signal }),
    },
    kernels: {
      adapter: () => ({
        async run() {
          throw new Error("Read-only RPC acceptance cannot dispatch");
        },
      }),
      inspect: async () => [],
      manage: async () => {
        throw new Error("unused");
      },
      dispose: async () => {},
    },
    workspaces: {
      prepare: async ({ sourcePath }) => sourcePath,
      changes: async () => [],
      apply: async () => {},
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  const connection = connectStudioRpc(owner);
  return {
    db,
    owner,
    ...connection,
    async dispose() {
      connection.close();
      await owner.disposeAllAndWait();
    },
  };
}

test(
  "legacy optional timeline arguments survive actual RPC and stay bound to their original Host",
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-legacy-rpc-integration-"));
    const first = await host(join(root, "project-a"), join(root, "a.sqlite"));
    const second = await host(join(root, "project-b"), join(root, "b.sqlite"));
    try {
      assert.equal(
        (await first.service.overview()).conversations[0]!.workspacePath,
        join(root, "project-a"),
      );
      assert.equal(
        (await second.service.overview()).conversations[0]!.workspacePath,
        join(root, "project-b"),
      );
      const simple = await first.service.timeline("legacy-chat");
      assert.equal(simple.messages[0]!.text, "旧正文保留");
      const focused = await first.service.timeline("legacy-chat", undefined, "legacy-run");
      assert.equal(focused.runs[0]!.id, "legacy-run");
      assert.equal(focused.messages[0]!.sequence, 3);
      const older = await first.service.timeline("legacy-chat", 4);
      assert.equal(older.messages[0]!.id, "legacy-message");
      await assert.rejects(first.service.timeline("other", undefined, "legacy-run"), /不属于/);
      const original = {
        commandId: "legacy-command",
        type: "send" as const,
        kind: "chat" as const,
        targetId: "legacy-chat",
        text: "旧纯文字输入",
      };
      assert.deepEqual(await first.service.command(original), { id: "legacy-run", revision: 23 });
      await assert.rejects(
        first.service.command({ ...original, text: "同 CID 的另一个输入" }),
        /不同操作/,
      );
      assert.equal(first.db.revision(), 23);
      assert.equal(second.db.revision(), 23);
      first.close();
      await assert.rejects(first.service.overview(), /disposed/);
      assert.equal(
        (await second.service.timeline("legacy-chat", undefined, "legacy-run")).runs[0]!.id,
        "legacy-run",
      );
    } finally {
      await first.dispose();
      await second.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
