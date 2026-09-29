// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { at, captureThrow, makeCase, pathExists, readText, writeJson, writeText } from "./util.mjs";

const ZIP_BODY = Buffer.from("v5-install-manifest-archive");
const ZIP_HASH = createHash("sha256").update(ZIP_BODY).digest("hex");

function zipFile(fileName, text) {
  return {
    fileName,
    externalFileAttributes: (0o100000 << 16) >>> 0,
    uncompressedSize: Buffer.byteLength(text),
    chunks: [text],
  };
}

function entry(name, source, extras = {}) {
  return { name, source, ...extras };
}

async function writeMarket(context, storageRoot, plugin) {
  await writeJson(
    { ...context, runRoot: storageRoot },
    join("marketplaces", "sample-market", "marketplace.json"),
    {
      name: "sample-market",
      plugins: [plugin],
    },
  );
}

async function install(context, storageRoot, name = "alpha") {
  return context.facades.marketplace.installMarketplacePlugin({
    storageRoot,
    marketplace: "sample-market",
    name,
  });
}

async function directoryInstall(context, label, plugin, manifestPath, manifestText) {
  const storageRoot = at(context, `${label}-directory-storage`);
  const sourceRoot = at(context, `${label}-directory-source`);
  await mkdir(sourceRoot, { recursive: true });
  if (manifestPath)
    await writeText({ ...context, runRoot: sourceRoot }, manifestPath, manifestText);
  await writeText({ ...context, runRoot: sourceRoot }, "payload.txt", `${label}\n`);
  await writeMarket(context, storageRoot, {
    ...plugin,
    source: { source: "directory", path: sourceRoot },
  });
  const result = await install(context, storageRoot, plugin.name.trim());
  return { result, sourceRoot, storageRoot, target: result.installed[0].installPath };
}

async function zipInstall(context, label, plugin, manifestPath, manifestText) {
  const storageRoot = at(context, `${label}-zip-storage`);
  const url = `https://download.invalid/${label}.zip`;
  const entries = [zipFile("repo-root/payload.txt", `${label}\n`)];
  if (manifestPath)
    entries.push(zipFile(`repo-root/${manifestPath.replaceAll("\\", "/")}`, manifestText));
  context.world.config.zip = { entries };
  context.world.scripts.http.push({ status: 200, url, bodyBase64: ZIP_BODY.toString("base64") });
  await writeMarket(context, storageRoot, {
    ...plugin,
    source: { source: "url", type: "zip", url, sha256: ZIP_HASH },
  });
  return install(context, storageRoot, plugin.name.trim());
}

function pluginJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const manifestPath = join(".knorvia-plugin", "plugin.json");

export const v5InstallManifestCases = [
  makeCase("I501", async (context) => {
    const local = await directoryInstall(context, "i501", entry("alpha", undefined), null, null);
    context.assert.equal(
      await pathExists(join(local.target, ".knorvia-plugin", "plugin.json")),
      false,
    );
    context.assert.equal(
      await pathExists(join(local.target, ".claude-plugin", "plugin.json")),
      false,
    );
    const error = await captureThrow(() =>
      zipInstall(context, "i501", entry("alpha", undefined), null, null),
    );
    context.assert.match(error.message, /Plugin manifest not found: alpha@sample-market/u);
  }),
  makeCase("I502", async (context) => {
    const rawEntry = {
      name: " alpha ",
      version: "7.8.9",
      description: "kept",
      source: { source: "directory", path: "replaced-by-helper" },
      category: "tooling",
      tags: ["tag"],
      strict: false,
      displayName: "Store name",
      displayName_i18n: { zh: "商店名" },
      description_i18n: { zh: "说明" },
      icon: "icon.png",
      privacyPolicy: "privacy",
      termsOfService: "terms",
      heroImage: "hero.png",
      examplePrompts: ["prompt"],
      examplePrompts_i18n: { zh: ["提示"] },
      requiresPaidPlan: true,
      commands: ["./commands"],
      customPluginField: { preserved: true },
    };
    const expected = {
      name: "alpha",
      version: "7.8.9",
      description: "kept",
      commands: ["./commands"],
      customPluginField: { preserved: true },
    };
    const local = await directoryInstall(context, "i502", rawEntry, null, null);
    const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, join(".claude-plugin", "plugin.json")),
      expectedText,
    );

    const zipped = await zipInstall(context, "i502", rawEntry, null, null);
    context.assert.equal(
      await readText(
        { ...context, runRoot: zipped.installed[0].installPath },
        join(".claude-plugin", "plugin.json"),
      ),
      expectedText,
    );
  }),
  makeCase("I503", async (context) => {
    const local = await directoryInstall(
      context,
      "i503",
      entry("alpha", undefined, { version: "3.0.0" }),
      manifestPath,
      "{broken\n",
    );
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, manifestPath),
      "{broken\n",
    );
    context.assert.equal(local.result.installed[0].version, "3.0.0");
    const error = await captureThrow(() =>
      zipInstall(
        context,
        "i503",
        entry("alpha", undefined, { version: "3.0.0" }),
        manifestPath,
        "{broken\n",
      ),
    );
    context.assert.match(error.message, /JSON|parse|manifest|Unexpected/iu);
  }),
  makeCase("I504", async (context) => {
    const scalar = "42\n";
    const local = await directoryInstall(
      context,
      "i504",
      entry("alpha", undefined, { version: "4.0.0" }),
      manifestPath,
      scalar,
    );
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, manifestPath),
      scalar,
    );
    const error = await captureThrow(() =>
      zipInstall(
        context,
        "i504",
        entry("alpha", undefined, { version: "4.0.0" }),
        manifestPath,
        scalar,
      ),
    );
    context.assert.match(error.message, /JSON object|object|manifest/iu);
  }),
  makeCase("I505", async (context) => {
    const invalid = pluginJson({ name: "Bad Name", version: "5.0.0" });
    const local = await directoryInstall(
      context,
      "i505",
      entry("alpha", undefined, { version: "entry-fallback" }),
      manifestPath,
      invalid,
    );
    context.assert.equal(local.result.installed[0].version, "5.0.0");
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, manifestPath),
      invalid,
    );
    const error = await captureThrow(() =>
      zipInstall(context, "i505", entry("alpha", undefined), manifestPath, invalid),
    );
    context.assert.match(error.message, /name|invalid|manifest/iu);
  }),
  makeCase("I506", async (context) => {
    const mismatch = pluginJson({ name: "other", version: "6.0.0" });
    const local = await directoryInstall(
      context,
      "i506",
      entry("alpha", undefined, { version: "entry-fallback" }),
      manifestPath,
      mismatch,
    );
    context.assert.equal(local.result.installed[0].version, "6.0.0");
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, manifestPath),
      mismatch,
    );
    const error = await captureThrow(() =>
      zipInstall(context, "i506", entry("alpha", undefined), manifestPath, mismatch),
    );
    context.assert.match(error.message, /alpha|other|match|manifest/iu);
  }),
  makeCase("I507", async (context) => {
    const invalid = pluginJson({ name: "still wrong", version: "7.0.0" });
    const local = await directoryInstall(
      context,
      "i507",
      entry("alpha", undefined, { strict: false, version: "entry-fallback" }),
      manifestPath,
      invalid,
    );
    context.assert.equal(
      await readText({ ...context, runRoot: local.target }, manifestPath),
      invalid,
    );
    context.assert.equal(
      await pathExists(join(local.target, ".claude-plugin", "plugin.json")),
      false,
    );
    const error = await captureThrow(() =>
      zipInstall(
        context,
        "i507",
        entry("alpha", undefined, { strict: false }),
        manifestPath,
        invalid,
      ),
    );
    context.assert.match(error.message, /name|invalid|manifest/iu);
  }),
  makeCase("I508", async (context) => {
    const scenarios = [
      {
        label: "invalid-name-version",
        text: pluginJson({ name: "Bad Name", version: "8.1.0" }),
        entryVersion: "fallback-a",
        expected: "8.1.0",
      },
      {
        label: "mismatch-version",
        text: pluginJson({ name: "other", version: "8.2.0" }),
        entryVersion: "fallback-b",
        expected: "8.2.0",
      },
      { label: "malformed", text: "{bad", entryVersion: "8.3.0", expected: "8.3.0" },
      { label: "none", text: null, entryVersion: "8.4.0", expected: "8.4.0" },
      {
        label: "empty-version",
        text: pluginJson({ name: "alpha", version: "" }),
        entryVersion: "8.5.0",
        expected: "8.5.0",
      },
      { label: "nullish-entry", text: null, entryVersion: undefined, expected: "0.0.0" },
    ];
    for (const scenario of scenarios) {
      const local = await directoryInstall(
        context,
        `i508-${scenario.label}`,
        entry(
          "alpha",
          undefined,
          scenario.entryVersion === undefined ? {} : { version: scenario.entryVersion },
        ),
        scenario.text === null ? null : manifestPath,
        scenario.text,
      );
      context.assert.equal(local.result.installed[0].version, scenario.expected);
      context.assert.equal(
        local.result.installed[0].installPath.endsWith(join("alpha", scenario.expected)),
        true,
      );
    }

    const storageRoot = at(context, "i508-priority-directory-storage");
    const sourceRoot = at(context, "i508-priority-directory-source");
    await writeText(
      { ...context, runRoot: sourceRoot },
      join(".knorvia-plugin", "plugin.json"),
      pluginJson({ name: "alpha", version: "1.0.0" }),
    );
    await writeText(
      { ...context, runRoot: sourceRoot },
      join(".claude-plugin", "plugin.json"),
      pluginJson({ name: "alpha", version: "2.0.0" }),
    );
    await writeText(
      { ...context, runRoot: sourceRoot },
      join(".codex-plugin", "plugin.json"),
      pluginJson({ name: "alpha", version: "3.0.0" }),
    );
    await writeMarket(
      context,
      storageRoot,
      entry("alpha", { source: "directory", path: sourceRoot }, { version: "fallback" }),
    );
    const selected = await install(context, storageRoot);
    context.assert.equal(selected.installed[0].version, "1.0.0");
  }),
];
