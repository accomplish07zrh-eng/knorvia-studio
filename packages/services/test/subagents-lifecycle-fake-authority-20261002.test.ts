import assert from "node:assert/strict";
import { join } from "node:path";
import { mock, test } from "node:test";

test("synthetic subagents owner preserves queued authority and profile failure order", async () => {
  const trace: unknown[][] = [];
  const denied = Object.assign(new Error("synthetic state permission denied"), { code: "EACCES" });
  const missing = Object.assign(new Error("synthetic absent"), { code: "ENOENT" });
  const statePath = "/synthetic-state/v2/agents-state.json";
  let state: Record<string, unknown> = {
    builtInModelSelectionOverrides: {},
    pluginAgentModelSelectionOverrides: {},
    disabledAgentIds: ["old-id"],
    opaque: { preserve: true },
    builtInModelOverrides: { legacy: true },
  };
  let denyState = false,
    denyFile = false,
    denyRemove = false,
    parseInvalid = false,
    collision = false;
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let blockState = false;
  const selection = { providerId: "synthetic-provider", modelId: "synthetic-model" };
  mock.module("node:fs/promises", {
    namedExports: {
      access: async (path: string) => {
        trace.push(["access", path]);
        if (collision && path.endsWith(".md")) return;
        throw missing;
      },
      lstat: async () => assert.fail("no real catalog expected"),
      readdir: async () => assert.fail("no real catalog expected"),
      readFile: async (path: string) => {
        trace.push(["read", path]);
        if (path === statePath) return JSON.stringify(state);
        throw missing;
      },
      mkdir: async (...args: unknown[]) => {
        trace.push(["mkdir", ...args]);
      },
      writeFile: async (...args: unknown[]) => {
        trace.push(["write", ...args]);
        if (denyFile) throw denied;
      },
      rm: async (...args: unknown[]) => {
        trace.push(["rm", ...args]);
        if (denyRemove) throw denied;
      },
    },
  });
  mock.module(new URL("../src/fs/atomicFileUtils.ts", import.meta.url).href, {
    namedExports: {
      atomicWriteText: async (path: string, content: string) => {
        trace.push(["atomic", path, content]);
        if (blockState) {
          blockState = false;
          entered?.();
          await new Promise<void>((r) => {
            release = r;
          });
        }
        if (denyState) throw denied;
        state = JSON.parse(content);
      },
    },
  });
  mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
    namedExports: {
      createServiceLogger: () => ({ warn: (...args: unknown[]) => trace.push(["warn", ...args]) }),
    },
  });
  mock.module("@knorvia/shared", {
    namedExports: {
      DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: new Set(),
      KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID: "synthetic-marketplace",
      createAgentStateId: (value: { name: string }) => `builtin:${value.name}`,
      createPluginAgentStateId: (plugin: string, name: string) => `plugin:${plugin}:${name}`,
      modelSelectionSchema: { safeParse: (value: unknown) => ({ data: value }) },
      parsePluginSubagentModelSelectionOverrides: (value: unknown) => value ?? {},
    },
  });
  mock.module("@knorvia/shared/node", {
    namedExports: {
      migrateSubagentStateFile: async (path: string) => {
        trace.push(["migrate-state", path]);
      },
      migrateUserSubagentMarkdown: async (path: string) => {
        trace.push(["migrate-markdown", path]);
        return { failures: [] };
      },
      scanOfficialPluginCacheRoots: async (path: string) => {
        trace.push(["scan-cache", path]);
        return [];
      },
    },
  });
  mock.module(new URL("../src/subagents/subagentStorage.ts", import.meta.url).href, {
    namedExports: {
      resolveSubagentStateFile: async () => statePath,
      resolveUserDataRoot: () => "/synthetic-data",
      resolveUserSubagentRoot: async () => "/synthetic-agents",
      resolveWorkspaceSubagentRoot: (path: string) => {
        trace.push(["workspace-root", path]);
        return join(path, ".knorvia-studio", "agents");
      },
      resolveKnorviaStorageRoot: async () => "/synthetic-storage",
    },
  });
  mock.module(new URL("../src/subagents/subagentModelSelection.ts", import.meta.url).href, {
    namedExports: { normalizeSubagentModelSelection: (value: unknown) => value },
  });
  mock.module(new URL("../src/subagents/subagentMarkdown.ts", import.meta.url).href, {
    namedExports: {
      serializeSubagentMarkdown: (config: unknown) => {
        trace.push(["serialize", config]);
        return "synthetic markdown";
      },
      parseSubagentMarkdown: (input: { path: string; scope: string }) => {
        trace.push(["parse", input]);
        return parseInvalid
          ? { diagnostic: { message: "synthetic parse rejected" } }
          : {
              agent: {
                id: "new-id",
                name: "synthetic-agent",
                description: "synthetic",
                systemPrompt: "synthetic",
                path: input.path,
                scope: input.scope,
                source: "user",
                enabled: true,
                readOnly: false,
              },
            };
      },
    },
  });
  const { createSubagentsService } = await import("../src/subagents/subagentsService.js");
  const service = createSubagentsService({ homeDir: "/synthetic-home", isDesktopRuntime: false });
  await assert.rejects(
    service.setPluginAgentModelOverride({ agentId: " plugin:bad", modelSelection: selection }),
    /无效插件/,
  );
  assert.equal(trace.length, 0);
  blockState = true;
  const admission = new Promise<void>((r) => {
    entered = r;
  });
  const first = service.setEnabled({ agentId: "first-id", enabled: false });
  const firstRejected = assert.rejects(first, (e) => e === denied);
  await admission;
  const queuedParams = { agentId: "queued-id", enabled: false };
  const second = service.setEnabled(queuedParams);
  queuedParams.agentId = "live-queued-id";
  assert.equal(trace.filter((v) => v[0] === "migrate-state").length, 1);
  denyState = true;
  release?.();
  await firstRejected;
  denyState = false;
  await second;
  assert.deepEqual(state.disabledAgentIds, ["live-queued-id", "old-id"]);
  assert.deepEqual(state.opaque, { preserve: true });
  assert.deepEqual(state.builtInModelOverrides, { legacy: true });
  assert.ok(trace.filter((v) => v[0] === "atomic").every((v) => !String(v[2]).endsWith("\n")));
  await service.setBuiltInModelOverride({ agentName: "Explore", modelSelection: selection });
  assert.deepEqual(state.builtInModelSelectionOverrides, { Explore: selection });
  await service.setPluginAgentModelOverride({
    agentId: "plugin:synthetic:owned",
    modelSelection: selection,
  });
  assert.deepEqual(state.pluginAgentModelSelectionOverrides, {
    "plugin:synthetic:owned": selection,
  });
  await service.setBuiltInModelOverride({ agentName: "Explore" });
  assert.deepEqual(state.builtInModelSelectionOverrides, {});
  await service.setPluginAgentModelOverride({ agentId: "plugin:synthetic:owned" });
  assert.deepEqual(state.pluginAgentModelSelectionOverrides, {});
  trace.length = 0;
  const config = {
    name: " synthetic-agent ",
    description: " synthetic ",
    systemPrompt: " synthetic prompt ",
  };
  parseInvalid = true;
  await assert.rejects(
    service.createAgent({ provider: "knorvia", config }),
    /synthetic parse rejected/,
  );
  assert.ok(!trace.some((v) => v[0] === "write" || v[0] === "atomic"));
  parseInvalid = false;
  trace.length = 0;
  collision = true;
  await assert.rejects(service.createAgent({ provider: "knorvia", config }), /already exists/);
  assert.ok(!trace.some((v) => v[0] === "serialize" || v[0] === "write"));
  collision = false;
  trace.length = 0;
  await service.createAgent({
    provider: "knorvia",
    config,
    scope: "workspace",
    workspacePath: " /synthetic-workspace ",
  });
  assert.deepEqual(
    trace.find((v) => v[0] === "workspace-root"),
    ["workspace-root", "/synthetic-workspace"],
  );
  assert.deepEqual(trace.find((v) => v[0] === "write")?.[3], { encoding: "utf-8", flag: "wx" });
  assert.ok(trace.findIndex((v) => v[0] === "parse") < trace.findIndex((v) => v[0] === "write"));
  trace.length = 0;
  denyFile = true;
  await assert.rejects(
    service.updateAgent({
      provider: "knorvia",
      agentId: "old-id",
      oldFilePath: "/synthetic-agents/old.md",
      config,
    }),
    (e) => e === denied,
  );
  assert.ok(!trace.some((v) => v[0] === "migrate-state" || v[0] === "rm"));
  denyFile = false;
  denyState = true;
  trace.length = 0;
  await assert.rejects(
    service.updateAgent({
      provider: "knorvia",
      agentId: "old-id",
      oldFilePath: "/synthetic-agents/old.md",
      config,
    }),
    (e) => e === denied,
  );
  assert.ok(trace.some((v) => v[0] === "write"));
  assert.ok(!trace.some((v) => v[0] === "rm"));
  denyState = false;
  trace.length = 0;
  const updated = await service.updateAgent({
    provider: "knorvia",
    agentId: "old-id",
    oldFilePath: "/synthetic-agents/old.md",
    config,
  });
  assert.equal(updated.agent.id, "new-id");
  assert.deepEqual(state.disabledAgentIds, ["live-queued-id", "new-id"]);
  assert.ok(trace.findIndex((v) => v[0] === "atomic") < trace.findIndex((v) => v[0] === "rm"));
  trace.length = 0;
  denyRemove = true;
  await assert.rejects(
    service.deleteAgent({ agentId: "new-id", filePath: "/synthetic-agents/new.md" }),
    (e) => e === denied,
  );
  assert.deepEqual(trace, [["rm", "/synthetic-agents/new.md", { force: true }]]);
  denyRemove = false;
  trace.length = 0;
  await service.deleteAgent({ agentId: "new-id", filePath: "/synthetic-agents/new.md" });
  assert.equal(trace[0][0], "rm");
  assert.deepEqual(state.disabledAgentIds, ["live-queued-id"]);
  trace.length = 0;
  const listed = await service.list({
    workspacePath: "/synthetic-workspace",
    workspaceIdentity: "remote:synthetic",
    mode: "settingsUserOnly",
  });
  assert.deepEqual(listed.capability, {
    userScopeAvailable: false,
    userScopeReason: "desktop_only",
  });
  assert.deepEqual(
    listed.agents.map((a) => a.name),
    ["general-purpose", "Explore"],
  );
  assert.ok(!trace.some((v) => v[0] === "workspace-root" || v[0] === "migrate-markdown"));
  assert.ok(trace.some((v) => v[0] === "scan-cache"));
});
