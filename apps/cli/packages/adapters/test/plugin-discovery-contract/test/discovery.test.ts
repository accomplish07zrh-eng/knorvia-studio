// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import type { PluginLoadOutcome } from "@knorvia/contracts";
import { bindTarget, type BoundTarget } from "../src/harness/target-binder.js";
import {
  adapterFrom,
  baseRequest,
  convenienceDiscoverFrom,
  createSandbox,
  diagnosticCodes,
  normalizedOutcome,
  setupPorts,
  writeJson,
  writePlugin,
} from "./support/fixtures.js";
import { simpleManifest } from "./support/manifests.js";

let target: BoundTarget | undefined;

function getTarget(): BoundTarget {
  if (target === undefined) throw new Error("Discovery target was not bound");
  return target;
}

function pluginById(outcome: PluginLoadOutcome, id: string) {
  const plugin = outcome.plugins.find((item) => item.id === id);
  assert.ok(plugin, `Expected plugin metadata for ${id}`);
  return plugin;
}

function replaceTree(value: unknown, substitutions: ReadonlyMap<string, string>): unknown {
  const text = JSON.stringify(value);
  let normalized = text;
  for (const [from, to] of substitutions)
    normalized = normalized.replaceAll(from.replaceAll("\\", "\\\\"), to);
  return JSON.parse(normalized) as unknown;
}

before(async () => {
  target = await bindTarget("index");
});

describe("NodePluginAdapter discovery contract", { concurrency: false }, () => {
  test("DISC-01: disabled global switch returns the empty six-field outcome without port or data work", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "disabled-globally", simpleManifest("disabled-globally"));
    const ports = setupPorts();
    const request = baseRequest(sandbox, [root]);
    request.config.enabled = false;

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);

    assert.deepEqual(outcome, {
      commandRoots: [],
      diagnostics: [],
      hooks: {},
      mcpServers: {},
      plugins: [],
      skillRoots: [],
    });
    assert.deepEqual(ports.calls, []);
  });

  test("DISC-02: source defaults, explicit enablement and official-default set compose correctly", (context) => {
    const sandbox = createSandbox(context);
    const inlineRoot = writePlugin(sandbox, "inline-default", simpleManifest("inline-default"));
    const officialRoot = writePlugin(
      sandbox,
      "official-default",
      simpleManifest("official-default"),
    );
    const cacheRoot = writePlugin(sandbox, "cache-default", simpleManifest("cache-default"));
    const ports = setupPorts();
    ports.installedRecords.push({
      id: "cache-default@community",
      installPath: "unused-by-port",
      installedAt: "2026-01-02T03:04:05.000Z",
      marketplace: "community",
      name: "cache-default",
      scope: "user",
      version: "1.0.0",
    });
    ports.resolvedInstalledRoots.set("cache-default@community", cacheRoot);

    const request = baseRequest(sandbox, [inlineRoot]);
    request.officialPluginRoots = [officialRoot];
    let outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.equal(pluginById(outcome, "inline-default@inline").enabled, true);
    assert.equal(pluginById(outcome, "official-default@knorvia-plugins-bundled").enabled, false);
    assert.equal(pluginById(outcome, "cache-default@community").enabled, false);

    request.config.enabledPlugins = {
      "cache-default@community": true,
      "inline-default@inline": false,
    };
    request.officialPluginsEnabledByDefault = new Set(["official-default@knorvia-plugins-bundled"]);
    outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.equal(pluginById(outcome, "inline-default@inline").enabled, false);
    assert.equal(pluginById(outcome, "official-default@knorvia-plugins-bundled").enabled, true);
    assert.equal(pluginById(outcome, "cache-default@community").enabled, true);
  });

  test("DISC-03: official suppression does not suppress inline or third-party namesakes", (context) => {
    const sandbox = createSandbox(context);
    const inlineRoot = writePlugin(sandbox, "inline-shared", simpleManifest("shared"));
    const officialRoot = writePlugin(sandbox, "official-shared", simpleManifest("shared"));
    const cacheRoot = writePlugin(sandbox, "cache-shared", simpleManifest("shared"));
    const ports = setupPorts();
    ports.installedRecords.push({
      id: "shared@community",
      installPath: "ignored",
      installedAt: "2026-01-02T03:04:05.000Z",
      marketplace: "community",
      name: "shared",
      scope: "user",
      version: "1.0.0",
    });
    ports.resolvedInstalledRoots.set("shared@community", cacheRoot);
    const request = baseRequest(sandbox, [inlineRoot]);
    request.officialPluginRoots = [officialRoot];
    request.config.suppressedBuiltins = ["shared@knorvia-plugins-bundled"];

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.deepEqual(outcome.plugins.map((plugin) => plugin.id).sort(), [
      "shared@community",
      "shared@inline",
    ]);
  });

  test("DISC-04: scope and priority follow source authority and candidate order", (context) => {
    const sandbox = createSandbox(context);
    const first = writePlugin(sandbox, "first", simpleManifest("first"), {
      "commands/first.md": "# First\n",
      "skills/first/SKILL.md": "# First skill\n",
    });
    const official = writePlugin(sandbox, "official", simpleManifest("official"), {
      "commands/official.md": "# Official\n",
      "skills/official/SKILL.md": "# Official skill\n",
    });
    const request = baseRequest(sandbox, [first]);
    request.officialPluginRoots = [official];
    request.config.enabledPlugins = { "official@knorvia-plugins-bundled": true };
    setupPorts();

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    const inlineSkill = outcome.skillRoots.find((root) => root.pluginId === "first@inline");
    const officialSkill = outcome.skillRoots.find(
      (root) => root.pluginId === "official@knorvia-plugins-bundled",
    );
    const inlineCommand = outcome.commandRoots.find((root) => root.plugin?.id === "first@inline");
    const officialCommand = outcome.commandRoots.find(
      (root) => root.plugin?.id === "official@knorvia-plugins-bundled",
    );
    assert.deepEqual(
      [inlineSkill?.scope, inlineSkill?.priority, inlineCommand?.scope, inlineCommand?.priority],
      ["user", 1000, "user", 1001],
    );
    assert.deepEqual(
      [
        officialSkill?.scope,
        officialSkill?.priority,
        officialCommand?.scope,
        officialCommand?.priority,
      ],
      ["system", 1010, "system", 1011],
    );
  });

  test("DISC-05: bundled official partition roots are authoritative over legacy cache guesses", (context) => {
    const sandbox = createSandbox(context);
    const bundled = writePlugin(sandbox, "bundled", simpleManifest("bundled"));
    const legacy = join(sandbox.storage, "cache", "knorvia-plugins-bundled", "legacy", "99.0.0");
    writeJson(join(legacy, ".knorvia-plugin", "plugin.json"), simpleManifest("legacy", "99.0.0"));
    const ports = setupPorts();
    ports.bundledRoots = [bundled];
    const request = baseRequest(sandbox);

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.deepEqual(
      outcome.plugins.map((plugin) => plugin.id),
      ["bundled@knorvia-plugins-bundled"],
    );
    assert.deepEqual(
      ports.calls.filter((call) => call.name === "loadBundledOfficialPluginRootsSync"),
      [{ args: [sandbox.storage], name: "loadBundledOfficialPluginRootsSync" }],
    );
  });

  test("DISC-06: manifest family precedence is knorvia, then claude, then codex", (context) => {
    const sandbox = createSandbox(context);
    const all = join(sandbox.plugins, "all-families");
    writeJson(join(all, ".knorvia-plugin", "plugin.json"), simpleManifest("knorvia-wins"));
    writeJson(join(all, ".claude-plugin", "plugin.json"), simpleManifest("claude-loses"));
    writeJson(join(all, ".codex-plugin", "plugin.json"), simpleManifest("codex-loses"));
    const claude = join(sandbox.plugins, "claude-and-codex");
    writeJson(join(claude, ".claude-plugin", "plugin.json"), simpleManifest("claude-wins"));
    writeJson(join(claude, ".codex-plugin", "plugin.json"), simpleManifest("codex-loses-too"));
    const codex = writePlugin(sandbox, "codex-only", simpleManifest("codex-only"), {}, "codex");
    setupPorts();

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(
      baseRequest(sandbox, [all, claude, codex]),
    );
    assert.deepEqual(
      outcome.plugins.map((plugin) => plugin.name),
      ["knorvia-wins", "claude-wins", "codex-only"],
    );
  });

  test("DISC-07: bad candidates and duplicate IDs diagnose without blocking good candidates", (context) => {
    const sandbox = createSandbox(context);
    const missingRoot = join(sandbox.plugins, "does-not-exist");
    const missingManifest = join(sandbox.plugins, "missing-manifest");
    mkdirSync(missingManifest, { recursive: true });
    const invalid = join(sandbox.plugins, "invalid");
    writeJson(join(invalid, ".knorvia-plugin", "plugin.json"), { name: "Invalid Uppercase" });
    const duplicateA = writePlugin(sandbox, "duplicate-a", simpleManifest("duplicate"));
    const duplicateB = writePlugin(sandbox, "duplicate-b", simpleManifest("duplicate"));
    const good = writePlugin(sandbox, "good", simpleManifest("good"));
    setupPorts();

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(
      baseRequest(sandbox, [missingRoot, missingManifest, invalid, duplicateA, duplicateB, good]),
    );
    const codes = diagnosticCodes(outcome);
    assert.ok(codes.includes("plugin_root_not_found"));
    assert.ok(codes.includes("plugin_manifest_not_found"));
    assert.ok(codes.includes("plugin_manifest_invalid"));
    assert.ok(codes.includes("plugin_duplicate_id"));
    assert.ok(outcome.plugins.some((plugin) => plugin.id === "good@inline"));
    assert.equal(outcome.plugins.filter((plugin) => plugin.id === "duplicate@inline").length, 1);
  });

  test("DISC-08: missing version falls back to 0.0.0 and marketplace IDs keep the final separator", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "no-version", { name: "no-version" });
    const ports = setupPorts();
    ports.installedRecords.push({
      id: "no-version@market@edge",
      installPath: "ignored",
      installedAt: "2026-01-02T03:04:05.000Z",
      marketplace: "market@edge",
      name: "no-version",
      scope: "user",
      version: "0.0.0",
    });
    ports.resolvedInstalledRoots.set("no-version@market@edge", root);
    const request = baseRequest(sandbox);

    const outcome = adapterFrom(getTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.equal(pluginById(outcome, "no-version@market@edge").version, "0.0.0");
  });

  test("DISC-09: async, sync, and convenience entry points return equivalent public outcomes", async (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "consistent", simpleManifest("consistent"), {
      "commands/run.md": "---\nname: run\ndescription: Run\n---\n# Run\n",
      "skills/main/SKILL.md": "---\nname: main\ndescription: Main\n---\n# Main\n",
    });
    setupPorts();
    const request = baseRequest(sandbox, [root]);
    const adapter = adapterFrom(getTarget(), sandbox.storage);

    const sync = adapter.discoverPluginsSync(request);
    const asyncResult = await adapter.discoverPlugins(request);
    const convenience = convenienceDiscoverFrom(getTarget())(request);

    assert.deepEqual(normalizedOutcome(asyncResult), normalizedOutcome(sync));
    assert.deepEqual(normalizedOutcome(convenience), normalizedOutcome(sync));
    assert.deepEqual(
      replaceTree(normalizedOutcome(sync), new Map([[sandbox.root, "<sandbox>"]])),
      replaceTree(normalizedOutcome(convenience), new Map([[sandbox.root, "<sandbox>"]])),
    );
  });
});
