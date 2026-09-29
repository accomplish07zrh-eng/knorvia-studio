// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { at, captureThrow, events, makeCase, pathExists, readJson, writeJson } from "./util.mjs";

async function writeMarketplace(context, market, plugins, extras = {}) {
  await writeJson(context, join("marketplaces", market, "marketplace.json"), {
    name: market,
    plugins,
    ...extras,
  });
}

async function localSource(context, market, name, version = "1.0.0", withManifest = false) {
  const relative = join("marketplaces", market, "sources", name);
  await mkdir(at(context, relative), { recursive: true });
  if (withManifest) {
    await writeJson(context, join(relative, ".knorvia-plugin", "plugin.json"), { name, version });
  }
  return `./sources/${name}`;
}

async function callInstall(context, market, name, options = {}) {
  return context.facades.marketplace.installMarketplacePlugin({
    storageRoot: context.runRoot,
    marketplace: market,
    name,
    signal: options.signal,
    scope: options.scope,
    allowCrossMarketplaces: options.allowCrossMarketplaces,
  });
}

function installedPath(context, market, name, version = "1.0.0") {
  return at(context, "cache", market, name, version);
}

function installedRecord(context, market, name, options = {}) {
  return {
    id: `${name}@${market}`,
    name,
    marketplace: market,
    version: options.version ?? "1.0.0",
    installPath: options.installPath ?? installedPath(context, market, name, options.version),
    installedAt: options.installedAt ?? "2024-01-01T00:00:00.000Z",
    scope: options.scope ?? "user",
    ...options.extra,
  };
}

function gitSuccessManifest(name = "alpha", version = "1.0.0") {
  return {
    files: [
      {
        path: "$DEST/.knorvia-plugin/plugin.json",
        text: `${JSON.stringify({ name, version }, null, 2)}\n`,
      },
    ],
  };
}

export const installationCases = [
  makeCase("E01", async (context) => {
    const market = "sample-market";
    const sources = {};
    for (const name of ["A", "B", "C"]) sources[name] = await localSource(context, market, name);
    await writeMarketplace(context, market, [
      { name: "A", version: "1.0.0", source: sources.A, strict: false, dependencies: ["B", "C"] },
      { name: "B", version: "1.0.0", source: sources.B, strict: false, dependencies: ["C"] },
      { name: "C", version: "1.0.0", source: sources.C, strict: false },
    ]);
    const result = await callInstall(context, market, "A");
    context.assert.deepEqual(result.closure, [
      "C@sample-market",
      "B@sample-market",
      "A@sample-market",
    ]);
    context.assert.deepEqual(
      result.installed.map((item) => item.id),
      result.closure,
    );
    context.assert.equal(new Set(result.closure).size, 3);
  }),
  makeCase("E02", async (context) => {
    const scenarios = [
      {
        root: "cycle",
        plugins: [
          { name: "A", source: "./sources/A", strict: false, dependencies: ["B"] },
          { name: "B", source: "./sources/B", strict: false, dependencies: ["A"] },
        ],
        expected: /cycle/iu,
      },
      {
        root: "missing",
        plugins: [{ name: "A", source: "./sources/A", strict: false, dependencies: ["missing"] }],
        expected: /missing|not found/iu,
      },
    ];
    for (const scenario of scenarios) {
      const storageRoot = at(context, scenario.root);
      const nested = { ...context, runRoot: storageRoot };
      for (const plugin of scenario.plugins)
        await mkdir(join(storageRoot, "marketplaces", "sample-market", plugin.source), {
          recursive: true,
        });
      await writeMarketplace(nested, "sample-market", scenario.plugins);
      const error = await captureThrow(() =>
        context.facades.marketplace.installMarketplacePlugin({
          storageRoot,
          marketplace: "sample-market",
          name: "A",
        }),
      );
      context.assert.match(error.message, scenario.expected);
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(storageRoot),
        [],
      );
    }

    const crossRoot = at(context, "cross");
    const cross = { ...context, runRoot: crossRoot };
    await mkdir(join(crossRoot, "marketplaces", "root-market", "sources", "A"), {
      recursive: true,
    });
    await mkdir(join(crossRoot, "marketplaces", "other-market", "sources", "D"), {
      recursive: true,
    });
    await writeMarketplace(cross, "root-market", [
      { name: "A", source: "./sources/A", strict: false, dependencies: ["D@other-market"] },
    ]);
    await writeMarketplace(cross, "other-market", [
      { name: "D", source: "./sources/D", strict: false },
    ]);
    const crossError = await captureThrow(() =>
      context.facades.marketplace.installMarketplacePlugin({
        storageRoot: crossRoot,
        marketplace: "root-market",
        name: "A",
      }),
    );
    context.assert.match(crossError.message, /cross|other-market|allow/iu);
  }),
  makeCase("E03", async (context) => {
    const root = at(context, "allowed");
    const nested = { ...context, runRoot: root };
    await mkdir(join(root, "marketplaces", "root-market", "sources", "A"), { recursive: true });
    await mkdir(join(root, "marketplaces", "other-market", "sources", "D"), { recursive: true });
    await writeMarketplace(
      nested,
      "root-market",
      [{ name: "A", source: "./sources/A", strict: false, dependencies: ["D@other-market"] }],
      {
        allowCrossMarketplaceDependenciesOn: ["other-market"],
      },
    );
    await writeMarketplace(nested, "other-market", [
      { name: "D", source: "./sources/D", strict: false },
    ]);
    const allowed = await context.facades.marketplace.installMarketplacePlugin({
      storageRoot: root,
      marketplace: "root-market",
      name: "A",
    });
    context.assert.deepEqual(allowed.closure, ["D@other-market", "A@root-market"]);

    const overrideRoot = at(context, "override");
    const override = { ...context, runRoot: overrideRoot };
    await mkdir(join(overrideRoot, "marketplaces", "root-market", "sources", "A"), {
      recursive: true,
    });
    await mkdir(join(overrideRoot, "marketplaces", "other-market", "sources", "D"), {
      recursive: true,
    });
    await writeMarketplace(
      override,
      "root-market",
      [{ name: "A", source: "./sources/A", strict: false, dependencies: ["D@other-market"] }],
      {
        allowCrossMarketplaceDependenciesOn: ["other-market"],
      },
    );
    await writeMarketplace(override, "other-market", [
      { name: "D", source: "./sources/D", strict: false },
    ]);
    const error = await captureThrow(() =>
      context.facades.marketplace.installMarketplacePlugin({
        storageRoot: overrideRoot,
        marketplace: "root-market",
        name: "A",
        allowCrossMarketplaces: new Set(),
      }),
    );
    context.assert.match(error.message, /cross|other-market|allow/iu);
  }),
  makeCase("E04", async (context) => {
    const source = await localSource(context, "sample-market", "alpha", "9.8.7", true);
    await writeMarketplace(context, "sample-market", [{ name: "alpha", version: "1.0.0", source }]);
    const result = await callInstall(context, "sample-market", "alpha");
    context.assert.equal(result.installed[0].version, "9.8.7");
    context.assert.equal(
      result.installed[0].installPath,
      installedPath(context, "sample-market", "alpha", "9.8.7"),
    );
  }),
  makeCase("E05", async (context) => {
    const source = await localSource(context, "sample-market", "alpha");
    await writeMarketplace(context, "sample-market", [
      {
        name: "alpha",
        version: "1.0.0",
        description: "Synthetic",
        source,
        strict: false,
        displayName: "Top-level store-only",
        heroImage: "top-level-hero.png",
        listing: { displayName: "Store-only", heroImage: "hero.png" },
      },
    ]);
    const result = await callInstall(context, "sample-market", "alpha");
    const manifest = await readJson(
      { ...context, runRoot: result.installed[0].installPath },
      join(".claude-plugin", "plugin.json"),
    );
    context.assert.equal(manifest.name, "alpha");
    context.assert.equal(manifest.version, "1.0.0");
    context.assert.equal(manifest.description, "Synthetic");
    context.assert.equal(manifest.source, undefined);
    context.assert.equal(manifest.strict, undefined);
    context.assert.equal(manifest.displayName, undefined);
    context.assert.equal(manifest.heroImage, undefined);
    context.assert.deepEqual(manifest.listing, {
      displayName: "Store-only",
      heroImage: "hero.png",
    });
  }),
  makeCase("E06", async (context) => {
    const goodOne = await localSource(context, "sample-market", "good-one");
    const goodTwo = await localSource(context, "sample-market", "good-two");
    await mkdir(at(context, "marketplaces", "sample-market", "bad-local"), { recursive: true });
    await writeMarketplace(context, "sample-market", [
      {
        name: "root",
        version: "1.0.0",
        source: { source: "directory", path: " " },
        dependencies: ["good-one", "good-two"],
      },
      { name: "good-one", version: "1.0.0", source: goodOne, strict: false },
      { name: "good-two", version: "1.0.0", source: goodTwo, strict: false },
    ]);
    await captureThrow(() => callInstall(context, "sample-market", "root"));
    const goodOneTarget = installedPath(context, "sample-market", "good-one");
    const goodTwoTarget = installedPath(context, "sample-market", "good-two");
    context.assert.equal(await pathExists(goodOneTarget), false);
    context.assert.equal(await pathExists(goodTwoTarget), false);
    context.assert.deepEqual(
      context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
      [],
    );
    const rollbackTargets = events(context, "fs.rm")
      .map((entry) => entry.paths[0])
      .filter((path) => path === goodOneTarget || path === goodTwoTarget);
    context.assert.deepEqual(rollbackTargets, [goodTwoTarget, goodOneTarget]);
  }),
  makeCase(
    "E07",
    async (context) => {
      const source = await localSource(context, "sample-market", "alpha");
      await writeMarketplace(context, "sample-market", [
        { name: "alpha", version: "1.0.0", source, strict: false },
      ]);
      const error = await captureThrow(() => callInstall(context, "sample-market", "alpha"));
      context.assert.match(error.message, /authority write failed/iu);
      context.assert.equal(
        await pathExists(installedPath(context, "sample-market", "alpha")),
        false,
      );
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
        [],
      );
    },
    {
      world: {
        ioFaults: [
          {
            op: "writeFile",
            pathIncludes: "installed_plugins.json",
            always: true,
            code: "EIO",
            message: "authority write failed",
          },
        ],
      },
    },
  ),
  makeCase(
    "E08",
    async (context) => {
      const source = await localSource(context, "sample-market", "alpha");
      await writeMarketplace(context, "sample-market", [
        { name: "alpha", version: "1.0.0", source, strict: false },
      ]);
      const result = await callInstall(context, "sample-market", "alpha");
      context.assert.equal(result.installed.length, 1);
      const resolved = context.facades.marketplace.resolveInstalledPluginRoot(
        context.runRoot,
        result.installed[0],
      );
      context.assert.equal(resolved, result.installed[0].installPath);
      context.assert.equal(
        await pathExists(
          join(dirnameSafe(resolved), `.${basenameSafe(resolved)}.transaction.json`),
        ),
        false,
      );
    },
    {
      world: {
        ioFaults: [{ op: "rm", pathSuffix: ".transaction.json", times: 3, code: "EACCES" }],
      },
    },
  ),
  makeCase(
    "E09",
    async (context) => {
      const source = await localSource(context, "sample-market", "alpha");
      await writeMarketplace(context, "sample-market", [
        { name: "alpha", version: "1.0.0", source, strict: false },
      ]);
      const controller = new AbortController();
      context.world.abortController = controller;
      const error = await captureThrow(() =>
        callInstall(context, "sample-market", "alpha", { signal: controller.signal }),
      );
      context.assert.match(error.name + error.message, /abort|cancel/iu);
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
        [],
      );
      context.assert.equal(
        await pathExists(installedPath(context, "sample-market", "alpha")),
        false,
      );
    },
    { world: { abortOnIo: { op: "cp", at: 1 } } },
  ),
  makeCase(
    "E10",
    async (context) => {
      const source = await localSource(context, "sample-market", "alpha");
      await writeMarketplace(context, "sample-market", [
        { name: "alpha", version: "1.0.0", source, strict: false },
      ]);
      const controller = new AbortController();
      context.world.abortController = controller;
      const error = await captureThrow(() =>
        callInstall(context, "sample-market", "alpha", { signal: controller.signal }),
      );
      context.assert.match(error.name + error.message, /abort|cancel/iu);
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
        [],
      );
      context.assert.equal(
        await pathExists(installedPath(context, "sample-market", "alpha")),
        false,
      );
    },
    {
      world: {
        abortOnIo: {
          op: "rename",
          pathIncludes: `${join("cache", "sample-market", "alpha", "1.0.0")}`,
          at: 1,
        },
      },
    },
  ),
  makeCase("E11", async (context) => {
    const superseding = {
      version: 1,
      marketplaces: [
        {
          id: "sample-market",
          name: "sample-market",
          addedAt: "2025-01-01T00:00:00.000Z",
          lastUpdated: "2025-01-03T00:00:00.000Z",
          pluginCount: 0,
          source: { source: "settings", marketplace: { name: "sample-market", plugins: [] } },
          cacheTransactionId: "gB",
        },
      ],
    };
    context.world.config.afterIo = [
      {
        op: "rename",
        pathSuffix: "known_marketplaces.json",
        at: 1,
        writeJson: { path: at(context, "known_marketplaces.json"), value: superseding },
      },
    ];
    const controller = new AbortController();
    context.world.abortController = controller;
    context.world.config.abortOnIo = { op: "rename", pathSuffix: "known_marketplaces.json", at: 1 };
    await captureThrow(() =>
      context.facades.marketplace.addMarketplace({
        storageRoot: context.runRoot,
        signal: controller.signal,
        source: { source: "settings", marketplace: { name: "sample-market", plugins: [] } },
      }),
    );
    const [record] = context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot);
    context.assert.equal(record.cacheTransactionId, "gB");
    context.assert.equal(record.lastUpdated, "2025-01-03T00:00:00.000Z");
  }),
  makeCase(
    "E12",
    async (context) => {
      for (const name of ["A", "B"]) await localSource(context, "sample-market", name);
      await writeMarketplace(context, "sample-market", [
        { name: "A", version: "1.0.0", source: "./sources/A", strict: false },
        { name: "B", version: "1.0.0", source: "./sources/B", strict: false },
      ]);
      const results = await Promise.allSettled([
        callInstall(context, "sample-market", "A"),
        callInstall(context, "sample-market", "B"),
      ]);
      const records = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
      context.assert.ok(records.length >= 1);
      context.assert.equal(new Set(records.map((item) => item.id)).size, records.length);
      context.observe(
        "concurrentResults",
        results.map((item) => item.status),
      );
      context.observe("installedIds", records.map((item) => item.id).sort());
    },
    { policy: "known-gap" },
  ),
  makeCase("E13", async (context) => {
    const result = await context.facades.marketplace.uninstallMarketplacePlugin({
      storageRoot: context.runRoot,
      pluginId: "missing@sample-market",
    });
    context.assert.equal(result, null);
    context.assert.equal(await pathExists(at(context, "installed_plugins.json")), false);
  }),
  makeCase("E14", async (context) => {
    const combinations = [
      { removeCache: false, keepData: false, cache: true, data: true },
      { removeCache: false, keepData: true, cache: true, data: true },
      { removeCache: true, keepData: true, cache: false, data: true },
      { removeCache: true, keepData: false, cache: false, data: false },
    ];
    for (let index = 0; index < combinations.length; index += 1) {
      const item = combinations[index];
      const storageRoot = at(context, `combo-${index}`);
      const nested = { ...context, runRoot: storageRoot };
      const record = installedRecord(nested, "sample-market", "alpha");
      const dependent = installedRecord(nested, "sample-market", "dependent", {
        extra: { dependencies: [record.id] },
      });
      await mkdir(record.installPath, { recursive: true });
      await mkdir(dependent.installPath, { recursive: true });
      const dataPath = context.facades.marketplace.getPluginDataDir(storageRoot, record.id);
      await mkdir(dataPath, { recursive: true });
      await writeJson(nested, "installed_plugins.json", {
        version: 1,
        plugins: [record, dependent],
      });
      const removed = await context.facades.marketplace.uninstallMarketplacePlugin({
        storageRoot,
        pluginId: record.id,
        removeCache: item.removeCache,
        keepData: item.keepData,
      });
      context.assert.equal(removed.id, record.id);
      context.assert.equal(await pathExists(record.installPath), item.cache);
      context.assert.equal(await pathExists(dataPath), item.data);
      context.assert.deepEqual(
        context.facades.marketplace
          .listInstalledPluginRecords(storageRoot)
          .map((entry) => entry.id),
        [dependent.id],
      );
    }
  }),
  makeCase(
    "E15",
    async (context) => {
      const record = installedRecord(context, "sample-market", "alpha");
      await mkdir(record.installPath, { recursive: true });
      await writeJson(context, "installed_plugins.json", { version: 1, plugins: [record] });
      const error = await captureThrow(() =>
        context.facades.marketplace.uninstallMarketplacePlugin({
          storageRoot: context.runRoot,
          pluginId: record.id,
          removeCache: true,
        }),
      );
      context.assert.match(error.message, /cache delete failed/iu);
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
        [],
      );
      context.assert.equal(await pathExists(record.installPath), true);
    },
    {
      world: {
        ioFaults: [
          {
            op: "rm",
            pathIncludes: join("cache", "sample-market", "alpha"),
            always: true,
            code: "EACCES",
            message: "cache delete failed",
          },
        ],
      },
    },
  ),
  makeCase("A09", async (context) => {
    const old = installedRecord(context, "sample-market", "alpha", {
      installedAt: "2020-01-01T00:00:00.000Z",
      extra: { cacheTransactionId: "old-generation" },
    });
    await writeJson(context, "installed_plugins.json", { version: 1, plugins: [old] });
    const source = await localSource(context, "sample-market", "alpha", "2.0.0", true);
    await writeMarketplace(context, "sample-market", [{ name: "alpha", version: "2.0.0", source }]);
    await callInstall(context, "sample-market", "alpha");
    const [updated] = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
    context.assert.equal(updated.installedAt, old.installedAt);
    context.assert.equal(updated.version, "2.0.0");
    context.assert.equal(updated.updatedAt, "2025-01-02T03:04:05.000Z");
    context.assert.equal(typeof updated.cacheTransactionId, "string");
    context.assert.ok(updated.cacheTransactionId.length > 0);
    context.assert.notEqual(updated.cacheTransactionId, old.cacheTransactionId);
  }),
  makeCase(
    "F14",
    async (context) => {
      await writeMarketplace(context, "sample-market", [
        {
          name: "alpha",
          source: { source: "git", url: "https://alice:secret@example.invalid/repo.git" },
        },
      ]);
      const error = await captureThrow(() => callInstall(context, "sample-market", "alpha"));
      context.assert.equal(
        context.facades["source-errors"].getPluginSourceDiagnosticCode(error),
        "plugin_git_unavailable",
      );
      context.assert.doesNotMatch(error.message, /alice|secret/u);
    },
    { world: { git: [{ error: { code: "ENOENT", message: "git missing" } }] } },
  ),
  makeCase(
    "F15",
    async (context) => {
      await writeMarketplace(context, "sample-market", [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "git", url: "git@example.invalid:repo" },
        },
      ]);
      await callInstall(context, "sample-market", "alpha");
      const clones = events(context, "process.execFile").filter((item) =>
        item.args.includes("clone"),
      );
      context.assert.equal(clones.length, 3);
      context.assert.deepEqual(
        events(context, "timer.set")
          .map((item) => item.delay)
          .slice(0, 2),
        [1000, 2000],
      );

      const deniedRoot = at(context, "denied");
      const denied = { ...context, runRoot: deniedRoot };
      await writeMarketplace(denied, "sample-market", [
        {
          name: "alpha",
          source: { source: "git", url: "git@example.invalid:denied" },
        },
      ]);
      const beforeDenied = events(context, "process.execFile").length;
      context.world.scripts.git.push({ error: { code: "EACCES", message: "permission denied" } });
      await captureThrow(() =>
        context.facades.marketplace.installMarketplacePlugin({
          storageRoot: deniedRoot,
          marketplace: "sample-market",
          name: "alpha",
        }),
      );
      context.assert.equal(events(context, "process.execFile").length, beforeDenied + 1);

      const cancelledRoot = at(context, "cancelled");
      const cancelled = { ...context, runRoot: cancelledRoot };
      await writeMarketplace(cancelled, "sample-market", [
        {
          name: "alpha",
          source: { source: "git", url: "git@example.invalid:cancelled" },
        },
      ]);
      const controller = new AbortController();
      controller.abort();
      const beforeCancelled = events(context, "process.execFile").length;
      await captureThrow(() =>
        context.facades.marketplace.installMarketplacePlugin({
          storageRoot: cancelledRoot,
          marketplace: "sample-market",
          name: "alpha",
          signal: controller.signal,
        }),
      );
      context.assert.ok(events(context, "process.execFile").length <= beforeCancelled + 1);
    },
    {
      world: {
        git: [
          { error: { code: "EIO", message: "RPC failed" }, stderr: "RPC failed; early EOF" },
          {
            error: { code: "ETIMEDOUT", message: "connection reset" },
            stderr: "HTTP/2 stream reset",
          },
          { ...gitSuccessManifest("alpha", "1.0.0") },
        ],
      },
    },
  ),
];

function dirnameSafe(path) {
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
}

function basenameSafe(path) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
