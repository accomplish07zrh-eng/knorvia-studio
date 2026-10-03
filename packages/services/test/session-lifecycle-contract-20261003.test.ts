import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaAgentMcpServer, KnorviaSessionStateSnapshot } from "@knorvia/shared";
import type { KnorviaTaskTarget } from "../src/agent-session/session.js";

// Phase instruction: authored contract cases only; no execution claimed.
test("session lifecycle keeps draft authority, temporary MCP configuration and replay boundaries", async (t) => {
  const effects: string[] = [];
  const publications: Array<{ snapshot: KnorviaSessionStateSnapshot; options: unknown }> = [];
  const watches: Array<{ target: KnorviaTaskTarget; options: unknown }> = [];
  const modelWrites: unknown[] = [];
  const closeInputs: unknown[] = [];
  const target: KnorviaTaskTarget = {
    workspacePath: "synthetic/workspace",
    workspaceIdentity: " synthetic-identity ",
    sessionId: "synthetic-session",
    remoteSessionId: "synthetic-remote",
  };
  function snapshot(current = "low", enabled = true, available: unknown[] = ["low", "high"]) {
    return {
      session: {
        sessionId: target.sessionId,
        workspace: {
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
        },
        status: "idle",
      },
      settings: { thoughtLevel: { enabled, current, available } },
      runtime: { eventSeq: 1, stateRevision: 2, pendingRequestIds: [] },
      messages: [],
    } as unknown as KnorviaSessionStateSnapshot;
  }
  let nextSnapshot = snapshot();
  let publicationError: unknown;
  let modelError: unknown;
  let closeResult = false;
  let closeError: unknown;
  let lastInvocation: Record<string, unknown> | undefined;
  const thoughtInputs: unknown[] = [];
  t.mock.module("@knorvia/shared", {
    namedExports: { createSessionTraceId: () => "synthetic-trace" },
  });
  t.mock.module("../src/logger/serviceLogger.js", {
    namedExports: {
      createServiceLogger: () => ({ debug() {}, info() {}, warn() {} }),
    },
  });
  t.mock.module("../src/agent/configOptions.js", {
    namedExports: { formatModelPickerValue: () => "synthetic-model" },
  });
  t.mock.module("../src/agent-session/sessionApiRetry.js", {
    namedExports: {
      createKnorviaSessionApiRetryRuntimeTracker: () => ({
        withApiRetryRuntime(value: KnorviaSessionStateSnapshot) {
          effects.push("retry");
          return value;
        },
      }),
    },
  });
  t.mock.module("../src/agent-session/importedClaudeSessionRepair.js", {
    namedExports: {
      async repairEmptyImportedClaudeSessionSnapshot(input: {
        snapshot: KnorviaSessionStateSnapshot;
      }) {
        effects.push("repair");
        return input.snapshot;
      },
    },
  });
  t.mock.module("../src/session/mcpWorkspaceScope.js", {
    namedExports: {
      appendWorkspaceToFilesystemMcpServers(servers: KnorviaAgentMcpServer[] | undefined) {
        effects.push("scope");
        return servers;
      },
    },
  });
  const { createKnorviaSessionService: create } =
    await import("../src/agent-session/sessionService.js");
  type Options = Parameters<typeof create>[0];
  const agent = {
    async createSession(input: Record<string, unknown>) {
      lastInvocation = input;
      effects.push("create");
      return nextSnapshot;
    },
    async resumeSession(input: Record<string, unknown>) {
      lastInvocation = input;
      effects.push("resume");
      return nextSnapshot;
    },
    async setModel() {
      effects.push("setModel");
      return nextSnapshot;
    },
    async setThoughtLevel(input: unknown) {
      thoughtInputs.push(input);
      effects.push("setThoughtLevel");
      return nextSnapshot;
    },
    async closeSession(input: unknown) {
      closeInputs.push(input);
      if (closeError) throw closeError;
      return closeResult;
    },
  } as unknown as Options["agentService"];
  const index = {
    ensureSessionSubscription(input: KnorviaTaskTarget, options: unknown) {
      effects.push("watch");
      watches.push({ target: input, options });
    },
    async syncSnapshotAndBroadcast(snapshot: KnorviaSessionStateSnapshot, options: unknown) {
      effects.push("publish");
      publications.push({ snapshot, options });
      if (publicationError) throw publicationError;
    },
    async syncTaskModel(input: unknown, model: string) {
      modelWrites.push({ input, model });
      if (modelError) throw modelError;
      return null;
    },
  } as unknown as Options["taskIndexSyncer"];
  const service = create({ agentService: agent, taskIndexSyncer: index });

  await t.test(
    "drafts stay out of the task index and are isolated by workspace identity",
    async () => {
      const created = await service.createSession({ ...target, persistence: "deferred" });
      assert.equal(created, nextSnapshot);
      assert.deepEqual(effects, ["scope", "create"]);
      effects.length = 0;
      await service.setModel({ ...target, model: { providerId: "fixture", modelId: "fixture" } });
      assert.deepEqual(effects, ["setModel", "retry"]);
      assert.equal(publications.length, 0);
      effects.length = 0;
      await service.promoteDeferredDraftSession({ ...target, workspaceIdentity: "other-identity" });
      assert.equal(watches.length, 0);
      await service.promoteDeferredDraftSession(target);
      assert.equal(watches.length, 1);
      await service.promoteDeferredDraftSession(target);
      assert.equal(watches.length, 1);
    },
  );

  await t.test(
    "persistent model publication retains its reason and survives index failure",
    async () => {
      effects.length = 0;
      publicationError = new Error("synthetic index failure");
      assert.equal(
        await service.setModel({ ...target, model: { providerId: "fixture", modelId: "fixture" } }),
        nextSnapshot,
      );
      assert.deepEqual(effects, ["watch", "setModel", "retry", "publish"]);
      assert.deepEqual(publications.at(-1)?.options, {
        modelOverride: "synthetic-model",
        broadcastReason: "task_model_changed",
      });
      publicationError = undefined;
    },
  );

  await t.test("unsupported historical thought level is not replayed or persisted", async () => {
    nextSnapshot = snapshot("low", true, [" low ", { value: "medium" }, { value: 4 }]);
    await service.resumeSession({ ...target, thoughtLevel: " high " });
    assert.equal(thoughtInputs.length, 0);
    assert.deepEqual(publications.at(-1)?.options, { broadcastReason: "task_status_changed" });
    nextSnapshot = snapshot("low", false);
    await service.resumeSession({ ...target, thoughtLevel: "high" });
    assert.equal(thoughtInputs.length, 0);
  });

  await t.test(
    "replayable pre-send resume suppresses snapshots and propagates model-write errors",
    async () => {
      nextSnapshot = snapshot("low", true, []);
      const previous = publications.length;
      await service.resumeSession({
        ...target,
        thoughtLevel: " high ",
        model: { providerId: "fixture", modelId: "fixture" },
        broadcastSnapshot: false,
      });
      assert.deepEqual(thoughtInputs.at(-1), {
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: target.sessionId,
        thoughtLevel: "high",
      });
      assert.equal(publications.length, previous);
      assert.deepEqual(watches.at(-1)?.options, { includeSnapshot: false });
      assert.equal(lastInvocation?.broadcastSnapshot, undefined);
      assert.equal(modelWrites.length, 1);
      modelError = new Error("synthetic model-write failure");
      await assert.rejects(
        service.resumeSession({
          ...target,
          model: { providerId: "fixture", modelId: "fixture" },
          broadcastSnapshot: false,
        }),
        (error) => error === modelError,
      );
      modelError = undefined;
    },
  );

  await t.test(
    "conditional-close rejection keeps a draft and never falls back to unconditional close",
    async () => {
      await service.createSession({ ...target, persistence: "deferred" });
      closeError = new Error("synthetic unsupported conditional close");
      assert.equal(await service.closeDeferredDraftSession(target), false);
      assert.equal(closeInputs.length, 1);
      assert.deepEqual(closeInputs[0], { ...target, expectedPersistence: "deferred" });
      const before = watches.length;
      await service.promoteDeferredDraftSession(target);
      assert.equal(watches.length, before + 1);
      closeError = undefined;
      closeResult = true;
      assert.equal(await service.closeSession(target), undefined);
    },
  );

  await t.test(
    "local MCP composition is invocation-only and remote targets skip the creation port",
    async () => {
      const prior = { name: "creation", command: "synthetic-old" } as KnorviaAgentMcpServer;
      const other = {
        name: "filesystem",
        command: "synthetic-filesystem",
      } as KnorviaAgentMcpServer;
      const replacement = { name: "creation", command: "synthetic-new" } as KnorviaAgentMcpServer;
      const supplied = [prior, other];
      let creationReads = 0;
      const localService = create({
        agentService: agent,
        async creationMcpServer() {
          creationReads++;
          return replacement;
        },
        cuaProductMcpServerResolver: {
          async resolveMcpServers(servers: KnorviaAgentMcpServer[] | undefined) {
            return servers;
          },
        } as unknown as Options["cuaProductMcpServerResolver"],
      });
      await localService.createSession({
        workspacePath: target.workspacePath,
        mcpServers: supplied,
      });
      assert.deepEqual(lastInvocation?.mcpServers, [other, replacement]);
      assert.deepEqual(supplied, [prior, other]);
      assert.equal(lastInvocation?.sessionTraceId, "synthetic-trace");
      await localService.createSession({ ...target, mcpServers: supplied });
      assert.equal(creationReads, 1);
      assert.equal(lastInvocation?.mcpServers, supplied);
    },
  );
});
