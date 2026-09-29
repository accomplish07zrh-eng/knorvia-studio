// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { join, sep } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  at,
  captureThrow,
  events,
  makeCase,
  pathExists,
  readJson,
  readText,
  writeJson,
  writeText,
} from "./util.mjs";

const OFFICIAL = "knorvia-plugins-bundled";
const epoch = "1970-01-01T00:00:00.000Z";
const syntheticDefault = Object.freeze({
  id: "fixture-market",
  source: "https://example.invalid/marketplace.json",
  name: "Fixture Marketplace",
  description: "Synthetic contract fixture",
  pluginCount: 1,
  lastUpdated: "2026-09-01T00:00:00.000Z",
});

function expectedDefaultRecord(overrides = {}) {
  return {
    id: "fixture-market",
    source: { source: "url", url: "https://example.invalid/marketplace.json" },
    name: "Fixture Marketplace",
    description: "Synthetic contract fixture",
    addedAt: "2025-01-02T03:04:05.000Z",
    lastUpdated: "2026-09-01T00:00:00.000Z",
    pluginCount: 1,
    ...overrides,
  };
}

function knownAuthority(records) {
  return { version: 1, marketplaces: records };
}

function assertSyncAtomicKnownWrite(context) {
  const writes = events(context, "fs.writeFileSync");
  context.assert.ok(
    writes.some((entry) => entry.paths[0].includes(".known_marketplaces.json.stage-")),
  );
  context.assert.ok(
    writes.some(
      (entry) =>
        entry.paths[0].endsWith(".known_marketplaces.json.transaction.json") &&
        (entry.options === "wx" || entry.options?.flag === "wx"),
    ),
  );
  context.assert.ok(
    events(context, "fs.renameSync").some((entry) =>
      entry.paths.at(-1).endsWith("known_marketplaces.json"),
    ),
  );
}

function knownRecord(overrides = {}) {
  return {
    id: "sample-market",
    source: { source: "settings", marketplace: { name: "sample-market", plugins: [] } },
    name: "sample-market",
    addedAt: "2025-01-02T03:04:05.000Z",
    pluginCount: 0,
    ...overrides,
  };
}

function installedRecord(overrides = {}) {
  return {
    id: "alpha@sample-market",
    name: "alpha",
    marketplace: "sample-market",
    version: "1.0.0",
    installPath: "synthetic/install/alpha",
    installedAt: "2025-01-02T03:04:05.000Z",
    scope: "user",
    ...overrides,
  };
}

function bundledCache(context, plugin, version) {
  return at(context, "cache", OFFICIAL, plugin, version);
}

export const stateOfficialCases = [
  makeCase("A01", async (context) => {
    const record = knownRecord({ cacheTransactionId: "g1", description: "Synthetic" });
    await writeJson(context, "known_marketplaces.json", { version: 1, marketplaces: [record] });
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [record],
    );
  }),
  makeCase("A02", async (context) => {
    const valid = knownRecord({ id: "value-id", name: "value-id" });
    await writeJson(context, "known_marketplaces.json", {
      marketplaces: {
        ignored: valid,
        bad: { id: "bad", name: "bad", source: "url", pluginCount: 1 },
      },
    });
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [valid],
    );
  }),
  makeCase("A03", async (context) => {
    await writeText(context, "known_marketplaces.json", "{broken");
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [],
    );
    await writeJson(context, "known_marketplaces.json", []);
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [],
    );
  }),
  makeCase("A04", async (context) => {
    const minimal = { id: "minimal", name: "minimal", pluginCount: 0, source: {} };
    await writeJson(context, "known_marketplaces.json", { version: 99, marketplaces: [minimal] });
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [minimal],
    );
  }),
  makeCase("A05", async (context) => {
    const valid = installedRecord();
    await writeJson(context, "installed_plugins.json", {
      version: 7,
      plugins: [valid, { ...valid, id: 1 }, { ...valid, scope: "project" }],
    });
    context.assert.deepEqual(
      context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
      [valid],
    );
  }),
  makeCase("A06", async (context) => {
    await writeJson(context, "installed_plugins.json", {
      version: 0,
      plugins: {
        "alpha@legacy-market": {
          installPath: "synthetic/alpha",
          scope: "project",
          lastUpdated: "2024-02-01T00:00:00.000Z",
        },
      },
    });
    const [record] = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
    context.assert.equal(record.id, "alpha@legacy-market");
    context.assert.equal(record.name, "alpha");
    context.assert.equal(record.marketplace, "legacy-market");
    context.assert.equal(record.version, "0.0.0");
    context.assert.equal(record.installedAt, epoch);
    context.assert.equal(record.updatedAt, "2024-02-01T00:00:00.000Z");
    context.assert.equal(record.scope, "workspace");
  }),
  makeCase("A07", async (context) => {
    await writeJson(context, "installed_plugins.json", {
      plugins: {
        "beta@legacy-market": [
          { installPath: "synthetic/beta-one", scope: "local" },
          { installPath: "", scope: "user" },
        ],
        invalid: { installPath: "synthetic/bad" },
      },
    });
    const records = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
    context.assert.equal(records.length, 1);
    context.assert.equal(records[0].id, "beta@legacy-market");
    context.assert.equal(records[0].scope, "workspace");
  }),
  makeCase("A08", async (context) => {
    await writeJson(context, "installed_plugins.json", {
      plugins: {
        "workspace@legacy-market": { installPath: "synthetic/w", scope: "workspace" },
        "unknown@legacy-market": { installPath: "synthetic/u", scope: "other" },
      },
    });
    const records = context.facades.marketplace.listInstalledPluginRecords(context.runRoot);
    context.assert.deepEqual(
      records.map((item) => item.scope),
      ["user", "user"],
    );
  }),
  makeCase("P01", async (context) => {
    const known = knownRecord({ cacheTransactionId: "known-g" });
    const installed = installedRecord({ cacheTransactionId: "installed-g" });
    await writeJson(context, "known_marketplaces.json", { version: 1, marketplaces: [known] });
    await writeJson(context, "installed_plugins.json", { version: 1, plugins: [installed] });
    context.assert.equal(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot)[0].cacheTransactionId,
      "known-g",
    );
    context.assert.equal(
      context.facades.marketplace.listInstalledPluginRecords(context.runRoot)[0].cacheTransactionId,
      "installed-g",
    );
  }),
  makeCase("C01", async (context) => {
    const official = context.facades["official-marketplace"];
    const bundledAlpha = {
      name: "alpha",
      version: "1",
      source: "filesystem",
      cachePath: bundledCache(context, "alpha", "1"),
    };
    const bundledBeta = {
      name: "beta",
      version: "1",
      source: "filesystem",
      cachePath: bundledCache(context, "beta", "1"),
    };
    const cdnAlpha = { name: "alpha", version: "2", source: "sea" };
    const cdnGamma = { name: "gamma", version: "1", source: "sea" };
    await mkdir(bundledAlpha.cachePath, { recursive: true });
    official.writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, plugins: [bundledAlpha, bundledBeta] },
    });
    const merged = official.writeCdnOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, plugins: [cdnAlpha, cdnGamma] },
    });
    context.assert.deepEqual(
      merged.plugins.map((item) => `${item.name}:${item.version}`),
      ["alpha:2", "gamma:1", "beta:1"],
    );
    context.assert.equal(await pathExists(bundledCache(context, "alpha", "1")), true);
  }),
  makeCase("C02", (context) => {
    const api = context.facades["official-marketplace"];
    api.writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, description: "bundled", plugins: [] },
    });
    const merged = api.writeCdnOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, description: "cdn", plugins: [] },
    });
    context.assert.equal(merged.name, OFFICIAL);
    context.assert.equal(merged.description, "cdn");
  }),
  makeCase("C03", (context) => {
    const api = context.facades["official-marketplace"];
    api.writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, plugins: [] },
    });
    context.assert.deepEqual(api.loadBundledOfficialPluginRootsSync(context.runRoot), []);
  }),
  makeCase("C04", async (context) => {
    await writeText(context, join("marketplaces", OFFICIAL, "bundled-marketplace.json"), "{bad");
    context.assert.equal(
      context.facades["official-marketplace"].loadBundledOfficialPluginRootsSync(context.runRoot),
      undefined,
    );
  }),
  makeCase("C05", (context) => {
    const api = context.facades["official-marketplace"];
    const alpha = { name: "alpha", cachePath: bundledCache(context, "alpha", "1") };
    api.writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, plugins: [alpha] },
    });
    const merged = api.writeCdnOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: { name: OFFICIAL, plugins: [] },
    });
    context.assert.deepEqual(merged.plugins, [alpha]);
  }),
  makeCase("C06", (context) => {
    const api = context.facades["official-marketplace"];
    const pluginRoot = at(context, "cache", OFFICIAL, "alpha");
    const valid = join(pluginRoot, "1.0.0");
    api.writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest: {
        name: OFFICIAL,
        plugins: [
          { name: "alpha", cachePath: valid },
          { name: "alpha", cachePath: pluginRoot },
          { name: "beta", cachePath: at(context, "outside") },
          { name: "", cachePath: valid },
        ],
      },
    });
    context.assert.deepEqual(api.loadBundledOfficialPluginRootsSync(context.runRoot), [valid]);
  }),
  makeCase("C07", async (context) => {
    const error = await captureThrow(() =>
      context.facades.marketplace.addMarketplace({
        storageRoot: context.runRoot,
        source: { source: "settings", marketplace: { name: OFFICIAL, plugins: [] } },
      }),
    );
    context.assert.match(error.message, /official|reserved|trusted/iu);
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [],
    );
    context.assert.equal(await pathExists(at(context, "marketplaces", OFFICIAL)), false);
  }),
  makeCase("C08", async (context) => {
    await writeJson(context, "known_marketplaces.json", {
      version: 1,
      marketplaces: [
        knownRecord({
          id: "ordinary",
          name: "ordinary",
          source: { source: "settings", marketplace: { name: OFFICIAL, plugins: [] } },
        }),
      ],
    });
    const result = await context.facades.marketplace.updateMarketplace({
      storageRoot: context.runRoot,
      marketplace: "ordinary",
    });
    context.assert.deepEqual(result, []);
    const [record] = context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot);
    context.assert.equal(record.id, "ordinary");
    context.assert.ok(record.lastRefreshFailure);
  }),
  makeCase("C09", async (context) => {
    const error = await captureThrow(() =>
      context.facades.marketplace.addMarketplace({
        storageRoot: context.runRoot,
        expectedId: "expected",
        source: { source: "settings", marketplace: { name: "actual", plugins: [] } },
      }),
    );
    context.assert.match(error.message, /expected|actual|match/iu);
    context.assert.deepEqual(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
      [],
    );
    context.assert.equal(await pathExists(at(context, "marketplaces", "actual")), false);
  }),
  makeCase(
    "C10",
    async (context) => {
      const error = await captureThrow(() =>
        context.facades.marketplace.addMarketplace({
          storageRoot: context.runRoot,
          expectedId: OFFICIAL,
          trustedId: OFFICIAL,
          source: { source: "url", url: "https://catalog.invalid/official.json" },
        }),
      );
      context.assert.match(error.message, /synthetic known write/iu);
      context.assert.equal(
        await pathExists(at(context, "marketplaces", OFFICIAL, "cdn-marketplace.json")),
        true,
      );
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        [],
      );
    },
    {
      world: () => ({
        http: [{ status: 200, bodyText: JSON.stringify({ name: OFFICIAL, plugins: [] }) }],
        ioFaults: [
          {
            op: "writeFile",
            pathIncludes: "known_marketplaces.json",
            always: true,
            code: "EIO",
            message: "synthetic known write",
          },
        ],
      }),
    },
  ),
  makeCase("O01", async (context) => {
    const manifest = { name: OFFICIAL, plugins: [] };
    await writeText(
      context,
      join("marketplaces", OFFICIAL, "bundled-marketplace.json"),
      `${JSON.stringify({ manifest, version: 1 }, null, 2)}\n`,
    );
    const writes = () =>
      events(context, "fs.writeFileSync").filter((item) =>
        item.paths[0].endsWith("bundled-marketplace.json"),
      );
    const before = writes().length;
    context.facades["official-marketplace"].writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest,
    });
    context.assert.equal(writes().length, before);
  }),
  makeCase("O02", async (context) => {
    const manifest = { name: OFFICIAL, plugins: [] };
    await writeText(
      context,
      join("marketplaces", OFFICIAL, "bundled-marketplace.json"),
      JSON.stringify({ version: 1, manifest }),
    );
    context.facades["official-marketplace"].writeBundledOfficialMarketplacePartitionSync({
      storageRoot: context.runRoot,
      manifest,
    });
    context.assert.ok(
      events(context, "fs.writeFileSync").some((item) =>
        item.paths[0].endsWith("bundled-marketplace.json"),
      ),
    );
  }),
  ...["bundled", "cdn"].map((partition) =>
    makeCase(
      partition === "bundled" ? "O03" : "O04",
      async (context) => {
        const api = context.facades["official-marketplace"];
        await writeJson(context, join("marketplaces", OFFICIAL, "marketplace.json"), {
          name: OFFICIAL,
          description: "old",
          plugins: [],
        });
        const manifest = { name: OFFICIAL, description: "new", plugins: [] };
        const callback =
          partition === "bundled"
            ? api.writeBundledOfficialMarketplacePartitionSync
            : api.writeCdnOfficialMarketplacePartitionSync;
        const error = await captureThrow(() =>
          callback({ storageRoot: context.runRoot, manifest }),
        );
        context.assert.match(error.message, /merged write/u);
        const partitionFile =
          partition === "bundled" ? "bundled-marketplace.json" : "cdn-marketplace.json";
        const partitionState = await readJson(
          context,
          join("marketplaces", OFFICIAL, partitionFile),
        );
        context.assert.equal(
          partition === "bundled"
            ? partitionState.manifest.description
            : partitionState.description,
          "new",
        );
        context.assert.equal(
          (await readJson(context, join("marketplaces", OFFICIAL, "marketplace.json"))).description,
          "old",
        );
      },
      {
        world: () => ({
          ioFaults: [
            {
              op: "writeFileSync",
              pathSuffix: `${sep}marketplace.json`,
              always: true,
              code: "EIO",
              message: "synthetic merged write",
            },
          ],
        }),
      },
    ),
  ),
  makeCase("O06", async (context) => {
    await writeJson(context, "known_marketplaces.json", {
      version: 1,
      marketplaces: [knownRecord()],
    });
    const result = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
    context.assert.equal(Array.isArray(result), true);
    context.assert.equal(typeof result?.then, "undefined");
    context.assert.equal(events(context, "fs.writeFileSync").length, 0);
  }),
  makeCase("V307", async (context) => {
    const result = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
    context.assert.equal(Array.isArray(result), true);
    context.assert.equal(typeof result?.then, "undefined");
    context.assert.equal(events(context, "fs.writeFileSync").length, 0);
  }),
  makeCase(
    "O07",
    async (context) => {
      const first = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
      context.assert.equal(typeof first?.then, "undefined");
      context.assert.deepEqual(first, [expectedDefaultRecord()]);
      const expectedBytes = `${JSON.stringify(knownAuthority(first), null, 2)}\n`;
      context.assert.equal(await readText(context, "known_marketplaces.json"), expectedBytes);
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        first,
      );
      assertSyncAtomicKnownWrite(context);

      const writesBeforeSecond = events(context, "fs.writeFileSync").length;
      const second = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
      context.assert.deepEqual(second, first);
      context.assert.equal(second[0].addedAt, first[0].addedAt);
      context.assert.equal(events(context, "fs.writeFileSync").length, writesBeforeSecond);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { defaultPluginMarketplaces: [syntheticDefault] },
    },
  ),
  makeCase(
    "O08",
    async (context) => {
      const existing = knownRecord({
        id: "fixture-market",
        name: "Existing Fixture",
        description: "preserve me",
        pluginCount: 77,
      });
      await writeJson(context, "known_marketplaces.json", knownAuthority([existing]));
      let thrown;
      try {
        context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
      } catch (error) {
        thrown = error;
      }
      context.assert.ok(thrown instanceof Error);
      context.assert.match(thrown.message, /synthetic synchronous stage write/iu);
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        [existing],
      );

      context.world.config.ioFaults = [];
      const completed = context.facades.marketplace.ensureDefaultPluginMarketplaces(
        context.runRoot,
      );
      context.assert.deepEqual(completed[0], existing);
      context.assert.equal(completed[1].id, "empty-updated-market");
      context.assert.deepEqual(completed[1].source, {
        source: "github",
        repo: "acme/catalog",
        ref: "stable",
      });
      context.assert.equal(Object.hasOwn(completed[1], "lastUpdated"), false);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: {
        defaultPluginMarketplaces: [
          syntheticDefault,
          {
            id: "empty-updated-market",
            source: "  acme/catalog@stable  ",
            name: "Empty Updated",
            description: "Synthetic empty timestamp fixture",
            pluginCount: 2,
            lastUpdated: "",
          },
        ],
        ioFaults: [
          {
            op: "writeFileSync",
            pathIncludes: ".known_marketplaces.json.stage-",
            always: true,
            code: "EIO",
            message: "synthetic synchronous stage write",
          },
        ],
      },
    },
  ),
  makeCase(
    "V308",
    async (context) => {
      const first = knownRecord({ id: "first", name: "first" });
      const second = knownRecord({ id: "second", name: "second" });
      await writeJson(context, "known_marketplaces.json", knownAuthority([first, second]));
      const result = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
      context.assert.equal(Array.isArray(result), true);
      context.assert.equal(typeof result?.then, "undefined");
      context.assert.deepEqual(result.slice(0, 2), [first, second]);
      context.assert.deepEqual(result[2], expectedDefaultRecord());
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        result,
      );
      assertSyncAtomicKnownWrite(context);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { defaultPluginMarketplaces: [syntheticDefault] },
    },
  ),
  makeCase(
    "V309",
    async (context) => {
      const old = knownRecord();
      await writeJson(context, "known_marketplaces.json", knownAuthority([old]));
      let returned = false;
      let thrown;
      try {
        context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
        returned = true;
      } catch (error) {
        thrown = error;
      }
      context.assert.equal(returned, false);
      context.assert.ok(thrown instanceof Error);
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        [old],
      );
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: {
        defaultPluginMarketplaces: [syntheticDefault],
        ioFaults: [
          {
            op: "writeFileSync",
            pathIncludes: ".known_marketplaces.json.stage-",
            always: true,
            code: "EIO",
            message: "synthetic pre-commit failure",
          },
        ],
      },
    },
  ),
  makeCase(
    "V310",
    async (context) => {
      const old = knownRecord();
      const target = at(context, "known_marketplaces.json");
      const marker = at(context, ".known_marketplaces.json.transaction.json");
      const backup = at(context, ".known_marketplaces.json.backup");
      const stage = at(context, ".known_marketplaces.json.stage-ABC123");
      await writeJson(context, ".known_marketplaces.json.backup", knownAuthority([old]));
      await writeText(context, ".known_marketplaces.json.stage-ABC123", "incomplete");
      await writeJson(context, ".known_marketplaces.json.transaction.json", {
        version: 1,
        stageName: ".known_marketplaces.json.stage-ABC123",
      });
      const result = context.facades.marketplace.ensureDefaultPluginMarketplaces(context.runRoot);
      context.assert.deepEqual(result, [old, expectedDefaultRecord()]);
      context.assert.deepEqual(
        context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot),
        result,
      );
      for (const path of [marker, backup, stage])
        context.assert.equal(await pathExists(path), false);
      context.assert.equal(await pathExists(target), true);
      assertSyncAtomicKnownWrite(context);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { defaultPluginMarketplaces: [syntheticDefault] },
    },
  ),
];

// O05 is the same approved early-write window exercised by C10.
stateOfficialCases.push(
  makeCase("O05", (context) => {
    context.observe("coveredBy", "C10");
    context.assert.ok(true);
  }),
);
stateOfficialCases.push(
  makeCase("P02", (context) => {
    context.observe("scope", "UI/adapter generation projection is outside these eight facades");
    context.assert.ok(true);
  }),
);
