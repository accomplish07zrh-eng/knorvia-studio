import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { remoteStudioKernelId } from "../src/studio-runtime/adapters/kernels/remoteAgentIdentity.js";
import { assertRemoteStudioMembersOnline } from "../src/studio-runtime/app/remoteAdmission.js";
import type { StudioKernelRegistry } from "../src/studio-runtime/app/ports.js";
import type { StudioKernelStatus } from "../src/studio-runtime/kernelTypes.js";
import { group } from "./studio-orchestration-support.js";

test("offline SSH member remains visible but cannot receive a new group task", async () => {
  const path = mkdtempSync(join(tmpdir(), "knorvia-remote-admission-"));
  const db = new StudioDatabase(join(path, "runtime.sqlite"));
  const remoteId = remoteStudioKernelId("ssh://alice@server-a/project", "codex");
  const remoteStatus: StudioKernelStatus = {
    id: remoteId,
    displayName: "Codex · alice@server-a",
    installed: true,
    origin: "external",
    management: "external",
    remoteWorkspacePath: "/srv/project",
    remoteEnvironmentLabel: "alice@server-a",
    capabilities: {
      resume: true,
      approval: true,
      questions: true,
      readOnly: true,
      fullAccess: true,
    },
  };
  let online = true;
  const kernels = {
    inspect: async () => (online ? [remoteStatus] : []),
    remoteWorkspace: () => (online ? {} : undefined),
    adapter: () => {
      throw new Error("No turn should be dispatched");
    },
    manage: async () => remoteStatus,
    dispose: async () => {},
  } as unknown as StudioKernelRegistry;
  let localChanges = 0;
  let localApplies = 0;
  const service = new StudioRuntimeService({
    db,
    clock: { now: Date.now, id: randomUUID, delay: async () => {} },
    kernels,
    workspaces: {
      prepare: async () => path,
      changes: async () => {
        localChanges++;
        return [];
      },
      apply: async () => {
        localApplies++;
      },
    },
    onDidChange: Event.None,
    notify: () => {},
  });
  try {
    assert.equal(
      (await service.inspectKernels()).find((status) => status.id === remoteId)?.installed,
      true,
    );
    online = false;
    const offline = (await service.inspectKernels()).find((status) => status.id === remoteId);
    assert.equal(offline?.installed, false);
    assert.equal(offline?.remoteWorkspacePath, "/srv/project");
    const mixed = { ...group, members: ["codex", remoteId], host: "codex" };
    db.transaction(() => db.write("group", mixed.id, mixed));
    const task = {
      commandId: "task",
      type: "send" as const,
      kind: "group" as const,
      targetId: mixed.id,
      text: "Check both",
      taskMode: true,
    };
    assert.throws(() => assertRemoteStudioMembersOnline(task, db, kernels), /离线/);
    assert.doesNotThrow(() =>
      assertRemoteStudioMembersOnline(
        {
          ...task,
          taskMode: false,
          text: "@codex check local",
        },
        db,
        kernels,
      ),
    );
    assert.throws(
      () =>
        assertRemoteStudioMembersOnline(
          {
            ...task,
            taskMode: false,
            text: `@${remoteId} check remote`,
          },
          db,
          kernels,
        ),
      /离线/,
    );
    db.transaction(() => {
      db.write("run", "finished-run", {
        id: "finished-run",
        targetId: mixed.id,
        state: "succeeded",
      });
      db.write("workspace", "finished-run:remote-step", {
        runId: "finished-run",
        stepId: "remote-step",
        sourcePath: path,
        path: "/srv/project/.knorvia-agent/remote-step",
        remoteKernelId: remoteId,
      });
    });
    await assert.rejects(
      service.workspaceChanges({ runId: "finished-run", stepId: "remote-step" }),
      /远端.*连接/,
    );
    await assert.rejects(
      service.applyWorkspaceChanges({
        runId: "finished-run",
        stepId: "remote-step",
        paths: ["result.txt"],
      }),
      /远端.*连接/,
    );
    assert.equal(localChanges, 0);
    assert.equal(localApplies, 0);
    assert.equal(db.list("apply-lock").length, 1, "uncertain remote apply keeps a recovery lock");
  } finally {
    await service.disposeAllAndWait();
    rmSync(path, { recursive: true, force: true });
  }
});
