// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：background-task 六件（behavior B13–B19）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";

const controls = await loadModule("background-task-controls");
const merge = await loadModule("background-task-control-merge");
const bashJobs = await loadModule("background-bash-jobs");
const output = await loadModule("background-bash-output");
const display = await loadModule("bash-output-display");
const notifications = await loadModule("background-task-notifications");

test("B13 控制项解析：kind/command/jobId/status 归一", () => {
  const items = controls.parseKnorviaBackgroundTaskControlItems([
    { taskKind: "local_bash", command: "npm test", status: "in_progress", jobId: "j1", pid: 12 },
    { toolName: "task", description: "整理文档", status: "killed", jobId: "j2" },
    { type: "background_agent", title: "调研", status: "spawn_error", jobId: "j3" },
    { taskKind: "unknown_kind", command: "x", status: "running", jobId: "j4" },
    { taskKind: "bash", jobId: "j5" },
  ]);
  assert.equal(items.length, 3, "unknown kind 与缺 command 丢弃");
  assert.equal(items[0].taskKind, "bash");
  assert.equal(items[1].taskKind, "agent");
  assert.equal(items[1].command, "整理文档", "agent description 优先");
  assert.equal(items[2].status, "failed", "spawn_error → failed");
  assert.equal(items[0].pid, 12);
  assert.deepEqual(controls.parseKnorviaBackgroundTaskControlItems("nope"), []);
});

test("B13 jobId 合成与 status 缺席按 running", () => {
  const [item] = controls.parseKnorviaBackgroundTaskControlItems([
    { taskKind: "bash", command: "ls", pid: 7, startedAt: 1000 },
  ]);
  assert.equal(item.jobId, "background-task:7:1000:ls");
  assert.equal(item.status, "running");
  const [noPid] = controls.parseKnorviaBackgroundTaskControlItems([
    { taskKind: "bash", command: "ls" },
  ]);
  assert.equal(noPid.jobId, "background-task:no-pid:no-start:ls");
});

test("B14 活跃/时长/可见", () => {
  const job = { jobId: "j", taskKind: "bash", command: "x", status: "running", startedAt: 1000 };
  assert.equal(controls.isActiveKnorviaBackgroundTaskControlItem(job), true);
  assert.equal(controls.isActiveKnorviaBackgroundTaskControlItem({ ...job, status: "killed" }), false);
  assert.equal(controls.getKnorviaBackgroundTaskControlItemElapsedMs(job, 3000), 2000);
  assert.equal(controls.getKnorviaBackgroundTaskControlItemElapsedMs({ ...job, elapsedMs: 5000 }, 3000), 5000);
  const visible = controls.collectVisibleKnorviaBackgroundTaskControlItems(
    [job, { ...job, jobId: "j2", startedAt: 2000, status: "completed" }],
    3000,
    1500,
  );
  assert.equal(visible.length, 1);
  assert.equal(visible[0].elapsedMs, 2000);
});

test("B15 合并保位语义", () => {
  const merged = merge.mergeKnorviaBackgroundTaskControlItems(
    [
      { jobId: "a", taskKind: "bash", command: "1", status: "running" },
      { jobId: "b", taskKind: "bash", command: "2", status: "running" },
    ],
    [
      { jobId: "b", taskKind: "bash", command: "2x", status: "completed" },
      { jobId: "c", taskKind: "bash", command: "3", status: "running" },
    ],
  );
  assert.deepEqual(merged.map((x) => x.jobId), ["a", "b", "c"]);
  assert.equal(merged[1].command, "2x", "后值生效");
});

test("B16 bash 视图过滤", () => {
  const jobs = bashJobs.parseKnorviaBackgroundBashJobs([
    { taskKind: "bash", command: "x", status: "running", jobId: "b1" },
    { taskKind: "agent", command: "y", status: "running", jobId: "a1" },
  ]);
  assert.equal(jobs.length, 1);
  assert.equal(bashJobs.isActiveKnorviaBackgroundBashJob(jobs[0]), true);
});

test("B17/B18 输出 schema 边界（8192 与 150000/32768）", () => {
  assert.equal(output.BACKGROUND_BASH_OUTPUT_MAX_BYTES, 8192);
  const ok = output.backgroundBashOutputSchema.safeParse({
    kind: "output",
    workId: "w",
    status: "running",
    output: "x".repeat(8192),
    truncated: true,
    outputPath: "/tmp/out",
  });
  assert.equal(ok.success, true);
  const over = output.backgroundBashOutputSchema.safeParse({
    kind: "output",
    workId: "w",
    status: "running",
    output: "x".repeat(8193),
    truncated: true,
    outputPath: "/tmp/out",
  });
  assert.equal(over.success, false);
  const alt = output.backgroundBashOutputResultSchema.safeParse({
    kind: "unavailable",
    workId: "w",
  });
  assert.equal(alt.success, true);
  const disp = display.bashOutputDisplaySchema.safeParse({
    kind: "bash_output",
    output: "head",
    truncated: false,
  });
  assert.equal(disp.success, true);
  const dispBad = display.bashOutputDisplaySchema.safeParse({
    kind: "bash_output",
    output: "head",
    truncated: false,
    extra: 1,
  });
  assert.equal(dispBad.success, false, "strict 拒多字段");
});

test("B19 通知解析/状态映射/装配", () => {
  const parsed = notifications.parseKnorviaBackgroundTaskNotificationText(
    '<task-notification><tool-use-id>tu-1</tool-use-id><status>killed</status><summary>a &amp; b</summary></task-notification>',
  );
  assert.equal(parsed.toolUseId, "tu-1");
  assert.equal(parsed.notification.status, "killed");
  assert.equal(parsed.notification.summary, "a & b", "&amp; 最后反转");
  assert.equal(notifications.parseKnorviaBackgroundTaskNotificationText("hello"), null);
  assert.equal(
    notifications.parseKnorviaBackgroundTaskNotificationText(
      "<task-notification><status>x</status></task-notification>",
    ),
    null,
    "tool-use-id 缺失 → null",
  );
  assert.equal(notifications.knorviaBackgroundTaskNotificationToolUpdateStatus("killed"), "stopped");
  assert.equal(notifications.knorviaBackgroundTaskNotificationToolUpdateStatus("lost"), "failed");
  assert.equal(notifications.knorviaBackgroundTaskNotificationToolUpdateStatus(undefined), "completed");
  const raw = { id: 1, _meta: { keep: true } };
  const attached = notifications.attachKnorviaBackgroundTaskNotificationToRaw(raw, {
    status: "killed",
  });
  assert.equal(attached._meta.knorvia.taskNotification.status, "killed");
  assert.equal(attached._meta.keep, true, "其余键保留");
  assert.deepEqual(
    notifications.attachKnorviaBackgroundTaskNotificationToRaw(raw, undefined),
    raw,
    "无通知原样",
  );
});
