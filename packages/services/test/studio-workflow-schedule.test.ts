import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AutomationRepo } from "../src/session/automationRepo.js";
import { AutomationService } from "../src/session/automationService.js";
import { runTasksDatabaseMigrations } from "../src/session/tasksDatabase/migrations.js";

test("existing task database upgrades Studio schedule without changing historical checksums", () => {
  const db = new DatabaseSync(":memory:");
  try {
    runTasksDatabaseMigrations(db);
    const historical = db.prepare("SELECT id, checksum FROM tasks_schema_migration WHERE id < '0005' ORDER BY id").all();
    db.exec("ALTER TABLE automations DROP COLUMN studio_workflow_id");
    db.prepare("DELETE FROM tasks_schema_migration WHERE id='0005_studio_workflow_schedule'").run();
    db.prepare(`INSERT INTO automations
      (automation_id, cron_expr, prompt, workspace_key, workspace_path, created_at, updated_at)
      VALUES ('before-upgrade', '0 9 * * *', 'keep input', 'project', '/project', 1, 1)`).run();
    runTasksDatabaseMigrations(db);
    assert.deepEqual(db.prepare("SELECT id, checksum FROM tasks_schema_migration WHERE id < '0005' ORDER BY id").all(), historical);
    const oldAutomation = db.prepare("SELECT studio_workflow_id, prompt FROM automations WHERE automation_id='before-upgrade'").get();
    assert.equal(oldAutomation?.studio_workflow_id, null);
    assert.equal(oldAutomation?.prompt, "keep input");
    assert.ok(db.prepare("SELECT 1 FROM tasks_schema_migration WHERE id='0005_studio_workflow_schedule'").get());
  } finally {
    db.close();
  }
});

test("Studio schedule survives repo restart and unfinished run can be observed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-studio-schedule-"));
  const path = join(dir, "tasks-index.sqlite");
  let repo = new AutomationRepo(path);
  t.after(async () => { repo.close(); await rm(dir, { recursive: true, force: true }); });
  const service = new AutomationService(repo);
  const created = await service.create({
    title: "Morning review",
    cronExpr: "0 9 * * *",
    prompt: "Check release readiness",
    recurring: true,
    workspacePath: join(dir, "project"),
    studioWorkflowId: "workflow-1",
  });
  assert.equal(created.studioWorkflowId, "workflow-1");
  assert.equal(created.modelSelection, undefined);
  const runId = `${created.automationId}:1000`;
  await repo.upsertRunClaimed({
    runId, automationId: created.automationId, workspaceKey: created.workspaceKey,
    scheduledAt: 1000, trigger: "schedule",
  });
  await repo.markRunDispatch({ runId, dispatchStatus: "dispatched", sessionId: "studio-run-1" });
  await repo.markRunOutcome(runId, "running");
  repo.close();
  repo = new AutomationRepo(path);
  assert.equal((await repo.get(created.automationId))?.studioWorkflowId, "workflow-1");
  assert.deepEqual(await repo.listUnsettledStudioWorkflowRuns(), [{
    automationRunId: runId,
    automationId: created.automationId,
    workspaceKey: created.workspaceKey,
    scheduledAt: 1000,
    trigger: "schedule",
    studioRunId: "studio-run-1",
    workflowId: "workflow-1",
  }]);
  await repo.markRunOutcome(runId, "succeeded");
  await repo.markRunOutcome(runId, "running");
  assert.equal((await repo.getRun(runId))?.outcome, "succeeded");
  assert.deepEqual(await repo.listUnsettledStudioWorkflowRuns(), []);
});

test("Studio schedule rejects a chat binding, model override and invalid target", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-studio-schedule-invalid-"));
  const repo = new AutomationRepo(join(dir, "tasks-index.sqlite"));
  t.after(async () => { repo.close(); await rm(dir, { recursive: true, force: true }); });
  const service = new AutomationService(repo);
  const base = {
    title: "Review", cronExpr: "0 9 * * *", prompt: "Check", recurring: true,
    workspacePath: join(dir, "project"), studioWorkflowId: "workflow-1",
  };
  await assert.rejects(service.create({ ...base, targetTaskId: "chat-1" }), /不能绑定聊天会话/);
  await assert.rejects(service.create({ ...base, modelSelection: { providerId: "p", modelId: "m" } }), /不能绑定聊天会话/);
  await assert.rejects(service.create({ ...base, studioWorkflowId: "bad id" }), /无效的 Studio 工作流/);
  assert.deepEqual(await repo.list(), []);
});
