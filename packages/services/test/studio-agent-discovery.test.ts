// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, until } from "./studio-agent-tools.fixture.js";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("configured local catalog uses production inspection without persisted status rows", async () => {
  const f = await fixture();
  try {
    assert.equal(f.db.list("kernel-status", { all: true }).length, 0);
    const entries = (await f.tools.call("list_kernels", {})) as Array<{ kernel: string }>;
    assert.deepEqual(
      entries.map((entry) => entry.kernel),
      ["codex"],
    );
    f.inspection.statuses[0]!.installed = false;
    assert.deepEqual(await f.tools.call("list_kernels", {}), []);
    assert.equal(f.db.list("kernel-status", { all: true }).length, 0);
  } finally {
    await f.close();
  }
});

for (const stage of ["beforeInspect", "beforeOptions"] as const) {
  test(`caller cancellation while ${stage} is pending fences discovery`, async () => {
    const f = await fixture();
    const gate = deferred();
    let started = false;
    f.inspection[stage] = async () => {
      started = true;
      await gate.promise;
    };
    const pending = f.tools.call("list_kernels", {});
    const rejection = assert.rejects(pending);
    try {
      await until(() => started);
      await f.service.command({ commandId: "cancel-parent", type: "cancel", runId: f.parent.id });
      gate.release();
      await rejection;
      assert.equal(f.paths.length, 0);
    } finally {
      gate.release();
      await rejection;
      await f.close();
    }
  });
  test(`configuration change while ${stage} is pending blocks dispatch before workspace IO`, async () => {
    const f = await fixture();
    const gate = deferred();
    let started = false;
    f.inspection[stage] = async () => {
      started = true;
      await gate.promise;
    };
    const pending = f.tools.call("dispatch_task", {
      commandId: "stale-config",
      kernel: "codex",
      task: "report",
      context: "fixture",
    });
    const rejection = assert.rejects(pending, /配置.*变更/);
    try {
      await until(() => started);
      await f.service.command({
        commandId: "narrow-config",
        type: "configure",
        kernel: "codex",
        config: { executablePath: "", permission: "read-only", model: "child-model" },
      });
      gate.release();
      await rejection;
      assert.equal(f.paths.length, 0);
      assert.equal(f.db.list("agent-task", { all: true }).length, 0);
    } finally {
      gate.release();
      await rejection;
      await f.close();
    }
  });
}

test("configuration narrowing while human approval is pending cannot launch a stale child", async () => {
  const f = await fixture(undefined, { permission: "ask" });
  try {
    const pending = f.tools.call("dispatch_task", {
      commandId: "human-config",
      kernel: "codex",
      task: "report",
      context: "fixture",
    });
    const rejection = assert.rejects(pending, /配置.*变更/);
    await until(() => f.db.list("interaction").length > 0);
    await f.service.command({
      commandId: "narrow-config",
      type: "configure",
      kernel: "codex",
      config: { executablePath: "", permission: "read-only", model: "child-model" },
    });
    const question = f.db.list<{ id: string }>("interaction")[0]!;
    await f.service.command({
      commandId: "human-answer",
      type: "answer",
      interactionId: question.id,
      answer: { decision: "allow-once" },
    });
    await rejection;
    assert.equal(f.paths.length, 0);
    assert.equal(f.db.list("agent-task", { all: true }).length, 0);
  } finally {
    await f.close();
  }
});

test("configuration narrowing while workspace preparation is pending cannot admit a stale child", async () => {
  const gate = deferred();
  let started = false;
  const f = await fixture(undefined, {
    beforePrepare: async () => {
      started = true;
      await gate.promise;
    },
  });
  const pending = f.tools.call("dispatch_task", {
    commandId: "workspace-config",
    kernel: "codex",
    task: "report",
    context: "fixture",
  });
  const rejection = assert.rejects(pending, /配置.*变更/);
  try {
    await until(() => started);
    await f.service.command({
      commandId: "narrow-config",
      type: "configure",
      kernel: "codex",
      config: { executablePath: "", permission: "read-only", model: "child-model" },
    });
    gate.release();
    await rejection;
    assert.equal(f.db.list("agent-task", { all: true }).length, 0);
    assert.equal(f.children.length, 0);
  } finally {
    gate.release();
    await rejection;
    await f.close();
  }
});
