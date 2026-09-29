// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { at, captureThrow, events, makeCase, pathExists, writeJson, writeText } from "./util.mjs";

async function writeMarketplace(context, plugins, options = {}) {
  const market = options.market ?? "sample-market";
  const manifest = {
    name: market,
    plugins,
    ...(options.allowCross ? { allowCrossMarketplaceDependenciesOn: options.allowCross } : {}),
  };
  await writeJson(context, join("marketplaces", market, "marketplace.json"), manifest);
  return manifest;
}

async function writePlugin(context, relativeRoot, manifest, files = {}) {
  await writeJson(context, join(relativeRoot, ".knorvia-plugin", "plugin.json"), manifest);
  for (const [path, text] of Object.entries(files))
    await writeText(context, join(relativeRoot, path), text);
}

async function install(context, name, options = {}) {
  return context.facades.marketplace.installMarketplacePlugin({
    storageRoot: context.runRoot,
    marketplace: options.market ?? "sample-market",
    name,
    signal: options.signal,
    scope: options.scope,
    allowCrossMarketplaces: options.allowCrossMarketplaces,
  });
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

export const marketplaceSourceCases = [
  makeCase("D01", async (context) => {
    const parse = context.facades.marketplace.parseMarketplaceSourceInput;
    context.assert.deepEqual(await parse("https://catalog.invalid/marketplace.json"), {
      source: "url",
      url: "https://catalog.invalid/marketplace.json",
    });
    context.assert.deepEqual(await parse("https://github.com/acme/catalog#stable"), {
      source: "git",
      url: "https://github.com/acme/catalog.git",
      ref: "stable",
    });
    context.assert.deepEqual(await parse("git@example.invalid:team/catalog.git#v2"), {
      source: "git",
      url: "git@example.invalid:team/catalog.git",
      ref: "v2",
    });
    context.assert.deepEqual(await parse("acme/catalog@stable"), {
      source: "github",
      repo: "acme/catalog",
      ref: "stable",
    });
  }),
  makeCase(
    "D02",
    async (context) => {
      const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
        storageRoot: context.runRoot,
        source: { source: "github", repo: "acme/catalog", path: "catalog/custom.json" },
      });
      context.assert.deepEqual(
        diagnostics.filter((item) => item.severity === "error"),
        [],
      );
      context.assert.equal(await pathExists(at(context, "known_marketplaces.json")), false);
    },
    {
      world: {
        http: [{ status: 200, bodyText: "synthetic-archive" }],
        zip: {
          entries: [
            {
              fileName: "root/catalog/custom.json",
              externalFileAttributes: (0o100000 << 16) >>> 0,
              uncompressedSize: 37,
              chunks: [JSON.stringify({ name: "sample-market", plugins: [] })],
            },
          ],
        },
      },
    },
  ),
  makeCase(
    "D03",
    async (context) => {
      const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
        storageRoot: context.runRoot,
        source: {
          source: "github",
          repo: "acme/catalog",
          sparsePaths: ["catalog", "plugins/alpha"],
        },
      });
      context.assert.deepEqual(
        diagnostics.filter((item) => item.severity === "error"),
        [],
      );
      const commands = events(context, "process.execFile");
      context.assert.deepEqual(commands[0].args.slice(0, -1), [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "https://github.com/acme/catalog.git",
      ]);
      const sparse = commands.find(
        (item) => item.args.includes("sparse-checkout") && item.args.includes("set"),
      );
      context.assert.deepEqual(sparse.args.slice(0, 3), [
        "-C",
        commands[0].args.at(-1),
        "sparse-checkout",
      ]);
      context.assert.deepEqual(sparse.args.slice(-2), ["catalog", "plugins/alpha"]);
      context.assert.equal(events(context, "http.request").length, 0);
    },
    {
      world: {
        git: [
          {
            files: [
              {
                path: "$DEST/marketplace.json",
                text: `${JSON.stringify({ name: "sample-market", plugins: [] }, null, 2)}\n`,
              },
            ],
          },
          {},
          {},
        ],
      },
    },
  ),
  makeCase("D04", async (context) => {
    await writeMarketplace(context, [
      { name: "alpha", version: "1.0.0", source: "./plugin-src", strict: false },
    ]);
    await mkdir(at(context, "marketplaces", "sample-market", "plugin-src"), { recursive: true });
    const result = await install(context, "alpha");
    context.assert.deepEqual(result.closure, ["alpha@sample-market"]);

    const secondRoot = at(context, "second-storage");
    const second = { ...context, runRoot: secondRoot };
    await writeMarketplace(second, [
      { name: "beta", version: "1.0.0", source: "cwd-plugin", strict: false },
    ]);
    await mkdir(at(context, "cwd", "cwd-plugin"), { recursive: true });
    const originalCwd = process.cwd();
    try {
      process.chdir(at(context, "cwd"));
      const secondResult = await context.facades.marketplace.installMarketplacePlugin({
        storageRoot: secondRoot,
        marketplace: "sample-market",
        name: "beta",
      });
      context.assert.equal(secondResult.installed[0].name, "beta");
    } finally {
      process.chdir(originalCwd);
    }
  }),
  makeCase("D05", async (context) => {
    await writeMarketplace(context, [
      {
        name: "alpha",
        version: "1.0.0",
        source: { source: "directory", path: " " },
        strict: false,
      },
    ]);
    await mkdir(at(context, "marketplaces", "sample-market", "alpha"), { recursive: true });
    const error = await captureThrow(() => install(context, "alpha"));
    context.assert.match(error.message, /directory|path|non-empty|invalid/iu);
    context.assert.deepEqual(
      context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
      [],
    );
  }),
  makeCase("D06", async (context) => {
    await writeMarketplace(context, [{ name: "alpha", version: "1.0.0", strict: false }]);
    await mkdir(at(context, "marketplaces", "sample-market", "alpha"), { recursive: true });
    const result = await install(context, "alpha");
    context.assert.equal(result.installed[0].name, "alpha");
  }),
  makeCase("D07", async (context) => {
    const cached = at(context, "precache", "alpha");
    await writePlugin(context, join("precache", "alpha"), { name: "alpha", version: "2.0.0" });
    await writeMarketplace(context, [
      { name: "alpha", version: "1.0.0", source: "filesystem", cachePath: cached },
    ]);
    const result = await install(context, "alpha");
    context.assert.equal(result.installed[0].version, "2.0.0");

    const seaRoot = at(context, "sea-storage");
    const sea = { ...context, runRoot: seaRoot };
    const computed = join(seaRoot, "cache", "sample-market", "beta", "3.0.0");
    await writePlugin(sea, join("cache", "sample-market", "beta", "3.0.0"), {
      name: "beta",
      version: "3.0.0",
    });
    await writeMarketplace(sea, [
      {
        name: "beta",
        version: "3.0.0",
        source: "sea",
        cachePath: join(seaRoot, "missing-cache"),
      },
    ]);
    const seaResult = await context.facades.marketplace.installMarketplacePlugin({
      storageRoot: seaRoot,
      marketplace: "sample-market",
      name: "beta",
    });
    context.assert.equal(seaResult.installed[0].installPath, computed);
  }),
  makeCase("D08", async (context) => {
    const target = at(context, "cache", "sample-market", "alpha", "1.0.0");
    await mkdir(target, { recursive: true });
    await writeMarketplace(context, [
      {
        name: "alpha",
        version: "1.0.0",
        source: { source: "directory", path: target },
        strict: false,
      },
    ]);
    const result = await install(context, "alpha");
    context.assert.equal(result.installed[0].installPath, target);
    context.assert.equal(await pathExists(join(target, ".claude-plugin", "plugin.json")), true);
    context.assert.equal(
      context.world.events.some(
        (item) =>
          item.kind.startsWith("fs.") &&
          item.paths?.some((path) => path.endsWith(".1.0.0.transaction.json")),
      ),
      false,
    );
  }),
  makeCase(
    "D09",
    async (context) => {
      const readPin = context.facades.marketplace.readPluginSourceIdentityPin;
      context.assert.equal(
        readPin({
          source: "url",
          type: "zip",
          url: "https://download.invalid/a.zip",
          sha256: "zip-pin",
          sha: "sha-pin",
          commit: "commit-pin",
        }),
        "zip-pin",
      );
      context.assert.equal(
        readPin({ source: "github", repo: "acme/alpha", sha: "sha-pin", commit: "commit-pin" }),
        "sha-pin",
      );
      context.assert.equal(
        readPin({ source: "github", repo: "acme/alpha", commit: "commit-pin", ref: "stable" }),
        "commit-pin",
      );

      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "github", repo: "acme/alpha", commit: "commit-pin", ref: "stable" },
        },
      ]);
      await install(context, "alpha");
      const requestUrl = events(context, "http.request")[0].request.url;
      context.assert.match(requestUrl, /commit-pin/u);
      context.assert.doesNotMatch(requestUrl, /stable/u);
      context.assert.equal(events(context, "process.execFile").length, 0);
    },
    {
      world: {
        http: [{ status: 200, bodyText: "synthetic-archive" }],
        zip: {
          entries: [
            {
              fileName: "repo-root/.knorvia-plugin/plugin.json",
              externalFileAttributes: (0o100000 << 16) >>> 0,
              uncompressedSize: 36,
              chunks: [`${JSON.stringify({ name: "alpha", version: "1.0.0" }, null, 2)}\n`],
            },
          ],
        },
      },
    },
  ),
  makeCase(
    "D10",
    async (context) => {
      const source = {
        source: "git",
        url: "git@example.invalid:repo",
        sha: "",
        commit: "commit-pin",
        ref: "stable",
      };
      context.assert.equal(context.facades.marketplace.readPluginSourceIdentityPin(source), "");
      await writeMarketplace(context, [{ name: "alpha", version: "1.0.0", source }]);
      await install(context, "alpha");
      const commands = events(context, "process.execFile");
      const clone = commands.find((item) => item.args.includes("clone"));
      context.assert.ok(clone.args.includes("--depth"));
      context.assert.ok(clone.args.includes("stable"));
      context.assert.equal(
        commands.some((item) => item.args.includes("checkout")),
        false,
      );
    },
    { world: { git: [gitSuccessManifest()] } },
  ),
  makeCase(
    "D11",
    async (context) => {
      const direct = await context.facades["zip-source"].resolveHttpZipSource({
        url: "https://download.invalid/a.zip",
        path: "root/plugin",
        stripRoot: false,
      });
      context.assert.equal(direct.path.endsWith(join("root", "plugin")), true);
      await direct.cleanup();
    },
    {
      world: {
        http: [{ status: 200, bodyText: "zip" }],
        zip: {
          entries: [
            {
              fileName: "root/plugin/a.txt",
              externalFileAttributes: (0o100000 << 16) >>> 0,
              uncompressedSize: 1,
              chunks: ["a"],
            },
          ],
        },
      },
    },
  ),
  makeCase("D12", async (context) => {
    const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
      storageRoot: context.runRoot,
      source: {
        source: "settings",
        marketplace: {
          name: "sample-market",
          plugins: [{ name: "alpha", source: { source: "github", repo: "acme/alpha" } }],
        },
      },
    });
    context.assert.ok(diagnostics.some((item) => item.code === "plugin_validation_deferred"));
    context.assert.equal(events(context, "http.request").length, 0);
    context.assert.equal(events(context, "process.execFile").length, 0);
    context.assert.equal(await pathExists(at(context, "known_marketplaces.json")), false);
  }),
  makeCase("D13", async (context) => {
    await writeJson(context, join("local", "marketplace.json"), {
      name: "local-market",
      plugins: [],
    });
    await writeText(context, join("local", ".knorvia-plugin", "plugin.json"), "{broken");
    const diagnostics = await context.facades.marketplace.validateLocalPluginPath({
      storageRoot: context.runRoot,
      path: at(context, "local"),
    });
    context.assert.deepEqual(
      diagnostics.filter((item) => item.severity === "error"),
      [],
    );
    context.assert.equal(await pathExists(at(context, "known_marketplaces.json")), false);
  }),
  makeCase("D14", async (context) => {
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
            marketplace: {
              name: "sample-market",
              plugins: [{ name: "alpha", version: "1.0.0", strict: false }],
            },
          },
        },
      ],
    });
    const diagnostics = await context.facades.marketplace.validateMarketplacePlugin({
      storageRoot: context.runRoot,
      marketplace: "sample-market",
      name: "alpha",
    });
    context.assert.ok(Array.isArray(diagnostics));
    context.assert.equal(
      await pathExists(at(context, "marketplaces", "sample-market", "marketplace.json")),
      true,
    );
    context.assert.ok(
      context.facades.marketplace.loadKnownMarketplacesSync(context.runRoot)[0].lastUpdated,
    );

    const describeRoot = at(context, "describe-storage");
    const describeContext = { ...context, runRoot: describeRoot };
    await writeJson(describeContext, "known_marketplaces.json", {
      version: 1,
      marketplaces: [
        {
          id: "sample-market",
          name: "sample-market",
          addedAt: "2025-01-01T00:00:00.000Z",
          pluginCount: 1,
          source: {
            source: "settings",
            marketplace: {
              name: "sample-market",
              plugins: [{ name: "beta", version: "1.0.0", strict: false }],
            },
          },
        },
      ],
    });
    const described = await context.facades.marketplace.describeMarketplacePlugin({
      storageRoot: describeRoot,
      marketplace: "sample-market",
      name: "beta",
    });
    context.assert.ok(Array.isArray(described.components));
    context.assert.ok(Array.isArray(described.diagnostics));
    context.assert.equal(
      await pathExists(join(describeRoot, "marketplaces", "sample-market", "marketplace.json")),
      true,
    );
    context.assert.ok(
      context.facades.marketplace.loadKnownMarketplacesSync(describeRoot)[0].lastUpdated,
    );
  }),
  makeCase("D15", async (context) => {
    const installedRoot = at(context, "installed", "alpha");
    await writePlugin(context, join("installed", "alpha"), { name: "alpha", version: "1.0.0" });
    await writeJson(context, "installed_plugins.json", {
      version: 1,
      plugins: [
        {
          id: "alpha@sample-market",
          name: "alpha",
          marketplace: "sample-market",
          version: "1.0.0",
          installPath: installedRoot,
          installedAt: "2025-01-01T00:00:00.000Z",
          scope: "user",
        },
      ],
    });
    await writeJson(context, "known_marketplaces.json", {
      version: 1,
      marketplaces: [
        {
          id: "sample-market",
          name: "sample-market",
          addedAt: "2025-01-01T00:00:00.000Z",
          pluginCount: 1,
          source: { source: "url", url: "https://catalog.invalid/marketplace.json" },
        },
      ],
    });
    const result = await context.facades.marketplace.describeMarketplacePlugin({
      storageRoot: context.runRoot,
      marketplace: "sample-market",
      name: "alpha",
    });
    context.assert.ok(Array.isArray(result.components));
    context.assert.equal(events(context, "pluginComponents.enumerate").length, 1);
    context.assert.equal(events(context, "http.request").length, 0);
  }),
  makeCase(
    "S01",
    async (context) => {
      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "github", repo: " acme/plugin ", path: 7, ref: false },
        },
      ]);
      const result = await install(context, "alpha");
      context.assert.equal(result.installed[0].name, "alpha");
      const clone = events(context, "process.execFile").find((item) => item.args.includes("clone"));
      context.assert.ok(clone.args.includes("https://github.com/ acme/plugin .git"));
    },
    { world: { git: [gitSuccessManifest()] } },
  ),
  makeCase("S02", async (context) => {
    const sources = [
      { source: "git", url: " " },
      { source: "git-subdir", url: "https://git.invalid/r", path: " " },
      { source: "url", url: " " },
    ];
    for (let index = 0; index < sources.length; index += 1) {
      const storageRoot = at(context, `s${index}`);
      const nested = { ...context, runRoot: storageRoot };
      await writeMarketplace(nested, [{ name: "alpha", source: sources[index] }]);
      const error = await captureThrow(() =>
        context.facades.marketplace.installMarketplacePlugin({
          storageRoot,
          marketplace: "sample-market",
          name: "alpha",
        }),
      );
      context.assert.match(error.message, /required|non-empty|url|path/iu);
    }
  }),
  makeCase(
    "S03",
    async (context) => {
      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "url", url: "git@example.invalid:repo", type: 7, path: 9 },
        },
      ]);
      const result = await install(context, "alpha");
      context.assert.equal(result.installed[0].name, "alpha");
      const clone = events(context, "process.execFile").find((item) => item.args.includes("clone"));
      context.assert.ok(clone.args.includes("git@example.invalid:repo"));
    },
    { world: { git: [gitSuccessManifest()] } },
  ),
  makeCase("S04", async (context) => {
    for (const [field, value] of [
      ["path", 9],
      ["stripRoot", "false"],
      ["headers", []],
    ]) {
      const storageRoot = at(context, `zip-${field}`);
      const nested = { ...context, runRoot: storageRoot };
      const source = {
        source: "url",
        type: "zip",
        url: "https://download.invalid/a.zip",
        sha256: "a".repeat(64),
        [field]: value,
      };
      await writeMarketplace(nested, [{ name: "alpha", source }]);
      const error = await captureThrow(() =>
        context.facades.marketplace.installMarketplacePlugin({
          storageRoot,
          marketplace: "sample-market",
          name: "alpha",
        }),
      );
      context.assert.match(error.message, new RegExp(field, "iu"));
    }
    const storageRoot = at(context, "zip-header-value");
    const nested = { ...context, runRoot: storageRoot };
    await writeMarketplace(nested, [
      {
        name: "alpha",
        source: {
          source: "url",
          type: "zip",
          url: "https://download.invalid/a.zip",
          sha256: "a".repeat(64),
          headers: { X: 1 },
        },
      },
    ]);
    const error = await captureThrow(() =>
      context.facades.marketplace.installMarketplacePlugin({
        storageRoot,
        marketplace: "sample-market",
        name: "alpha",
      }),
    );
    context.assert.match(error.message, /header/iu);
  }),
  makeCase("S05", async (context) => {
    await writeMarketplace(context, [{ name: "alpha", source: { source: "unknown" } }]);
    await mkdir(at(context, "marketplaces", "sample-market", "alpha"), { recursive: true });
    const error = await captureThrow(() => install(context, "alpha"));
    context.assert.match(error.message, /unsupported|invalid|source/iu);
  }),
  makeCase("S06", async (context) => {
    for (const [index, source] of [undefined, null, 7, []].entries()) {
      const storageRoot = at(context, `fallback-${index}`);
      const nested = { ...context, runRoot: storageRoot };
      await writeMarketplace(nested, [{ name: "alpha", version: "1.0.0", source, strict: false }]);
      await mkdir(join(storageRoot, "marketplaces", "sample-market", "alpha"), { recursive: true });
      const result = await context.facades.marketplace.installMarketplacePlugin({
        storageRoot,
        marketplace: "sample-market",
        name: "alpha",
      });
      context.assert.equal(result.installed[0].name, "alpha");
    }
  }),
  makeCase("S07", async (context) => {
    await writeMarketplace(context, [{ name: "alpha", version: "entry-version", source: "" }]);
    await writePlugin(context, join("marketplaces", "sample-market"), {
      name: "alpha",
      version: "base-version",
    });
    const result = await install(context, "alpha");
    context.assert.equal(result.installed[0].version, "base-version");
  }),
  makeCase(
    "S11",
    async (context) => {
      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: {
            source: "git",
            url: "git@example.invalid:r",
            commit: "commit-pin",
            ref: "stable",
          },
        },
      ]);
      await install(context, "alpha");
      const commands = events(context, "process.execFile");
      const clone = commands.find((item) => item.args.includes("clone"));
      context.assert.equal(clone.args.includes("--depth"), false);
      context.assert.ok(clone.args.includes("stable"));
      context.assert.ok(
        commands.some((item) => item.args.includes("checkout") && item.args.includes("commit-pin")),
      );
    },
    { world: { git: [{}, gitSuccessManifest(), {}] } },
  ),
  makeCase("S12", async (context) => {
    context.assert.deepEqual(
      await context.facades.marketplace.parseMarketplaceSourceInput(
        "https://github.com/acme/catalog",
      ),
      {
        source: "git",
        url: "https://github.com/acme/catalog.git",
      },
    );
  }),
  makeCase("S13", async (context) => {
    context.assert.deepEqual(
      await context.facades.marketplace.parseMarketplaceSourceInput(
        "https://github.com/acme/catalog/tree/main",
      ),
      {
        source: "git",
        url: "https://github.com/acme/catalog/tree/main.git",
      },
    );
  }),
  makeCase("S14", async (context) => {
    context.assert.deepEqual(
      await context.facades.marketplace.parseMarketplaceSourceInput(
        "https://catalog.invalid/marketplace.json#discarded",
      ),
      {
        source: "url",
        url: "https://catalog.invalid/marketplace.json",
      },
    );
  }),
  makeCase("S15", async (context) => {
    context.assert.deepEqual(
      await context.facades.marketplace.parseMarketplaceSourceInput(
        "git@example.invalid:team/catalog.git#stable",
      ),
      {
        source: "git",
        url: "git@example.invalid:team/catalog.git",
        ref: "stable",
      },
    );
    context.assert.deepEqual(
      await context.facades.marketplace.parseMarketplaceSourceInput("acme/catalog@stable"),
      {
        source: "github",
        repo: "acme/catalog",
        ref: "stable",
      },
    );
  }),
  makeCase(
    "S16",
    async (context) => {
      await mkdir(at(context, "home", "catalog"), { recursive: true });
      context.world.config.env.HOME = at(context, "home");
      const source = await context.facades.marketplace.parseMarketplaceSourceInput("~/catalog");
      context.assert.equal(source.source, "directory");
      context.assert.equal(source.path, at(context, "home", "catalog"));
    },
    { world: ({ runRoot }) => ({ env: { HOME: join(runRoot, "home") } }) },
  ),
  makeCase(
    "S17",
    async (context) => {
      const target = at(context, "cache", "sample-market", "alpha", "1.0.0");
      await mkdir(target, { recursive: true });
      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "directory", path: target },
          strict: false,
        },
      ]);
      await captureThrow(() => install(context, "alpha"));
      context.assert.deepEqual(
        context.facades.marketplace.listInstalledPluginRecords(context.runRoot),
        [],
      );
      context.observe(
        "manifestRemains",
        await pathExists(join(target, ".knorvia-plugin", "plugin.json")),
      );
    },
    {
      policy: "known-gap",
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
    "P04",
    async (context) => {
      const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
        storageRoot: context.runRoot,
        source: { source: "url", url: "https://catalog.invalid/marketplace.json" },
      });
      context.assert.deepEqual(
        diagnostics.filter((item) => item.severity === "error"),
        [],
      );
      const request = events(context, "http.request")[0].request;
      const adapterOptions =
        events(context, "http.adapter.construct").at(-1)?.options ??
        events(context, "http.createWebFetchAdapter").at(-1)?.options ??
        {};
      context.assert.equal(request.timeoutMs ?? adapterOptions.timeoutMs, 180000);
      context.assert.equal(
        request.maxResponseBytes ?? adapterOptions.maxResponseBytes,
        10 * 1024 * 1024,
      );
      context.assert.equal(request.redirect, "manual");
    },
    {
      world: {
        http: [{ status: 200, bodyText: JSON.stringify({ name: "sample-market", plugins: [] }) }],
      },
    },
  ),
  makeCase(
    "N04",
    async (context) => {
      await writeMarketplace(context, [
        {
          name: "alpha",
          version: "1.0.0",
          source: { source: "git", url: "git@example.invalid:repo" },
        },
      ]);
      await install(context, "alpha");
      const sanitize = events(context, "shared.sanitizeRuntimeEnv");
      const network = events(context, "network.applyEgressEnv");
      context.assert.equal(sanitize.length, 1);
      context.assert.equal(network.length, 1);
      context.assert.ok(sanitize[0].index < network[0].index);
      context.assert.deepEqual(network[0].options.sourceEnv, {
        HTTP_PROXY: "http://proxy.invalid",
        KNORVIA_GIT_BINARY: "git",
        OMITTED: "<undefined>",
      });
      context.assert.deepEqual(network[0].envKeys, ["HTTP_PROXY", "KNORVIA_GIT_BINARY"]);
    },
    {
      world: {
        env: {
          HTTP_PROXY: "http://proxy.invalid",
          KNORVIA_GIT_BINARY: "git",
          OMITTED: undefined,
        },
        git: [gitSuccessManifest()],
      },
    },
  ),
];
