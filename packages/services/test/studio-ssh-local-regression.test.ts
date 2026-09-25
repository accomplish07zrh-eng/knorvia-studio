import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { Event } from "@knorvia/rpc";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import {
  createRemoteKernelAdapter,
  type RemoteStudioEnvironment,
} from "../src/studio-runtime/adapters/kernels/remoteKernelBridge.js";
import { remoteStudioKernelId } from "../src/studio-runtime/adapters/kernels/remoteAgentIdentity.js";
import { inspectRemoteStudioKernels } from "../src/studio-runtime/adapters/kernels/remoteKernelCatalog.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { executeStudioGroup } from "../src/studio-runtime/app/groupExecutor.js";
import type { StudioKernelRegistry } from "../src/studio-runtime/app/ports.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioGroupDefinition } from "../src/studio-runtime/workflowTypes.js";
import { harness, success } from "./studio-orchestration-support.js";

function remoteFixture(
  identity: string,
  path: string,
  options: { loseSendAck?: boolean; waitForCancel?: boolean } = {},
) {
  const commands: Array<Record<string, unknown>> = [];
  let runId = "";
  let cancelled = false;
  const service = {
    async inspectKernels() {
      return [
        { id: "codex", displayName: "Codex", installed: true, origin: "external" },
        { id: "qoder-cn", installed: false, origin: "missing" },
        { id: "unknown-agent", installed: true, origin: "external" },
      ];
    },
    async command(command: Record<string, unknown>) {
      commands.push(command);
      if (command.type === "send") {
        runId = `remote-run-${commands.length}`;
        if (options.loseSendAck) throw new Error("fixture transport closed after dispatch");
        return { id: runId, revision: commands.length };
      }
      if (command.type === "cancel") cancelled = true;
      return { id: String(command.id ?? runId), revision: commands.length };
    },
    async timeline() {
      const state = cancelled ? "cancelled" : options.waitForCancel ? "running" : "succeeded";
      return {
        revision: commands.length,
        messages:
          state === "succeeded"
            ? [
                {
                  id: "reply",
                  runId,
                  sender: "codex",
                  kind: "text",
                  text: identity,
                  createdAt: 1,
                  updatedAt: 1,
                },
              ]
            : [],
        interactions: [],
        runs: [{ id: runId, state, resultKnown: true }],
      };
    },
    async prepareAgentWorkspace({ stepId }: { stepId: string }) {
      return `${path}/.isolated/${stepId.replaceAll(":", "-")}`;
    },
    async agentWorkspaceChanges() {
      return [];
    },
  } as unknown as RemoteStudioEnvironment["service"];
  return {
    environment: { workspaceIdentity: identity, workspacePath: path, label: identity, service },
    commands,
  };
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Local SSH fixture timed out");
    await sleep(10);
  }
}

test("protocol discovery only publishes installed, valid remote CLI identities", async () => {
  const first = remoteFixture("fixture-a", "/srv/shared");
  const second = remoteFixture("fixture-b", "/srv/shared");
  const statuses = await inspectRemoteStudioKernels([first.environment, second.environment]);
  assert.deepEqual(
    statuses.map((item) => item.id),
    [remoteStudioKernelId("fixture-a", "codex"), remoteStudioKernelId("fixture-b", "codex")],
  );
  assert.ok(statuses.every((item) => item.remoteWorkspacePath === "/srv/shared"));
  assert.ok(statuses.every((item) => item.executablePath === undefined));
});

test("remote single chat stays bound to its project and uncertain send needs explicit retry after reconnect", async () => {
  const root = mkdtempSync(join(tmpdir(), "knorvia-ssh-local-"));
  const db = new StudioDatabase(join(root, "runtime.sqlite"));
  const identity = "fixture-a:project";
  const remoteId = remoteStudioKernelId(identity, "codex");
  const lost = remoteFixture(identity, "/srv/project", { loseSendAck: true });
  const recovered = remoteFixture(identity, "/srv/project");
  let environments: RemoteStudioEnvironment[] = [lost.environment];
  const kernels = {
    remoteWorkspace: (kernel: string) =>
      kernel === remoteId ? environments[0]?.service : undefined,
    adapter: (kernel: string) =>
      createRemoteKernelAdapter(kernel as typeof remoteId, () => environments),
    inspect: async () => inspectRemoteStudioKernels(environments),
    manage: async () => {
      throw new Error("unused");
    },
    dispose: async () => {},
  } as StudioKernelRegistry;
  const service = new StudioRuntimeService({
    db,
    clock: {
      now: Date.now,
      id: randomUUID,
      delay: (ms, signal) => sleep(ms, undefined, { signal }),
    },
    kernels,
    workspaces: {
      prepare: async () => {
        throw new Error("remote path entered local workspace manager");
      },
      changes: async () => {
        throw new Error("remote path entered local change scanner");
      },
      apply: async () => {
        throw new Error("remote path entered local apply");
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
    await service.command({
      commandId: randomUUID(),
      type: "create-conversation",
      id: "remote-chat",
      kernel: remoteId,
      workspacePath: root,
    });
    const sent = await service.command({
      commandId: randomUUID(),
      type: "send",
      kind: "chat",
      targetId: "remote-chat",
      text: "fixture request",
    });
    await until(() => {
      service.tick();
      return db.read<StoredRun>("run", sent.id)?.state === "interrupted";
    });
    assert.equal(db.read<StoredRun>("run", sent.id)?.resultKnown, false);
    assert.equal(
      lost.commands.find((item) => item.type === "create-conversation")?.workspacePath,
      "/srv/project",
    );
    assert.equal(lost.commands.filter((item) => item.type === "send").length, 1);
    await assert.rejects(
      service.command({
        commandId: randomUUID(),
        type: "send",
        kind: "chat",
        targetId: "remote-chat",
        text: "follow-up",
      }),
      /不确定/,
    );
    await assert.rejects(
      service.command({
        commandId: randomUUID(),
        type: "resume",
        runId: sent.id,
        retryUncertain: false,
      }),
      /不确定/,
    );
    service.tick();
    assert.equal(lost.commands.filter((item) => item.type === "send").length, 1);

    environments = [];
    const offline = (await service.inspectKernels()).find((status) => status.id === remoteId);
    assert.equal(offline?.installed, false);
    assert.match(offline?.error ?? "", /SSH/);
    environments = [recovered.environment];
    assert.equal(
      (await service.inspectKernels()).find((status) => status.id === remoteId)?.installed,
      true,
    );
    await service.command({
      commandId: randomUUID(),
      type: "resume",
      runId: sent.id,
      retryUncertain: true,
    });
    await until(() => {
      service.tick();
      return db.read<StoredRun>("run", sent.id)?.state === "succeeded";
    });
    assert.equal(db.read<StoredRun>("run", sent.id)?.attempt, 2);
    assert.notEqual(
      lost.commands.find((item) => item.type === "send")?.commandId,
      recovered.commands.find((item) => item.type === "send")?.commandId,
    );
    assert.equal(
      recovered.commands.find((item) => item.type === "create-conversation")?.workspacePath,
      "/srv/project",
    );
  } finally {
    await service.disposeAllAndWait();
    rmSync(root, { recursive: true, force: true });
  }
});

test("remote stop forwards cancel and waits for a known terminal response", async () => {
  const fixture = remoteFixture("fixture-stop", "/srv/stop", { waitForCancel: true });
  const remoteId = remoteStudioKernelId("fixture-stop", "codex");
  const controller = new AbortController();
  const resultPromise = createRemoteKernelAdapter(remoteId, () => [fixture.environment]).run(
    {
      runId: "stop",
      turnId: "turn",
      dispatchId: "stop:turn:1",
      conversationId: "chat",
      kernel: remoteId,
      workspacePath: "C:\\local",
      permission: "ask",
      text: "stop fixture",
    },
    { emit: async () => {}, ask: async () => ({ decision: "deny" }) },
    controller.signal,
  );
  await until(() => fixture.commands.some((item) => item.type === "send"));
  controller.abort();
  const result = await resultPromise;
  assert.equal(result.status, "cancelled");
  assert.equal(result.resultKnown, true);
  assert.equal(fixture.commands.filter((item) => item.type === "cancel").length, 1);
});

test("task group dispatches local and two same-CLI remote members to distinct project owners", async () => {
  const first = remoteFixture("fixture-a:group", "/srv/a");
  const second = remoteFixture("fixture-b:group", "/srv/b");
  const firstId = remoteStudioKernelId(first.environment.workspaceIdentity, "codex");
  const secondId = remoteStudioKernelId(second.environment.workspaceIdentity, "codex");
  const members = ["codex", firstId, secondId] as const;
  const definition: StudioGroupDefinition = {
    id: "fixture-group",
    name: "Fixture",
    goal: "Review projects",
    members: [...members],
    host: "codex",
    sharedSummary: "Text context only",
    mode: "task",
    workspaceMode: "isolated",
    createdAt: 1,
    updatedAt: 1,
  };
  const plan = JSON.stringify({
    tasks: members.map((member, index) => ({
      id: `task-${index}`,
      member,
      instruction: `Inspect project ${index}`,
      dependsOn: [],
    })),
  });
  const h = harness(async (step) => {
    if (step.id.includes("group:plan")) return success(plan);
    if (step.id.includes("group:review"))
      return success('{"status":"complete","summary":"All fixture projects reviewed"}');
    if (step.kernel === "codex") return success("local fixture result");
    const fixture = step.kernel === firstId ? first : second;
    const result = await createRemoteKernelAdapter(step.kernel, () => [fixture.environment]).run(
      {
        runId: "group",
        turnId: step.id,
        dispatchId: step.id,
        conversationId: `group:${step.kernel}`,
        kernel: step.kernel,
        workspacePath: "C:\\local-project",
        workspaceRunId: "group",
        workspaceStepId: step.id,
        workspaceMode: "isolated",
        permission: "ask",
        text: step.prompt,
      },
      { emit: async () => {}, ask: async () => ({ decision: "deny" }) },
      step.signal ?? h.port.signal,
    );
    return result;
  });
  const outcome = await executeStudioGroup(definition, "Review all projects", true, "", h.port);
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.text, "All fixture projects reviewed");
  assert.equal(h.calls.filter((item) => item.id.includes("group:round:0:task:")).length, 3);
  for (const [fixture, path] of [
    [first, "/srv/a"],
    [second, "/srv/b"],
  ] as const) {
    const created = fixture.commands.find((item) => item.type === "create-conversation");
    assert.match(String(created?.workspacePath), new RegExp(`^${path}/\\.isolated/`));
    assert.equal(fixture.commands.filter((item) => item.type === "send").length, 1);
  }
});
