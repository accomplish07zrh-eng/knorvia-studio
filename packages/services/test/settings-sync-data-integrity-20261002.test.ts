import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

test("ordered mixed sync imports preserve unrelated config and reject repeat overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-sync-integrity-"));
  const names = [
    "HOME",
    "USERPROFILE",
    "KNORVIA_DATA_BASE_DIR",
    "KNORVIA_HOME",
    "KNORVIA_PORTABLE_DIR",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  process.env.KNORVIA_DATA_BASE_DIR = root;
  process.env.KNORVIA_HOME = "";
  process.env.KNORVIA_PORTABLE_DIR = "";
  const put = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  try {
    const source = join(root, ".claude");
    const data = join(root, ".knorvia-studio");
    const skill = join(source, "skills", "sample", "SKILL.md");
    const command = join(source, "commands", "nested", "hello.md");
    const plugin = join(source, "plugins", "sample", ".claude-plugin", "plugin.json");
    const mcp = join(source, "settings.json");
    const fixtures = new Map([
      [skill, "---\nname: Synthetic Skill\nversion: 1\n---\nSynthetic content\n"],
      [command, "---\ndescription: Synthetic command\n---\nSynthetic command body\n"],
      [plugin, JSON.stringify({ name: "synthetic-plugin", version: "1.0" })],
      [
        mcp,
        JSON.stringify({
          mcpServers: {
            Existing: { command: "must-not-replace" },
            NewServer: {
              command: "synthetic-command",
              args: ["synthetic"],
              timeout: 12,
              startup_timeout_sec: 4,
            },
          },
        }),
      ],
    ]);
    for (const [path, content] of fixtures) await put(path, content);
    const config = join(data, "cli", "config.json");
    await put(
      config,
      JSON.stringify({
        unrelated: { keep: ["synthetic", 7] },
        plugins: { retained: true, dirs: [] },
        mcp: { retained: true, servers: { existing: { command: "preserved" } } },
      }),
    );
    const { createSettingsSyncService } =
      await import("../src/settings-sync/settingsSyncService.js");
    const { createSettingService } = await import("../src/setting/settingService.js");
    const { createObservableSettingService } =
      await import("../src/setting/observableSettingService.js");
    const settings = createObservableSettingService(createSettingService());
    const notifications: unknown[] = [];
    settings.onDidUpdate((event) => notifications.push(event.keys));
    const service = createSettingsSyncService({ settingService: settings });
    const request = {
      selections: ["skills", "commands", "plugins", "mcpServers"].map((category) => ({
        agent: "claudeCode" as const,
        category: category as "skills" | "commands" | "plugins" | "mcpServers",
        sourceScope: "global" as const,
        importMode: "copy" as const,
      })),
    };
    const result = await service.importSelected(request);
    assert.equal(result.successCount, 4);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.failedCount, 0);
    assert.deepEqual(
      result.taskResults.map((entry) => entry.category),
      ["skills", "commands", "plugins", "mcpServers"],
    );
    assert.deepEqual(
      result.taskResults[3]?.mcpServerResults?.map(({ name, status, skipReason }) => ({
        name,
        status,
        skipReason,
      })),
      [
        { name: "Existing", status: "skipped", skipReason: "sameNameExists" },
        { name: "NewServer", status: "imported", skipReason: undefined },
      ],
    );
    const raw = await readFile(config, "utf8");
    const saved = JSON.parse(raw);
    assert.deepEqual(saved, {
      unrelated: { keep: ["synthetic", 7] },
      plugins: { retained: true, dirs: [resolve(data, "plugins", "sample")] },
      mcp: {
        retained: true,
        servers: {
          existing: { command: "preserved" },
          NewServer: { command: "synthetic-command", args: ["synthetic"] },
        },
      },
    });
    assert.equal(raw, `${JSON.stringify(saved, null, 2)}\n`);
    assert.equal(
      await readFile(join(data, "skills", "sample", "SKILL.md"), "utf8"),
      fixtures.get(skill),
    );
    assert.equal(
      await readFile(join(data, "commands", "nested", "hello.md"), "utf8"),
      fixtures.get(command),
    );
    assert.equal(
      await readFile(join(data, "plugins", "sample", ".claude-plugin", "plugin.json"), "utf8"),
      fixtures.get(plugin),
    );
    const repeat = await service.importSelected(request);
    assert.equal(repeat.successCount, 0);
    assert.equal(repeat.skippedCount, 5);
    assert.equal(repeat.failedCount, 0);
    assert.equal(await readFile(config, "utf8"), raw);
    for (const [path, content] of fixtures) assert.equal(await readFile(path, "utf8"), content);
    await service.markFirstRunPromptHandled();
    assert.deepEqual(await service.getFirstRunPromptState(), { handled: true });
    assert.deepEqual(notifications, [["settingsSyncFirstRunPromptHandled"]]);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(root, { recursive: true, force: true });
  }
});
