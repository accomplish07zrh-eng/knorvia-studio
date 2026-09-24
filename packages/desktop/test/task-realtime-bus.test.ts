import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { UtilityProcess } from "electron";
import { HostMessageTypes, HostResponseTypes, hostTaskRealtimeDeliverMessageSchema } from "@knorvia/shared";

class FakeHost extends EventEmitter {
  readonly messages: unknown[] = [];
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
  publish(message: unknown): void {
    this.emit("message", message);
  }
  delivered() {
    return this.messages.flatMap((message) => {
      const parsed = hostTaskRealtimeDeliverMessageSchema.safeParse(message);
      return parsed.success ? [parsed.data.event] : [];
    });
  }
}

test("realtime bus forwards validated wire events to owner and observer with continuous sequence", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "knorvia-realtime-bus-"));
  const oldDataDir = process.env.KNORVIA_DATA_BASE_DIR;
  process.env.KNORVIA_DATA_BASE_DIR = dataDir;
  t.after(async () => {
    if (oldDataDir === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
    else process.env.KNORVIA_DATA_BASE_DIR = oldDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });
  const { TaskRealtimeBus } = await import("../src/main/taskRealtimeBus.js");
  const bus = new TaskRealtimeBus({ logger: { info() {}, warn() {} } });
  const owner = new FakeHost();
  const observer = new FakeHost();
  const target = { workspacePath: "/workspace", workspaceKey: "/workspace", taskId: "task-1", runId: "run-1", traceId: "run-1" };
  bus.registerHost({ hostId: "owner", windowId: 1, child: owner as unknown as UtilityProcess, workspaceKeys: [target.workspaceKey] });
  bus.registerHost({ hostId: "observer", windowId: 2, child: observer as unknown as UtilityProcess, workspaceKeys: [target.workspaceKey] });
  owner.publish({ type: HostResponseTypes.TaskRunLeaseAcquire, request: { ...target, leaseRequestId: "lease-1" } });
  assert.equal(bus.collectMemoryDiagnostics().leases, 1);
  const publish = (event: { type: string; taskId: string; traceId: string; [key: string]: unknown }) => owner.publish({
    type: HostResponseTypes.TaskStreamOpPublish,
    target,
    op: { kind: "stream_event", event },
  });
  publish({ type: "agent_message_chunk", taskId: target.taskId, traceId: target.traceId, content: "hello " });
  publish({ type: "agent_message_chunk", taskId: target.taskId, traceId: target.traceId, content: "world" });
  publish({ type: "future_event", taskId: target.taskId, traceId: target.traceId, extra: "preserved" });
  publish({ type: "task_complete", taskId: target.taskId, traceId: target.traceId });

  const ownerBatch = owner.delivered().find((event) => event.type === "task_stream_mirror_batch");
  const observerBatch = observer.delivered().find((event) => event.type === "task_stream_mirror_batch");
  assert.ok(ownerBatch && ownerBatch.type === "task_stream_mirror_batch");
  assert.ok(observerBatch && observerBatch.type === "task_stream_mirror_batch");
  assert.equal(ownerBatch.deliveryPurpose, "relay_owner");
  assert.equal(observerBatch.deliveryPurpose, "observer");
  assert.deepEqual(ownerBatch.ops.map((op) => op.seq), [1, 2, 3]);
  assert.deepEqual(observerBatch.ops, ownerBatch.ops);
  assert.equal(ownerBatch.ops[0]?.kind === "stream_event" && ownerBatch.ops[0].event.content, "hello world");
  assert.equal(ownerBatch.ops[1]?.kind === "stream_event" && ownerBatch.ops[1].event.extra, "preserved");
  assert.equal(ownerBatch.terminal, true);
  assert.equal(bus.collectMemoryDiagnostics().leases, 0);
  assert.equal(bus.collectMemoryDiagnostics().streamBatches, 0);
  assert.ok(owner.messages.some((message) => typeof message === "object" && message !== null && "type" in message && message.type === HostMessageTypes.TaskRunLeaseResult));
  bus.unregisterHost("owner");
  bus.unregisterHost("observer");
});
