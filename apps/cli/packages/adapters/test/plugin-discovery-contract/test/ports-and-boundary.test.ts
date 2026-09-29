// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { before, describe, test } from "node:test";
import { bindTarget, type BoundTarget } from "../src/harness/target-binder.js";
import {
  adapterFrom,
  baseRequest,
  createSandbox,
  setupPorts,
  writeJson,
  writePlugin,
} from "./support/fixtures.js";
import { simpleManifest } from "./support/manifests.js";

let indexTarget: BoundTarget | undefined;

function requiredTarget(): BoundTarget {
  if (indexTarget === undefined) throw new Error("Index target was not bound");
  return indexTarget;
}

before(async () => {
  indexTarget = await bindTarget("index");
});

describe("retained public ports and bundle receipts", { concurrency: false }, () => {
  test("PORT-01: marketplace record/root calls preserve declared arguments and returned authority", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "installed-port", simpleManifest("installed-port"));
    const ports = setupPorts();
    const record = {
      id: "installed-port@community",
      installPath: "deliberately-not-the-real-root",
      installedAt: "2026-01-02T03:04:05.000Z",
      marketplace: "community",
      name: "installed-port",
      scope: "user" as const,
      version: "1.0.0",
    };
    ports.installedRecords.push(record);
    ports.resolvedInstalledRoots.set(record.id, root);
    const request = baseRequest(sandbox);
    request.config.enabledPlugins = { [record.id]: true };

    const outcome = adapterFrom(requiredTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.equal(outcome.plugins[0]?.rootPath, root);
    assert.equal(
      outcome.plugins[0]?.dataPath,
      join(sandbox.storage, "data", "installed-port@community"),
    );
    assert.deepEqual(
      ports.calls.filter((call) => call.name === "listInstalledPluginRecords"),
      [{ args: [sandbox.storage], name: "listInstalledPluginRecords" }],
    );
    assert.deepEqual(
      ports.calls.filter((call) => call.name === "resolveInstalledPluginRoot"),
      [{ args: [sandbox.storage, record], name: "resolveInstalledPluginRoot" }],
    );
    assert.equal(ports.calls.filter((call) => call.name === "getPluginDataDir").length, 0);
  });

  test("PORT-02: undefined bundled partition falls back, while an empty partition is authoritative", (context) => {
    const sandbox = createSandbox(context);
    const legacy = join(
      sandbox.storage,
      "cache",
      "knorvia-plugins-bundled",
      "legacy-plugin",
      "1.0.0",
    );
    writeJson(join(legacy, ".knorvia-plugin", "plugin.json"), simpleManifest("legacy-plugin"));
    const ports = setupPorts();
    const request = baseRequest(sandbox);

    ports.bundledRoots = undefined;
    let outcome = adapterFrom(requiredTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.ok(
      outcome.plugins.some((plugin) => plugin.id === "legacy-plugin@knorvia-plugins-bundled"),
    );

    ports.bundledRoots = [];
    outcome = adapterFrom(requiredTarget(), sandbox.storage).discoverPluginsSync(request);
    assert.equal(
      outcome.plugins.some((plugin) => plugin.id === "legacy-plugin@knorvia-plugins-bundled"),
      false,
    );
  });

  test("BOUND-01: receipt records real target inputs and no undeclared production source", () => {
    const target = requiredTarget();
    const receipt = JSON.parse(readFileSync(target.receiptPath, "utf8")) as {
      entry: string;
      inputs: string[];
    };
    assert.ok(receipt.entry.startsWith(target.targetRoot));
    assert.ok(receipt.inputs.some((input) => resolve(input) === resolve(receipt.entry)));
    const productionPluginSegment = ["apps", "cli", "packages", "adapters", "src", "plugins"].join(
      "/",
    );
    for (const input of receipt.inputs) {
      const normalized = input.replaceAll("\\", "/");
      if (normalized.includes(`/${productionPluginSegment}/`)) {
        assert.ok(normalized.startsWith(target.targetRoot.replaceAll("\\", "/")));
      }
    }
  });

  test("BOUND-01: test fixtures cannot impersonate an existing directory as a missing candidate", (context) => {
    const sandbox = createSandbox(context);
    const empty = join(sandbox.plugins, "empty");
    mkdirSync(empty, { recursive: true });
    setupPorts();
    const outcome = adapterFrom(requiredTarget(), sandbox.storage).discoverPluginsSync(
      baseRequest(sandbox, [empty]),
    );
    assert.ok(outcome.diagnostics.some((item) => item.code === "plugin_manifest_not_found"));
    assert.equal(
      outcome.diagnostics.some((item) => item.code === "plugin_root_not_found"),
      false,
    );
  });
});
