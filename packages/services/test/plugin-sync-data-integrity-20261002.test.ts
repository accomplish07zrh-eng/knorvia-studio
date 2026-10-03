import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("synthetic plugin and marketplace roundtrips retain config, overrides and no-overwrite behavior", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-plugin-sync-integrity-"));
  const envNames = ["HOME", "USERPROFILE", "KNORVIA_DATA_BASE_DIR", "KNORVIA_HOME"] as const;
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) process.env[name] = name === "KNORVIA_HOME" ? "" : root;
  const put = async (file: string, value: string) => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, value);
  };
  try {
    const { setDataBaseDir } = await import("../src/paths.js");
    const { createPluginSyncService } = await import("../src/plugin-sync/pluginSyncService.js");
    const sourceBase = join(root, "source");
    const destinationBase = join(root, "destination");
    const alpha = join(root, "fixtures", "a", "sample");
    const beta = join(root, "fixtures", "b", "sample");
    for (const [directory, name] of [
      [alpha, "Alpha"],
      [beta, "Beta"],
    ]) {
      await put(
        join(directory!, ".knorvia-plugin", "plugin.json"),
        JSON.stringify({ name, version: "1.0", skills: [] }),
      );
      await put(join(directory!, "synthetic.txt"), `${name} synthetic content\n`);
    }
    setDataBaseDir(sourceBase);
    await put(
      join(sourceBase, ".knorvia-studio", "cli", "config.json"),
      JSON.stringify({
        plugins: { dirs: [alpha, alpha, beta], enabledPlugins: { "ALPHA@INLINE": false } },
      }),
    );
    const service = createPluginSyncService();
    const candidates = (await service.listLocalUserPluginCandidates()).candidates;
    assert.deepEqual(
      candidates.map(({ name, enabled }) => ({ name, enabled })),
      [
        { name: "Alpha", enabled: false },
        { name: "Beta", enabled: true },
      ],
    );
    assert.equal(new Set(candidates.map((entry) => entry.directoryName)).size, 2);
    const archive = await service.exportPluginsArchive({
      pluginIds: candidates.map((entry) => entry.id).reverse(),
    });
    assert.deepEqual(
      archive.plugins.map((entry) => entry.name),
      ["Beta", "Alpha"],
    );
    assert.equal(archive.plugins[0]?.enabled, undefined);
    assert.equal(archive.plugins[1]?.enabled, false);

    setDataBaseDir(destinationBase);
    const config = join(destinationBase, ".knorvia-studio", "cli", "config.json");
    await put(
      config,
      JSON.stringify({
        keep: { synthetic: [1, 2] },
        plugins: { retained: true, dirs: [], enabledPlugins: { "untouched@inline": true } },
      }),
    );
    const imported = await service.importPluginsArchive({ archive: archive.archive });
    assert.deepEqual(
      imported.results.map(({ name, status }) => ({ name, status })),
      [
        { name: "Beta", status: "synced" },
        { name: "Alpha", status: "synced" },
      ],
    );
    const rawConfig = await readFile(config, "utf8");
    const saved = JSON.parse(rawConfig);
    assert.deepEqual(saved, {
      keep: { synthetic: [1, 2] },
      plugins: {
        retained: true,
        dirs: imported.results.map((entry) => entry.path),
        enabledPlugins: { "untouched@inline": true, "Alpha@inline": false },
      },
    });
    assert.equal(rawConfig, `${JSON.stringify(saved, null, 2)}\n`);
    if (process.platform !== "win32") assert.equal((await stat(config)).mode & 0o777, 0o600);
    for (const entry of imported.results) {
      assert.equal(
        await readFile(join(entry.path!, "synthetic.txt"), "utf8"),
        `${entry.name} synthetic content\n`,
      );
    }
    const statuses = await service.listRemoteUserPluginStatuses({
      plugins: [
        { pluginId: "Alpha@inline", directoryName: "another-directory" },
        { pluginId: "different@inline", directoryName: archive.plugins[0]!.directoryName },
      ],
    });
    assert.deepEqual(
      statuses.statuses.map((entry) => entry.reason),
      ["samePluginId", "targetExists"],
    );
    assert.deepEqual(
      (await service.importPluginsArchive({ archive: archive.archive })).results.map(
        (entry) => entry.status,
      ),
      ["skipped", "skipped"],
    );
    assert.equal(await readFile(config, "utf8"), rawConfig);

    const marketplace = join(root, "fixtures", "marketplace");
    const localPlugin = join(marketplace, "packages", "local");
    await put(
      join(localPlugin, ".knorvia-plugin", "plugin.json"),
      JSON.stringify({ name: "local", commands: [] }),
    );
    await put(join(localPlugin, "synthetic.txt"), "marketplace synthetic content\n");
    await put(
      join(marketplace, "marketplace.json"),
      JSON.stringify({
        name: "synthetic-market",
        pluginRoot: "packages",
        retained: true,
        plugins: [
          { name: "local", source: "./local", dependencies: ["declared-only@synthetic-market"] },
          {
            name: "declared-only",
            source: { source: "url", url: "https://example.invalid/synthetic" },
          },
        ],
      }),
    );
    const mirror = await service.exportMarketplaceSourceArchive({
      marketplaceId: "synthetic-market",
      pluginNames: ["local"],
      source: { source: "directory", path: marketplace },
    });
    assert.deepEqual(mirror.pluginNames, ["local", "declared-only"]);
    const received = await service.importMarketplaceSourceArchive({ archive: mirror.archive });
    assert.equal(received.status, "synced");
    assert.equal(
      await readFile(join(received.path, "plugins", "local", "synthetic.txt"), "utf8"),
      "marketplace synthetic content\n",
    );
    const mirrored = JSON.parse(await readFile(join(received.path, "marketplace.json"), "utf8"));
    assert.equal(mirrored.pluginRoot, undefined);
    assert.deepEqual(mirrored.metadata, { pluginRoot: "plugins" });
    assert.equal(mirrored.plugins[0].source, "./local");
    assert.equal(mirrored.plugins[1].source.url, "https://example.invalid/synthetic");
    assert.equal(
      (await service.importMarketplaceSourceArchive({ archive: mirror.archive })).status,
      "skipped",
    );
    assert.equal(await readFile(config, "utf8"), rawConfig);
    assert.deepEqual(await readdir(join(destinationBase, ".knorvia-studio", "tmp")), []);
    setDataBaseDir(null);
  } finally {
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(root, { recursive: true, force: true });
  }
});
