// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  at,
  events,
  makeCase,
  pathExists,
  readJson,
  readText,
  writeJson,
  writeText,
} from "./util.mjs";

function manifest(plugins = [], extras = {}) {
  return { name: "sample-market", plugins, ...extras };
}

function pluginManifest(name = "alpha", version = "1.0.0") {
  return `${JSON.stringify({ name, version }, null, 2)}\n`;
}

function gitFile(path, value) {
  return {
    path: `$DEST/${path}`,
    text: typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  };
}

async function add(context, storageRoot, source) {
  return context.facades.marketplace.addMarketplace({ storageRoot, source });
}

export const v5MarketplaceMaterializationCases = [
  makeCase("S501", async (context) => {
    const sourceRoot = at(context, "directory-source");
    await writeJson(
      { ...context, runRoot: sourceRoot },
      join(".claude-plugin", "marketplace.json"),
      manifest([{ name: "nested-wins" }]),
    );
    await writeJson(
      { ...context, runRoot: sourceRoot },
      "marketplace.json",
      manifest([{ name: "root-loses" }]),
    );
    await writeText(
      { ...context, runRoot: sourceRoot },
      join("assets", "sentinel.txt"),
      "whole-directory\n",
    );
    const storageRoot = at(context, "storage");
    const record = await add(context, storageRoot, { source: "directory", path: sourceRoot });
    context.assert.equal(record.id, "sample-market");
    const cached = join(storageRoot, "marketplaces", "sample-market");
    context.assert.deepEqual(
      context.facades.marketplace
        .loadMarketplaceManifestSync(storageRoot, "sample-market")
        .plugins.map((item) => item.name),
      ["nested-wins"],
    );
    context.assert.equal(
      (await readJson({ ...context, runRoot: cached }, "marketplace.json")).plugins[0].name,
      "nested-wins",
    );
    context.assert.equal(
      await readText({ ...context, runRoot: cached }, join("assets", "sentinel.txt")),
      "whole-directory\n",
    );
    context.assert.equal(
      await pathExists(join(cached, ".claude-plugin", "marketplace.json")),
      true,
    );
  }),
  makeCase("S502", async (context) => {
    const storageRoot = at(context, "storage");
    context.world.scripts.git.push({
      files: [
        gitFile("catalog/custom.json", manifest([{ name: "explicit-wins" }])),
        gitFile(".claude-plugin/marketplace.json", manifest([{ name: "nested-loses" }])),
        gitFile("marketplace.json", manifest([{ name: "root-loses" }])),
        gitFile("repo-sentinel.txt", "entire-repository\n"),
      ],
    });
    await add(context, storageRoot, {
      source: "git",
      url: "git@example.invalid:catalog",
      path: "catalog/custom.json",
    });
    const cached = join(storageRoot, "marketplaces", "sample-market");
    context.assert.equal(
      (await readJson({ ...context, runRoot: cached }, "marketplace.json")).plugins[0].name,
      "explicit-wins",
    );
    context.assert.equal(
      await readText({ ...context, runRoot: cached }, "repo-sentinel.txt"),
      "entire-repository\n",
    );
    context.assert.equal(await pathExists(join(cached, "catalog", "custom.json")), true);
    context.assert.equal(
      events(context, "process.execFile").some((entry) => entry.args.includes("clone")),
      true,
    );
  }),
  makeCase("S503", async (context) => {
    const sourceRoot = at(context, "file-source");
    const claudeRoot = join(sourceRoot, ".claude-plugin");
    const sourceFile = await writeJson(
      { ...context, runRoot: claudeRoot },
      "marketplace.json",
      manifest([]),
    );
    await writeText({ ...context, runRoot: claudeRoot }, "sibling.txt", "copied-sibling\n");
    await writeText({ ...context, runRoot: sourceRoot }, "above.txt", "must-not-copy\n");
    const storageRoot = at(context, "storage");
    await add(context, storageRoot, { source: "file", path: sourceFile });
    const cached = join(storageRoot, "marketplaces", "sample-market");
    context.assert.equal(
      await readText({ ...context, runRoot: cached }, "sibling.txt"),
      "copied-sibling\n",
    );
    context.assert.equal(await pathExists(join(cached, "above.txt")), false);
    context.assert.equal(
      (await readJson({ ...context, runRoot: cached }, "marketplace.json")).name,
      "sample-market",
    );
  }),
  makeCase("S504", async (context) => {
    const storageRoot = at(context, "storage");
    context.world.scripts.git.push({
      files: [
        gitFile(
          "catalog/custom.json",
          manifest([{ name: "alpha" }], { metadata: { pluginRoot: "packages" } }),
        ),
        gitFile("packages/alpha/.knorvia-plugin/plugin.json", pluginManifest("alpha", "4.5.6")),
        gitFile(
          "catalog/packages/alpha/.knorvia-plugin/plugin.json",
          pluginManifest("alpha", "9.9.9"),
        ),
      ],
    });
    await add(context, storageRoot, {
      source: "git",
      url: "git@example.invalid:catalog",
      path: "catalog/custom.json",
    });
    const installed = await context.facades.marketplace.installMarketplacePlugin({
      storageRoot,
      marketplace: "sample-market",
      name: "alpha",
    });
    context.assert.equal(installed.installed[0].version, "4.5.6");
    context.assert.equal(
      installed.installed[0].installPath,
      join(storageRoot, "cache", "sample-market", "alpha", "4.5.6"),
    );
  }),
  makeCase("S505", async (context) => {
    const scenarios = [
      {
        label: "escape",
        pluginRoot: "../escape",
        setup: async () => mkdir(at(context, "escape"), { recursive: true }),
      },
      { label: "missing", pluginRoot: "missing-directory", setup: async () => {} },
      {
        label: "file",
        pluginRoot: "not-a-directory",
        setup: async (root) =>
          writeText({ ...context, runRoot: root }, "not-a-directory", "file\n"),
      },
    ];
    for (const scenario of scenarios) {
      const sourceRoot = at(context, `source-${scenario.label}`);
      const storageRoot = at(context, `storage-${scenario.label}`);
      await scenario.setup(sourceRoot);
      await writeJson(
        { ...context, runRoot: sourceRoot },
        join(".claude-plugin", "marketplace.json"),
        manifest([{ name: "alpha" }], { metadata: { pluginRoot: scenario.pluginRoot } }),
      );
      await writeText(
        { ...context, runRoot: sourceRoot },
        join("alpha", ".knorvia-plugin", "plugin.json"),
        pluginManifest("alpha", "2.3.4"),
      );
      await add(context, storageRoot, { source: "directory", path: sourceRoot });
      const result = await context.facades.marketplace.installMarketplacePlugin({
        storageRoot,
        marketplace: "sample-market",
        name: "alpha",
      });
      context.assert.equal(result.installed[0].version, "2.3.4");
    }
  }),
  makeCase("S506", async (context) => {
    const settingsRoot = at(context, "settings-storage");
    await add(context, settingsRoot, { source: "settings", marketplace: manifest([]) });
    const settingsCache = join(settingsRoot, "marketplaces", "sample-market");
    context.assert.deepEqual(await readdir(settingsCache), ["marketplace.json"]);

    const urlRoot = at(context, "url-storage");
    context.world.scripts.http.push({ status: 200, bodyText: JSON.stringify(manifest([])) });
    await add(context, urlRoot, { source: "url", url: "https://catalog.invalid/marketplace.json" });
    const urlCache = join(urlRoot, "marketplaces", "sample-market");
    context.assert.deepEqual(await readdir(urlCache), ["marketplace.json"]);
    context.assert.equal(
      (await readJson({ ...context, runRoot: urlCache }, "marketplace.json")).name,
      "sample-market",
    );
  }),
  makeCase("S507", async (context) => {
    const sourceRoot = at(context, "validate-source");
    const storageRoot = at(context, "validate-storage");
    await writeJson(
      { ...context, runRoot: sourceRoot },
      join(".claude-plugin", "marketplace.json"),
      manifest([]),
    );
    const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
      storageRoot,
      source: { source: "directory", path: sourceRoot },
    });
    context.assert.deepEqual(
      diagnostics.filter((item) => item.severity === "error"),
      [],
    );
    context.assert.equal(await pathExists(join(storageRoot, "known_marketplaces.json")), false);
    context.assert.equal(await pathExists(join(storageRoot, "marketplaces")), false);
  }),
];
