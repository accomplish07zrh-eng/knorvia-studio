import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { mock, test } from "node:test";

const root = "/synthetic/knorvia-data";
const configPath = join(root, "cli", "config.json");
const files = new Map<string, string>([
  [configPath, JSON.stringify({ unrelated: { keep: "synthetic" }, plugins: { enabled: false } })],
]);
const dirs = new Set<string>();
const effects: string[] = [];
const denied = new Error("synthetic file permission denied");
const configFailure = new Error("synthetic config write denied");
let denyAccess: string | undefined;
let failConfig = false;
const missing = () => Object.assign(new Error("synthetic missing"), { code: "ENOENT" });
mock.module("node:fs/promises", {
  namedExports: {
    access: async (path: string) => {
      effects.push(`access:${path}`);
      if (path === denyAccess) throw denied;
      if (!files.has(path) && !dirs.has(path)) throw missing();
    },
    mkdir: async (path: string) => {
      effects.push(`mkdir:${path}`);
      dirs.add(path);
    },
    readFile: async (path: string) => {
      effects.push(`read:${path}`);
      const value = files.get(path);
      if (value === undefined) throw missing();
      return value;
    },
    writeFile: async (path: string, value: string) => {
      effects.push(`write:${path}`);
      if (path === configPath && failConfig) throw configFailure;
      if (!dirs.has(dirname(path))) throw missing();
      files.set(path, value);
    },
    rm: async (path: string) => {
      effects.push(`remove:${path}`);
      if (!files.delete(path)) throw missing();
    },
    lstat: async () => {
      throw new Error("unexpected scanner in write safety check");
    },
    readdir: async () => {
      throw new Error("unexpected scanner in write safety check");
    },
  },
});
mock.module("node:fs", {
  namedExports: { existsSync: (path: string) => files.has(path) || dirs.has(path) },
});
mock.module("node:os", { namedExports: { homedir: () => "/synthetic/home" } });
mock.module(new URL("../src/paths.ts", import.meta.url).href, {
  namedExports: { getKnorviaDataRootDir: () => root },
});
mock.module(new URL("../src/plugins/installedPluginRoots.ts", import.meta.url).href, {
  namedExports: { readInstalledPluginRoots: async () => [] },
});
mock.module("@knorvia/shared", {
  namedExports: {
    DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: new Set(),
    KNORVIA_COMMAND_AGENT_SOURCE: "agent",
    KNORVIA_COMMAND_AGENT_SOURCES: ["agent"],
  },
});
const { createCommandsService } = await import("../src/commands/commandsService.js");
test("fake command filesystem preserves config, rename disable override, collision ordering and failure identity", async () => {
  const service = createCommandsService();
  const first = join(root, "commands", "first.md");
  const { command } = await service.writeCommandFile({
    config: { name: "/first", prompt: "synthetic prompt", description: " synthetic description " },
  });
  assert.equal(command.filePath, first);
  assert.equal(command.id, "agent:knorvia:global:/first");
  assert.equal(command.location.directoryPath, join(root, "commands"));
  assert.equal(files.get(configPath)?.endsWith("\n"), true);
  await assert.rejects(
    service.writeCommandFile({ config: { name: "/first", prompt: "never overwrite" } }),
    /Command file already exists: first.md/,
  );
  assert.equal(files.get(first)?.includes("never overwrite"), false);
  await service.setCommandEnabled({ commandId: "ignored", filePath: first, enabled: false });
  files.set(
    first,
    "prelude\n---\nunknown: preserve\n  nested: preserve\ndescription: old\n  obsolete continuation\n---\nold body",
  );
  const next = join(root, "commands", "nested", "next.md");
  const renamed = await service.updateCommandFile({
    commandId: "ignored",
    oldFilePath: first,
    config: { name: "/nested/next", prompt: "new synthetic prompt", argumentHint: " hint " },
  });
  assert.equal(files.has(first), false);
  assert.equal(renamed.command.enabled, false);
  assert.equal(renamed.command.name, "/nested/next");
  assert.equal(
    files.get(next),
    "---\nunknown: preserve\n  nested: preserve\nargument-hint: hint\n---\n\nnew synthetic prompt",
  );
  const config = JSON.parse(files.get(configPath)!);
  assert.deepEqual(config.unrelated, { keep: "synthetic" });
  assert.deepEqual(config.command, { [next]: { enable: false } });
  const collision = join(root, "commands", "collision.md");
  files.set(collision, "existing");
  effects.length = 0;
  await assert.rejects(
    service.updateCommandFile({
      commandId: "ignored",
      oldFilePath: next,
      config: { name: "/collision", prompt: "never write" },
    }),
    /Command file already exists: collision.md/,
  );
  assert.ok(effects.indexOf(`remove:${next}`) < effects.indexOf(`access:${collision}`));
  assert.equal(files.get(collision), "existing");
  denyAccess = join(root, "commands", "denied.md");
  await assert.rejects(
    service.writeCommandFile({ config: { name: "/denied", prompt: "denied" } }),
    (error) => error === denied,
  );
  assert.equal(files.has(denyAccess), false);
  failConfig = true;
  const partial = join(root, "commands", "partial.md");
  await assert.rejects(
    service.writeCommandFile({ config: { name: "/partial", prompt: "synthetic partial write" } }),
    (error) => error === configFailure,
  );
  assert.equal(files.get(partial), "synthetic partial write");
  failConfig = false;
  await service.deleteCommandFile({ commandId: "ignored", filePath: next });
  assert.equal(JSON.parse(files.get(configPath)!).command, undefined);
});
