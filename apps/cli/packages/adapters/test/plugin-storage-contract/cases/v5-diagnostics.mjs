// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { at, events, makeCase, writeJson, writeText } from "./util.mjs";

function pluginId(name = "alpha") {
  return `${name}@sample-market`;
}

async function prepare(context, label, manifestText, entryExtras = {}) {
  const storageRoot = at(context, `${label}-storage`);
  const pluginRoot = at(context, `${label}-plugin`);
  await mkdir(pluginRoot, { recursive: true });
  if (manifestText !== null) {
    await writeText(
      { ...context, runRoot: pluginRoot },
      join(".knorvia-plugin", "plugin.json"),
      manifestText,
    );
  }
  const entry = {
    name: "alpha",
    version: "1.0.0",
    source: { source: "directory", path: pluginRoot },
    ...entryExtras,
  };
  await writeJson(
    { ...context, runRoot: storageRoot },
    join("marketplaces", "sample-market", "marketplace.json"),
    {
      name: "sample-market",
      plugins: [entry],
    },
  );
  await writeJson({ ...context, runRoot: storageRoot }, "known_marketplaces.json", {
    version: 1,
    marketplaces: [
      {
        id: "sample-market",
        name: "sample-market",
        addedAt: "2025-01-01T00:00:00.000Z",
        pluginCount: 1,
        source: { source: "directory", path: at(context, `${label}-market-source`) },
      },
    ],
  });
  return { entry, pluginRoot, storageRoot };
}

async function markInstalled(context, prepared) {
  await writeJson({ ...context, runRoot: prepared.storageRoot }, "installed_plugins.json", {
    version: 1,
    plugins: [
      {
        id: pluginId(),
        name: "alpha",
        marketplace: "sample-market",
        version: "1.0.0",
        installPath: prepared.pluginRoot,
        installedAt: "2025-01-01T00:00:00.000Z",
        scope: "user",
      },
    ],
  });
}

async function validate(context, prepared) {
  return context.facades.marketplace.validateMarketplacePlugin({
    storageRoot: prepared.storageRoot,
    marketplace: "sample-market",
    name: "alpha",
  });
}

async function describe(context, prepared) {
  await markInstalled(context, prepared);
  return context.facades.marketplace.describeMarketplacePlugin({
    storageRoot: prepared.storageRoot,
    marketplace: "sample-market",
    name: "alpha",
  });
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function byCode(diagnostics, code) {
  return diagnostics.filter((item) => item.code === code);
}

export const v5DiagnosticCases = [
  makeCase("D501", async (context) => {
    context.world.config.pluginComponents = [
      { kind: "command", items: [{ name: "filesystem-command" }] },
    ];
    const prepared = await prepare(context, "d501", "{broken\n");
    const diagnostics = await validate(context, prepared);
    context.assert.equal(byCode(diagnostics, "plugin_manifest_invalid").length, 1);
    context.assert.equal(
      byCode(diagnostics, "plugin_manifest_invalid")[0].path,
      prepared.pluginRoot,
    );
    context.assert.equal(events(context, "mcp.loadDefinitions").length, 0);
    context.assert.equal(events(context, "mcp.resolveServers").length, 0);
    const described = await describe(context, prepared);
    context.assert.equal(byCode(described.diagnostics, "plugin_manifest_invalid").length, 0);
    context.assert.deepEqual(described.components, context.world.config.pluginComponents);
    context.assert.equal(events(context, "pluginComponents.enumerate").length, 1);
  }),
  makeCase("D502", async (context) => {
    context.world.config.pluginComponents = [
      { kind: "skill", items: [{ name: "filesystem-skill" }] },
    ];
    const prepared = await prepare(context, "d502", null, { strict: true });
    const diagnostics = await validate(context, prepared);
    context.assert.equal(byCode(diagnostics, "plugin_manifest_not_found").length, 1);
    context.assert.equal(
      byCode(diagnostics, "plugin_manifest_not_found")[0].path,
      prepared.pluginRoot,
    );
    context.assert.equal(events(context, "mcp.loadDefinitions").length, 0);
    context.assert.equal(events(context, "mcp.resolveServers").length, 0);
    const described = await describe(context, prepared);
    context.assert.equal(byCode(described.diagnostics, "plugin_manifest_not_found").length, 0);
    context.assert.deepEqual(described.components, context.world.config.pluginComponents);
  }),
  makeCase("D503", async (context) => {
    const prepared = await prepare(
      context,
      "d503",
      json({
        name: "different",
        version: "1.0.0",
        channels: false,
        lspServers: null,
        outputStyles: 0,
        settings: "",
      }),
    );
    const diagnostics = await validate(context, prepared);
    context.assert.equal(byCode(diagnostics, "plugin_manifest_invalid").length, 1);
    const unsupported = byCode(diagnostics, "plugin_unsupported_component");
    context.assert.equal(unsupported.length, 4);
    for (const key of ["channels", "lspServers", "outputStyles", "settings"]) {
      context.assert.equal(
        unsupported.some((item) => item.message.includes(key)),
        true,
      );
    }
    context.assert.equal(events(context, "mcp.loadDefinitions").length, 1);
    context.assert.equal(events(context, "mcp.resolveServers").length, 1);
    const described = await describe(context, prepared);
    context.assert.equal(byCode(described.diagnostics, "plugin_unsupported_component").length, 0);
  }),
  makeCase("D504", async (context) => {
    context.world.config.mcpDefinitions = {
      " server-one ": { command: "owned" },
      "   ": { command: "ignored" },
    };
    context.world.config.mcpLoadDiagnostics = [
      {
        code: "plugin_marketplace_source_unsupported",
        severity: "warning",
        message: "owned load diagnostic",
      },
    ];
    context.world.config.mcpResolveDiagnostics = [
      {
        code: "plugin_variable_missing",
        severity: "warning",
        message: "owned resolve diagnostic",
      },
    ];
    const prepared = await prepare(
      context,
      "d504",
      json({
        name: "alpha",
        version: "1.0.0",
        mcpServers: { " server-one ": { command: "owned" } },
      }),
    );
    const diagnostics = await validate(context, prepared);
    context.assert.equal(
      diagnostics.some((item) => item.message === "owned load diagnostic"),
      true,
    );
    context.assert.equal(
      diagnostics.some((item) => item.message === "owned resolve diagnostic"),
      true,
    );
    context.assert.equal(events(context, "mcp.loadDefinitions").length, 1);
    context.assert.equal(events(context, "mcp.resolveServers").length, 1);
    const resolvedEvent = events(context, "mcp.resolveServers")[0];
    context.assert.equal(resolvedEvent.workingDirectory, context.runRoot);

    const loadsBeforeDescribe = events(context, "mcp.loadDefinitions").length;
    const resolvesBeforeDescribe = events(context, "mcp.resolveServers").length;
    const described = await describe(context, prepared);
    context.assert.equal(events(context, "mcp.loadDefinitions").length, loadsBeforeDescribe + 1);
    context.assert.equal(events(context, "mcp.resolveServers").length, resolvesBeforeDescribe);
    context.assert.equal(
      described.diagnostics.some((item) => item.message === "owned load diagnostic"),
      true,
    );
    context.assert.deepEqual(
      described.components.flatMap((group) => group.items ?? []).map((item) => item.name),
      ["server-one"],
    );
  }),
  makeCase("D505", async (context) => {
    const prepared = await prepare(
      context,
      "d505",
      json({
        name: "alpha",
        userConfig: {
          token: { type: "string", required: true },
          optional: { type: "string", required: false },
          defaulted: { type: "string", required: true, default: "value" },
        },
      }),
    );
    const diagnostics = await validate(context, prepared);
    const missing = byCode(diagnostics, "plugin_variable_missing");
    context.assert.equal(missing.length, 1);
    context.assert.match(missing[0].message, /token/iu);
    const described = await describe(context, prepared);
    context.assert.equal(byCode(described.diagnostics, "plugin_variable_missing").length, 0);
  }),
  makeCase("D506", async (context) => {
    const prepared = await prepare(
      context,
      "d506",
      json({
        name: "alpha",
        mcpServers: ["UPPER.MCPB", ["bundle.mcpb", "extension.DXT"]],
      }),
    );
    const diagnostics = await validate(context, prepared);
    const unsupported = byCode(diagnostics, "plugin_marketplace_source_unsupported");
    context.assert.equal(unsupported.length, 1);
    const resolveCount = events(context, "mcp.resolveServers").length;
    const described = await describe(context, prepared);
    context.assert.equal(
      byCode(described.diagnostics, "plugin_marketplace_source_unsupported").length,
      0,
    );
    context.assert.equal(events(context, "mcp.resolveServers").length, resolveCount);
  }),
  makeCase("D507", async (context) => {
    const diagnostics = await context.facades.marketplace.validateMarketplaceSource({
      storageRoot: at(context, "d507-storage"),
      source: {
        source: "settings",
        marketplace: {
          name: "sample-market",
          plugins: [
            {
              name: "alpha",
              source: { source: "git", url: "git@example.invalid:alpha" },
              channels: false,
              lspServers: null,
              outputStyles: 0,
              settings: "",
              userConfig: { token: { required: true } },
              mcpServers: ["bundle.mcpb"],
            },
          ],
        },
      },
    });
    context.assert.equal(byCode(diagnostics, "plugin_validation_deferred").length, 1);
    context.assert.equal(byCode(diagnostics, "plugin_unsupported_component").length, 4);
    context.assert.equal(byCode(diagnostics, "plugin_variable_missing").length, 1);
    context.assert.equal(byCode(diagnostics, "plugin_marketplace_source_unsupported").length, 1);
    context.assert.equal(events(context, "mcp.loadDefinitions").length, 0);
    context.assert.equal(events(context, "mcp.resolveServers").length, 0);
    context.assert.equal(events(context, "process.execFile").length, 0);
  }),
];
