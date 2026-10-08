import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { listStudioWorkspaceArtifacts } from "../src/studio-runtime/app/workspaceArtifacts.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";

// specs/knorvia-workbench-artifact-preview-20261008.md

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(join(tmpdir(), "knorvia-workbench-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = join(root, "project");
  await fs.mkdir(source);
  await fs.writeFile(join(source, "old.html"), "<p>old</p>");
  await fs.writeFile(join(source, "same.html"), "<p>same</p>");
  const manager = createStudioWorkspaceManager(join(root, "data"));
  return { root, source, manager };
}

test("artifact scan lists only added or modified web pages with paths inside the isolated copy", async (t) => {
  const f = await fixture(t);
  const working = await f.manager.prepare({
    runId: "run",
    stepId: "step",
    sourcePath: f.source,
    mode: "isolated",
  });
  await fs.mkdir(join(working, "site"), { recursive: true });
  await fs.writeFile(join(working, "site", "index.html"), "<p>pelican</p>");
  await fs.writeFile(join(working, "old.html"), "<p>changed</p>");
  await fs.writeFile(join(working, "notes.txt"), "not a page");
  await fs.writeFile(join(working, ".env.html"), "secret-like");
  const items = await f.manager.artifacts!("run", "step");
  assert.deepEqual(
    items.map((item) => [item.path, item.kind]),
    [
      ["old.html", "modified"],
      ["site/index.html", "added"],
    ],
  );
  assert.equal(items[1]!.previewPath, join(working, "site", "index.html"));
  assert.equal(items[1]!.after, null);
  // 源项目未被修改，扫描是只读的。
  assert.equal(await fs.readFile(join(f.source, "old.html"), "utf8"), "<p>old</p>");
});

test("shared-mode runs have no isolated artifacts", async (t) => {
  const f = await fixture(t);
  await f.manager.prepare({ runId: "run", stepId: "step", sourcePath: f.source, mode: "shared" });
  assert.deepEqual(await f.manager.artifacts!("run", "step"), []);
});

test("artifact listing rejects running runs and remote workspaces but ignores other active runs on the project", async (t) => {
  const f = await fixture(t);
  const db = new StudioDatabase(join(mkdtempSync(join(tmpdir(), "artifact-db-")), "db.sqlite"));
  t.after(() => db.close());
  const now = Date.now();
  const run = (id: string, state: StoredRun["state"]): StoredRun =>
    ({
      id,
      kind: "chat",
      targetId: `chat-${id}`,
      state,
      input: "",
      createdAt: now,
      updatedAt: now,
      attempt: 1,
      checkpoint: { steps: {}, values: {} },
    }) as unknown as StoredRun;
  db.transaction(() => {
    db.write("run", "done", run("done", "succeeded"));
    db.write("run", "busy", run("busy", "running"));
    db.write("run", "remote", run("remote", "succeeded"));
    // 同一项目上另一个格子仍在运行：预览不应被它阻塞。
    db.write("active", "busy", { id: "busy", targetId: "chat-busy" });
    db.write("workspace", "done:step", {
      runId: "done",
      stepId: "step",
      path: "w",
      sourcePath: f.source,
    });
    db.write("workspace", "busy:step", {
      runId: "busy",
      stepId: "step",
      path: "w",
      sourcePath: f.source,
    });
    db.write("workspace", "remote:step", {
      runId: "remote",
      stepId: "step",
      path: "w",
      sourcePath: f.source,
      remoteKernelId: "ssh:aaaaaaaaaaaaaaaaaaaaaaaa:codex",
    });
  });
  const calls: string[] = [];
  const workspaces = {
    artifacts: async (runId: string) => {
      calls.push(runId);
      return [];
    },
  } as never;
  assert.deepEqual(
    await listStudioWorkspaceArtifacts({ db, workspaces }, { runId: "done", stepId: "step" }),
    [],
  );
  await assert.rejects(
    listStudioWorkspaceArtifacts({ db, workspaces }, { runId: "busy", stepId: "step" }),
    /仍在运行/,
  );
  await assert.rejects(
    listStudioWorkspaceArtifacts({ db, workspaces }, { runId: "remote", stepId: "step" }),
    /远端/,
  );
  await assert.rejects(
    listStudioWorkspaceArtifacts({ db, workspaces }, { runId: randomUUID(), stepId: "step" }),
  );
  assert.deepEqual(calls, ["done"]);
});
