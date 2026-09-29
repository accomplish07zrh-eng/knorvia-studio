// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { join } from "node:path";
import { at, captureThrow, makeCase, writeJson } from "./util.mjs";

async function loadFixture(context, suffix, value) {
  const storageRoot = at(context, `manifest-${suffix}`);
  await writeJson(
    { ...context, runRoot: storageRoot },
    join("marketplaces", "fixture-market", "marketplace.json"),
    value,
  );
  return context.facades.marketplace.loadMarketplaceManifestSync(storageRoot, "fixture-market");
}

function base(overrides = {}) {
  return { name: "fixture-market", plugins: [], ...overrides };
}

export const manifestDecoderCases = [
  makeCase("M01", async (context) => {
    const manifest = await loadFixture(context, "trim-name", base({ name: "  fixture-market  " }));
    context.assert.equal(manifest.name, "fixture-market");
  }),
  makeCase(
    "M02",
    async (context) => {
      for (const [suffix, name] of [
        ["uppercase", "Fixture-Market"],
        ["punctuation", "-bad"],
        ["too-long", "a".repeat(129)],
      ]) {
        context.assert.equal(await loadFixture(context, suffix, base({ name })), null);
      }
      const error = await captureThrow(() =>
        context.facades.marketplace.addMarketplace({
          storageRoot: at(context, "manifest-required"),
          source: { source: "settings", marketplace: base({ name: "Fixture-Market" }) },
        }),
      );
      context.assert.match(error.message, /Marketplace manifest is invalid/u);
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase("M03", async (context) => {
    const manifest = await loadFixture(
      context,
      "top-description",
      base({
        description: " top ",
        metadata: { description: "nested" },
      }),
    );
    context.assert.equal(manifest.description, " top ");
  }),
  makeCase("M04", async (context) => {
    const manifest = await loadFixture(
      context,
      "metadata",
      base({
        metadata: { description: " nested ", pluginRoot: " packages " },
      }),
    );
    context.assert.equal(manifest.description, " nested ");
    context.assert.equal(manifest.pluginRoot, " packages ");
  }),
  makeCase("M05", async (context) => {
    const manifest = await loadFixture(
      context,
      "top-plugin-root",
      base({ pluginRoot: "packages" }),
    );
    context.assert.equal(Object.hasOwn(manifest, "pluginRoot"), false);
  }),
  makeCase("M06", async (context) => {
    const manifest = await loadFixture(
      context,
      "allow-cross",
      base({
        allowCrossMarketplaceDependenciesOn: ["other", "", "other", 3],
        metadata: { allowCrossMarketplaceDependenciesOn: ["ignored"] },
      }),
    );
    context.assert.deepEqual(manifest.allowCrossMarketplaceDependenciesOn, ["other", "", "other"]);
  }),
  makeCase("M07", async (context) => {
    const manifest = await loadFixture(
      context,
      "featured",
      base({
        featured: [" featured ", "   ", "", 4],
      }),
    );
    context.assert.deepEqual(manifest.featured, [" featured "]);
  }),
  makeCase("M08", async (context) => {
    const manifest = await loadFixture(
      context,
      "map-own-name",
      base({
        plugins: { "from-key": { name: " override ", version: " 1.0 " } },
      }),
    );
    context.assert.equal(manifest.plugins[0].name, "override");
    context.assert.equal(manifest.plugins[0].version, " 1.0 ");
  }),
  makeCase("M09", async (context) => {
    const manifest = await loadFixture(
      context,
      "map-primitive",
      base({ plugins: { "name-only": 7 } }),
    );
    context.assert.equal(manifest.plugins.length, 1);
    context.assert.equal(manifest.plugins[0].name, "name-only");
  }),
  makeCase("M10", async (context) => {
    const manifest = await loadFixture(
      context,
      "array-filter",
      base({
        plugins: [7, { name: "   " }, { name: " valid " }],
      }),
    );
    context.assert.deepEqual(
      manifest.plugins.map((entry) => entry.name),
      ["valid"],
    );
  }),
  makeCase("M11", async (context) => {
    const manifest = await loadFixture(
      context,
      "entry-scalars",
      base({
        plugins: [
          {
            name: "entry",
            description: " ",
            version: " 1.0 ",
            cachePath: "",
            category: " cat ",
          },
          {
            name: "invalid-optionals",
            description: 1,
            version: false,
            cachePath: null,
            category: [],
          },
        ],
      }),
    );
    context.assert.deepEqual(
      {
        description: manifest.plugins[0].description,
        version: manifest.plugins[0].version,
        cachePath: manifest.plugins[0].cachePath,
        category: manifest.plugins[0].category,
      },
      { description: " ", version: " 1.0 ", cachePath: "", category: " cat " },
    );
    for (const field of ["description", "version", "cachePath", "category"]) {
      context.assert.equal(Object.hasOwn(manifest.plugins[1], field), false);
    }
  }),
  makeCase("M12", async (context) => {
    const manifest = await loadFixture(
      context,
      "entry-arrays",
      base({
        plugins: [
          {
            name: "entry",
            tags: ["", " padded ", "", 3],
            dependencies: [
              "dep@^1.2.3",
              " lead@^2",
              { name: " child ", marketplace: " other " },
              { name: " " },
              9,
            ],
          },
          { name: "empty-arrays", tags: [1], dependencies: [null] },
        ],
      }),
    );
    context.assert.deepEqual(manifest.plugins[0].tags, ["", " padded ", ""]);
    context.assert.deepEqual(manifest.plugins[0].dependencies, ["dep", " lead", "child@other"]);
    context.assert.deepEqual(manifest.plugins[1].tags, []);
    context.assert.deepEqual(manifest.plugins[1].dependencies, []);
  }),
  makeCase("M13", async (context) => {
    const manifest = await loadFixture(
      context,
      "strict",
      base({
        plugins: [
          { name: "false", strict: false },
          { name: "true", strict: true },
          { name: "string", strict: "false" },
        ],
      }),
    );
    context.assert.equal(manifest.plugins[0].strict, false);
    context.assert.equal(manifest.plugins[1].strict, true);
    context.assert.equal(Object.hasOwn(manifest.plugins[2], "strict"), false);
  }),
  makeCase("M14", async (context) => {
    const manifest = await loadFixture(
      context,
      "source",
      base({ plugins: [{ name: "null-source", source: null }, { name: "missing-source" }] }),
    );
    context.assert.equal(manifest.plugins[0].source, null);
    context.assert.equal(Object.hasOwn(manifest.plugins[1], "source"), false);
  }),
  makeCase(
    "M15",
    async (context) => {
      const invalid = await loadFixture(context, "external-raw-name", {
        name: "Fixture-Market",
        plugins: [],
        raw: { sentinel: true },
      });
      context.assert.equal(invalid, null);

      const filtered = await loadFixture(context, "external-raw-fields", {
        name: "fixture-market",
        plugins: [
          { name: " valid ", strict: "false", tags: [1], dependencies: "bad", source: null },
        ],
        raw: { sentinel: true },
      });
      context.assert.equal(filtered.plugins[0].name, "valid");
      context.assert.equal(Object.hasOwn(filtered.plugins[0], "strict"), false);
      context.assert.deepEqual(filtered.plugins[0].tags, []);
      context.assert.equal(Object.hasOwn(filtered.plugins[0], "dependencies"), false);
      context.assert.equal(filtered.plugins[0].source, null);
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase("M16", async (context) => {
    const normalized = {
      name: "internal-market",
      plugins: [{ name: "alpha", raw: { name: "alpha" } }],
      raw: { name: "internal-market", plugins: [{ name: "alpha" }] },
    };
    const record = await context.facades.marketplace.addMarketplace({
      storageRoot: at(context, "internal-settings"),
      source: { source: "settings", marketplace: normalized },
    });
    context.assert.equal(record.id, "internal-market");
    context.assert.equal(record.pluginCount, 1);
  }),
];
