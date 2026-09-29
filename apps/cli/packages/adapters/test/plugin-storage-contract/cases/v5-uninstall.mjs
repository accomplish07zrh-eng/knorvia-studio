// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { at, captureThrow, events, makeCase, pathExists, writeJson, writeText } from "./util.mjs";

function record(storageRoot, installPath, overrides = {}) {
  return {
    id: "alpha@sample-market",
    name: "alpha",
    marketplace: "sample-market",
    version: "1.0.0",
    installPath,
    installedAt: "2024-01-01T00:00:00.000Z",
    scope: "user",
    ...overrides,
  };
}

async function prepareArrayRecord(context, storageRoot, installPath) {
  const nested = { ...context, runRoot: storageRoot };
  const installed = record(storageRoot, installPath);
  await mkdir(installPath, { recursive: true });
  await writeText({ ...context, runRoot: installPath }, "sentinel.txt", "preserve-me\n");
  const dataPath = context.facades.marketplace.getPluginDataDir(storageRoot, installed.id);
  await mkdir(dataPath, { recursive: true });
  await writeText({ ...context, runRoot: dataPath }, "user-data.txt", "user-data\n");
  await writeJson(nested, "installed_plugins.json", { version: 1, plugins: [installed] });
  return { dataPath, installed, nested };
}

function authorityCommit(context, storageRoot) {
  return context.world.events.find(
    (entry) =>
      entry.kind === "fs.rename" &&
      entry.paths?.[1] === join(storageRoot, "installed_plugins.json"),
  );
}

async function assertRefused(context, storageRoot, installPath) {
  const { dataPath, installed } = await prepareArrayRecord(context, storageRoot, installPath);
  const before = await stat(join(installPath, "sentinel.txt"));
  const error = await captureThrow(() =>
    context.facades.marketplace.uninstallMarketplacePlugin({
      storageRoot,
      pluginId: installed.id,
      removeCache: true,
      keepData: false,
    }),
  );
  context.assert.match(error.message, /cache|install|outside|descendant|refus|unsafe|scope|path/iu);
  context.assert.deepEqual(context.facades.marketplace.listInstalledPluginRecords(storageRoot), []);
  context.assert.ok(authorityCommit(context, storageRoot));
  context.assert.equal(await readFile(join(installPath, "sentinel.txt"), "utf8"), "preserve-me\n");
  context.assert.equal((await stat(join(installPath, "sentinel.txt"))).mtimeMs, before.mtimeMs);
  context.assert.equal(await pathExists(dataPath), true);
  const removedPaths = events(context, "fs.rm").flatMap((entry) => entry.paths ?? []);
  context.assert.equal(removedPaths.includes(installPath), false);
  context.assert.equal(removedPaths.includes(dataPath), false);
}

export const v5UninstallCases = [
  makeCase("U501", async (context) => {
    const storageRoot = at(context, "storage");
    const installPath = join(storageRoot, "cache", "sample-market", "alpha", "1.0.0");
    const { dataPath, installed } = await prepareArrayRecord(context, storageRoot, installPath);
    const removed = await context.facades.marketplace.uninstallMarketplacePlugin({
      storageRoot,
      pluginId: installed.id,
      removeCache: true,
      keepData: false,
    });
    context.assert.equal(removed.id, installed.id);
    context.assert.equal(await pathExists(installPath), false);
    context.assert.equal(await pathExists(dataPath), false);
    const committed = authorityCommit(context, storageRoot);
    const cacheRm = events(context, "fs.rm").find((entry) => entry.paths?.[0] === installPath);
    const dataRm = events(context, "fs.rm").find((entry) => entry.paths?.[0] === dataPath);
    context.assert.ok(committed.index < cacheRm.index && cacheRm.index < dataRm.index);
  }),
  makeCase(
    "U502",
    async (context) => {
      const storageRoot = at(context, "storage");
      await assertRefused(context, storageRoot, at(context, "outside-cache", "alpha"));
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase(
    "U503",
    async (context) => {
      const storageRoot = at(context, "storage");
      context.world.config.cwd = context.runRoot;
      process.chdir(context.runRoot);
      const outsideAbsolute = at(context, "relative-outside", "alpha");
      const outsideRelative = relative(context.runRoot, outsideAbsolute);
      const { dataPath, installed } = await prepareArrayRecord(
        context,
        storageRoot,
        outsideAbsolute,
      );
      installed.installPath = outsideRelative;
      await writeJson({ ...context, runRoot: storageRoot }, "installed_plugins.json", {
        version: 1,
        plugins: [installed],
      });
      const error = await captureThrow(() =>
        context.facades.marketplace.uninstallMarketplacePlugin({
          storageRoot,
          pluginId: installed.id,
          removeCache: true,
          keepData: false,
        }),
      );
      context.assert.match(
        error.message,
        /cache|install|outside|descendant|refus|unsafe|scope|path/iu,
      );
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(storageRoot),
        [],
      );
      context.assert.equal(await pathExists(outsideAbsolute), true);
      context.assert.equal(await pathExists(dataPath), true);

      const insideRoot = at(context, "relative-inside-storage");
      const insideAbsolute = join(insideRoot, "cache", "sample-market", "alpha", "1.0.0");
      const inside = await prepareArrayRecord(context, insideRoot, insideAbsolute);
      inside.installed.installPath = relative(context.runRoot, insideAbsolute);
      await writeJson({ ...context, runRoot: insideRoot }, "installed_plugins.json", {
        version: 1,
        plugins: [inside.installed],
      });
      await context.facades.marketplace.uninstallMarketplacePlugin({
        storageRoot: insideRoot,
        pluginId: inside.installed.id,
        removeCache: true,
        keepData: true,
      });
      context.assert.equal(await pathExists(insideAbsolute), false);
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase(
    "U504",
    async (context) => {
      const storageRoot = at(context, "storage");
      await assertRefused(context, storageRoot, join(storageRoot, "cache"));
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase(
    "U505",
    async (context) => {
      const storageRoot = at(context, "storage");
      await assertRefused(context, storageRoot, join(storageRoot, "cache-other", "alpha"));
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase("U506", async (context) => {
    const storageRoot = at(context, "storage");
    const installPath = join(storageRoot, "cache", "sample-market", "alpha", "1.0.0");
    context.world.config.ioFaults = [
      {
        op: "rm",
        pathIncludes: join("cache", "sample-market", "alpha"),
        always: true,
        code: "EACCES",
        message: "allowed cache deletion failed",
      },
    ];
    const { dataPath, installed } = await prepareArrayRecord(context, storageRoot, installPath);
    const error = await captureThrow(() =>
      context.facades.marketplace.uninstallMarketplacePlugin({
        storageRoot,
        pluginId: installed.id,
        removeCache: true,
        keepData: false,
      }),
    );
    context.assert.match(error.message, /allowed cache deletion failed/iu);
    context.assert.deepEqual(
      context.facades.marketplace.listInstalledPluginRecords(storageRoot),
      [],
    );
    context.assert.equal(await pathExists(installPath), true);
    context.assert.equal(await pathExists(dataPath), true);
    const commit = authorityCommit(context, storageRoot);
    const attempted = events(context, "fs.rm").find((entry) => entry.paths?.[0] === installPath);
    context.assert.ok(commit.index < attempted.index);
    context.assert.equal(
      events(context, "fs.rm").some((entry) => entry.paths?.[0] === dataPath),
      false,
    );
  }),
  makeCase("U507", async (context) => {
    for (const [index, keepData] of [false, true].entries()) {
      const storageRoot = at(context, `storage-${index}`);
      const outside = at(context, `historical-outside-${index}`, "alpha");
      const { dataPath, installed } = await prepareArrayRecord(context, storageRoot, outside);
      const removed = await context.facades.marketplace.uninstallMarketplacePlugin({
        storageRoot,
        pluginId: installed.id,
        removeCache: false,
        keepData,
      });
      context.assert.equal(removed.id, installed.id);
      context.assert.equal(await pathExists(outside), true);
      context.assert.equal(await pathExists(dataPath), true);
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(storageRoot),
        [],
      );
      const rms = events(context, "fs.rm").filter(
        (entry) => entry.paths?.includes(outside) || entry.paths?.includes(dataPath),
      );
      context.assert.equal(rms.length, 0);
    }
  }),
  makeCase("U508", async (context) => {
    const outside = at(context, "historical-readable", "alpha");
    await mkdir(join(outside, ".knorvia-plugin"), { recursive: true });
    await writeJson({ ...context, runRoot: outside }, join(".knorvia-plugin", "plugin.json"), {
      name: "alpha",
      version: "3.2.1",
    });
    await writeJson(context, "installed_plugins.json", {
      version: 0,
      plugins: {
        "alpha@sample-market": { installPath: outside, scope: "project" },
      },
    });
    await writeJson(context, "known_marketplaces.json", {
      version: 1,
      marketplaces: [
        {
          id: "sample-market",
          name: "sample-market",
          addedAt: "2025-01-01T00:00:00.000Z",
          pluginCount: 1,
          source: {
            source: "settings",
            marketplace: { name: "sample-market", plugins: [{ name: "alpha" }] },
          },
        },
      ],
    });
    const [historical] = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
    context.assert.equal(historical.installPath, outside);
    context.assert.equal(
      context.facades.marketplace.resolveInstalledPluginRoot(context.runRoot, historical),
      outside,
    );
    const described = await context.facades.marketplace.describeMarketplacePlugin({
      storageRoot: context.runRoot,
      marketplace: "sample-market",
      name: "alpha",
    });
    context.assert.ok(Array.isArray(described.components));
    context.assert.equal(events(context, "pluginComponents.enumerate").at(-1).rootPath, outside);
  }),
];
