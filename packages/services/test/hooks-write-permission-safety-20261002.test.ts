import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { Hook } from "@knorvia/shared";

test("synthetic hook saves preserve declaration flags and fail closed on corrupt trust", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-hook-safety-"));
  const keys = [
    "HOME",
    "USERPROFILE",
    "KNORVIA_DATA_BASE_DIR",
    "KNORVIA_HOME",
    "KNORVIA_PORTABLE_DIR",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys)
    process.env[key] = key === "KNORVIA_HOME" || key === "KNORVIA_PORTABLE_DIR" ? "" : root;
  const put = async (path: string, data: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  };
  try {
    const { createHooksService } = await import("../src/hooks/hooksService.js");
    const workspace = join(root, "workspace");
    await mkdir(join(workspace, ".git"), { recursive: true });
    const user = join(root, ".knorvia-studio", "cli", "config.json");
    const project = join(workspace, ".knorvia-studio", "config.json");
    await put(
      user,
      JSON.stringify({ untouched: "synthetic-user", hooks: { enabled: false, events: {} } }),
    );
    await put(
      project,
      JSON.stringify({ untouched: "synthetic-project", hooks: { enabled: false, events: {} } }),
    );
    const grant = async () => {
      throw new Error("Synthetic authority must never be called");
    };
    const service = createHooksService({ grantWorkspaceHookTrust: grant });
    assert.equal(service.grantWorkspaceHookTrust, grant);
    const base: Hook = {
      id: "synthetic",
      event: "SessionStart",
      type: "command",
      command: "never-execute-synthetic",
      enabled: false,
      editable: true,
      custom: { syntheticExtra: "retained" },
      configuredState: {
        sourceRootEnabled: false,
        declarationEnabled: true,
        runtimeHooksEnabled: false,
        configuredEnabled: false,
        sourcePath: user,
      },
      location: { source: "knorvia", scope: "user", directoryPath: dirname(user) },
    };
    const projectHook: Hook = {
      ...base,
      id: "project",
      enabled: true,
      configuredState: { ...base.configuredState!, sourcePath: project },
      location: {
        source: "knorvia",
        scope: "project",
        directoryPath: dirname(project),
        projectPath: workspace,
      },
    };
    await service.saveHooks({
      workspacePath: workspace,
      hooks: [
        base,
        projectHook,
        { ...base, id: "legacy", editable: false },
        {
          ...projectHook,
          id: "ancestor",
          command: "excluded",
          configuredState: {
            ...projectHook.configuredState!,
            sourcePath: join(root, "ancestor", "config.json"),
          },
        },
      ],
    });
    const userSaved = JSON.parse(await readFile(user, "utf8"));
    const projectSaved = JSON.parse(await readFile(project, "utf8"));
    assert.equal(userSaved.untouched, "synthetic-user");
    assert.equal(userSaved.hooks.enabled, false);
    assert.equal(userSaved.hooks.events.SessionStart[0].hooks.length, 1);
    assert.equal(userSaved.hooks.events.SessionStart[0].hooks[0].enabled, true);
    assert.equal(userSaved.hooks.events.SessionStart[0].hooks[0].syntheticExtra, "retained");
    assert.equal(projectSaved.untouched, "synthetic-project");
    assert.equal(projectSaved.hooks.enabled, true);
    assert.equal(projectSaved.hooks.events.SessionStart[0].hooks.length, 1);
    await put(
      join(root, ".knorvia-studio", "security", "workspace-hook-trust-v1.json"),
      "{synthetic-invalid",
    );
    const loaded = await service.loadHooks({
      workspacePath: workspace,
      workspaceIdentity: "synthetic-identity",
    });
    assert.equal(loaded.trustStoreCorrupt, true);
    for (const hook of loaded.hooks) {
      if (hook.workspaceHook) assert.equal(hook.workspaceHook.trustState, "pending_trust");
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
