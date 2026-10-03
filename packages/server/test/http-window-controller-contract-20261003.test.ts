import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { connectViaWebSocket } from "@knorvia/client";
import { Emitter } from "@knorvia/rpc";
import {
  IKnorviaTaskService,
  IWindowControllerService,
  ServiceCollection,
  type KnorviaTaskListWorkspaceScope,
  type WindowHostControllerFrame,
} from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { CONTROLLER_TASKS_INDEX_TOPIC } from "@knorvia/shared/protocol-v4";
import { createHttpServer } from "../src/http.ts";
import { createHttpWindowController } from "../src/httpWindowController.ts";

function taskSource() {
  const workspace = { workspacePath: "synthetic/中文 workspace", workspaceIdentity: "fixture-a" };
  const meta: KnorviaTaskMeta = {
    ...workspace,
    taskId: "synthetic-task",
    traceId: "synthetic-trace",
    title: "保留任务",
    createdAt: 1,
    updatedAt: 2,
    mode: "build",
    status: "running",
  };
  const events = new Emitter<void>();
  let pinned = true;
  let activeObservers = 0;
  let observerStarts = 0;
  const writes: unknown[] = [];
  const reads: KnorviaTaskListWorkspaceScope[] = [];
  const service = {
    async listTasks(scope: KnorviaTaskListWorkspaceScope) {
      reads.push(scope);
      return [{ ...meta }];
    },
    async listPinnedTasks() {
      return pinned ? [{ ...meta }] : [];
    },
    async listArchivedTasks() {
      return [];
    },
    async setTaskPinned(params: { pinned: boolean }) {
      writes.push(params);
      pinned = params.pinned;
      events.fire();
      return { ...meta };
    },
    onDynamicWorkspaceEvent() {
      observerStarts++;
      return (listener: () => void) => {
        activeObservers++;
        const subscription = events.event(listener);
        let closed = false;
        return {
          dispose() {
            if (closed) return;
            closed = true;
            activeObservers--;
            subscription.dispose();
          },
        };
      };
    },
  } as unknown as IKnorviaTaskService;
  return {
    workspace,
    meta,
    writes,
    reads,
    services: new ServiceCollection().register(IKnorviaTaskService, service),
    observers: () => ({ active: activeObservers, starts: observerStarts }),
  };
}

async function readSnapshot(controller: IWindowControllerService, subscriptionId: string) {
  let receive!: (frame: WindowHostControllerFrame) => void;
  const received = new Promise<WindowHostControllerFrame>((resolve) => {
    receive = resolve;
  });
  const listener = controller.onDynamicControllerFrame()((frame) => {
    if (frame.subscriptionId === subscriptionId && frame.payload.kind === "snapshot") {
      receive(frame);
    }
  });
  try {
    await controller.resyncControllerV4({ subscriptionId });
    const frame = await received;
    assert.equal(frame.topic, CONTROLLER_TASKS_INDEX_TOPIC);
    if (frame.topic !== CONTROLLER_TASKS_INDEX_TOPIC || frame.payload.kind !== "snapshot") {
      throw new Error("expected controller task snapshot");
    }
    return frame.payload.snapshot.tasks;
  } finally {
    listener.dispose();
  }
}

test("HTTP Web exposes the real controller descriptor and keeps task writes with the source", async (t) => {
  const source = taskSource();
  const server = createHttpServer(source.services, 0, { host: "127.0.0.1" });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    await Promise.all(
      sockets.map(async (socket) => {
        if (socket.readyState === WebSocket.CLOSED) return;
        const closed = once(socket, "close");
        socket.close();
        await closed;
      }),
    );
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    assert.equal(source.observers().active, 0);
  });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const connect = async () => {
    const services = await connectViaWebSocket(url, {
      onOpenSocket: (socket) => sockets.push(socket),
    });
    assert.ok(services.windowControllerService);
    return services.windowControllerService;
  };
  const left = await connect();
  const right = await connect();
  const a = await left.subscribeControllerV4({ topic: CONTROLLER_TASKS_INDEX_TOPIC });
  const b = await right.subscribeControllerV4({ topic: CONTROLLER_TASKS_INDEX_TOPIC });
  assert.notEqual(a.ack.subscriptionId, b.ack.subscriptionId);
  const query = {
    kind: "pinned" as const,
    sortBy: "updated" as const,
    workspaceScopes: [source.workspace],
  };
  const pinned = await left.listTaskList(query);
  assert.equal(pinned.items[0]?.taskId, source.meta.taskId);
  assert.equal(pinned.items[0]?.sourceAvailability, "online");
  assert.equal(pinned.items[0]?.liveStatus, "idle", "stored running is not current runtime proof");
  await right.listTaskList(query);
  assert.deepEqual(source.reads, [source.workspace]);
  assert.deepEqual(source.observers(), { active: 1, starts: 1 });
  const taskAddress = { ...source.workspace, taskId: source.meta.taskId };
  await right.mutateTask({ address: taskAddress, mutation: { kind: "pin", pinned: false } });
  assert.deepEqual(source.writes, [{ ...taskAddress, pinned: false }]);
  const rows = await readSnapshot(left, a.ack.subscriptionId);
  assert.equal(rows[0]?.membership.pinned, false);
  assert.deepEqual(rows[0]?.address, taskAddress);
  await assert.rejects(
    right.mutateTask({
      address: { ...taskAddress, remoteSessionId: "other-source" },
      mutation: { kind: "pin", pinned: true },
    }),
    /source/,
  );
  assert.equal(source.writes.length, 1);
});

test("controller attachments isolate unsubscribe and close while sharing the Host projection", async (t) => {
  const source = taskSource();
  const owner = createHttpWindowController(source.services);
  assert.ok(owner);
  const left = owner.createAttachmentService();
  const right = owner.createAttachmentService();
  t.after(() => {
    left.dispose();
    right.dispose();
    owner.dispose();
  });
  const a = await left.subscribeControllerV4({ topic: CONTROLLER_TASKS_INDEX_TOPIC });
  const b = await right.subscribeControllerV4({ topic: CONTROLLER_TASKS_INDEX_TOPIC });
  await right.unsubscribeControllerV4({ subscriptionId: a.ack.subscriptionId });
  await left.listTaskList({
    kind: "pinned",
    sortBy: "updated",
    workspaceScopes: [source.workspace],
  });
  assert.equal((await readSnapshot(left, a.ack.subscriptionId)).length, 1);
  left.dispose();
  await assert.rejects(right.resyncControllerV4({ subscriptionId: a.ack.subscriptionId }));
  assert.equal((await readSnapshot(right, b.ack.subscriptionId)).length, 1);
  assert.deepEqual(source.observers(), { active: 1, starts: 1 });
  right.dispose();
  owner.dispose();
  assert.equal(source.observers().active, 0);
});

test("HTTP composition preserves existing controllers and does not invent file-only business capability", () => {
  assert.equal(createHttpWindowController(new ServiceCollection()), undefined);
  const source = taskSource();
  const supplied = {} as IWindowControllerService;
  source.services.register(IWindowControllerService, supplied);
  assert.equal(createHttpWindowController(source.services), undefined);
  assert.equal(source.services.get(IWindowControllerService), supplied);
});
