// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { TestContext } from "node:test";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { createWorkspaceRuntimePort } from "../src/studio-runtime/adapters/workspaceRuntimeProcess.js";
import { StudioWorkspaceRuntime } from "../src/studio-runtime/app/workspaceRuntime.js";
import { workspaceRuntimeTarget } from "../src/studio-runtime/app/workspaceRuntimeTarget.js";
import type { WorkspaceRuntimePort } from "../src/studio-runtime/app/workspaceRuntimePort.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type {
  StudioWorkspaceRuntimeControl,
  StudioWorkspaceRuntimeState,
} from "../src/studio-runtime/workspaceRuntimeTypes.js";

export const serverCommand = {
  executable: process.execPath,
  args: [
    "-e",
    "require('http').createServer((q,r)=>r.end('runtime fixture')).listen(Number(process.env.PORT),process.env.HOST)",
  ],
};
export const runtimeClock = {
  now: Date.now,
  id: randomUUID,
  delay: (ms: number, signal?: AbortSignal) => sleep(ms, undefined, { signal }),
};
export const runtimeHost = {
  id: process.pid,
  alive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  },
};
export async function runtimeFixture(t: TestContext, override?: Partial<WorkspaceRuntimePort>) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-workspace-runtime-"));
  const source = join(root, "project");
  await mkdir(source);
  await writeFile(join(source, "dirty.txt"), "uncommitted source");
  const path = join(root, "studio.sqlite");
  const db = new StudioDatabase(path);
  const workspaces = createStudioWorkspaceManager(join(root, "data"));
  const io = { ...createWorkspaceRuntimePort(), ...override };
  const owner = new StudioWorkspaceRuntime({
    db,
    clock: runtimeClock,
    host: runtimeHost,
    io,
    changed() {},
  });
  t.after(async () => {
    await owner.dispose();
    db.close();
    await rm(root, { recursive: true, force: true });
  });
  async function add(id: string) {
    const working = await workspaces.prepare({
      runId: id,
      stepId: "knorvia",
      sourcePath: source,
      mode: "isolated",
    });
    const run: StoredRun = {
      id,
      targetId: `group-${id}`,
      kind: "group",
      state: "succeeded",
      input: "fixture",
      attempt: 0,
      createdAt: 1,
      updatedAt: 1,
      checkpoint: { steps: {}, values: {}, completedRounds: 0 },
      definition: {
        id: `group-${id}`,
        name: "fixture",
        goal: "fixture",
        members: ["knorvia"],
        host: "knorvia",
        sharedSummary: "",
        mode: "task",
        workspaceMode: "isolated",
        workspacePath: source,
        createdAt: 1,
        updatedAt: 1,
      },
    };
    db.transaction(() => {
      db.write("run", id, run);
      db.write("workspace", `${id}:step`, {
        runId: id,
        stepId: "knorvia",
        path: working,
        sourcePath: source,
      });
    });
    const request = (control?: StudioWorkspaceRuntimeControl) =>
      owner.request({ runId: id, stepId: "step", control });
    const wait = async (phase: StudioWorkspaceRuntimeState["phase"]) => {
      const deadline = Date.now() + 12_000;
      let state = await request();
      while (state.phase !== phase && Date.now() < deadline) {
        await sleep(30);
        state = await request();
      }
      assert.equal(state.phase, phase, JSON.stringify(state));
      return state;
    };
    const prepare = async () => {
      await request({ action: "prepare", approved: true });
      return wait("prepared");
    };
    const start = async () => {
      await prepare();
      await request({ action: "start", approved: true, command: serverCommand, timeoutMs: 5000 });
      return wait("ready");
    };
    return {
      working,
      request,
      wait,
      prepare,
      start,
      // 修复：复用 owner 的目标身份，Windows 路径不能以原始大小写另造数据库键。
      key: workspaceRuntimeTarget(db, id, "step").key,
    };
  }
  return { root, path, source, db, io, owner, workspaces, add };
}
