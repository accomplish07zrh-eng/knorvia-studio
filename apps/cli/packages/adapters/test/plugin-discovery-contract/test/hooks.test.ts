// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import type { HookEventName, PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { bindTarget, type BoundTarget } from "../src/harness/target-binder.js";
import {
  adapterFrom,
  baseRequest,
  createSandbox,
  diagnosticCodes,
  exportedFunction,
  setupPorts,
  writePlugin,
} from "./support/fixtures.js";

interface LoadedPluginFixture {
  readonly id: string;
  readonly manifest: PluginManifest;
  readonly manifestPath: string;
  readonly marketplace: string;
  readonly rootPath: string;
  readonly source: "cache" | "inline" | "official";
}

interface HookSourceFixture {
  readonly rawHooks: unknown;
  readonly sourcePath: string;
  readonly wrapper: boolean;
}

let indexTarget: BoundTarget | undefined;
let hookTarget: BoundTarget | undefined;

function required(value: BoundTarget | undefined, name: string): BoundTarget {
  if (value === undefined) throw new Error(`${name} target was not bound`);
  return value;
}

function loaded(root: string, manifest: PluginManifest): LoadedPluginFixture {
  return {
    id: `${manifest.name}@inline`,
    manifest,
    manifestPath: join(root, ".knorvia-plugin", "plugin.json"),
    marketplace: "inline",
    rootPath: root,
    source: "inline",
  };
}

before(async () => {
  [indexTarget, hookTarget] = await Promise.all([bindTarget("index"), bindTarget("hook-sources")]);
});

describe("hook sources and runtime projection", { concurrency: false }, () => {
  test("HOOK-01: default and manifest hook sources canonicalize to one real file", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      hooks: ["./hooks/hooks.json", "./hooks/../hooks/hooks.json"],
      name: "dedup-hooks",
    };
    const hooks = {
      hooks: {
        SessionStart: [{ hooks: [{ command: "start", type: "command" }] }],
      },
    };
    const root = writePlugin(sandbox, "dedup-hooks", manifest, {
      "hooks/hooks.json": `${JSON.stringify(hooks)}\n`,
    });
    const diagnostics: PluginDiagnostic[] = [];
    const listSources = exportedFunction<
      (input: {
        diagnostics: PluginDiagnostic[];
        loaded: LoadedPluginFixture;
      }) => HookSourceFixture[]
    >(required(hookTarget, "hook-sources"), "listPluginHookSources");
    const listEvents = exportedFunction<
      (input: { diagnostics: PluginDiagnostic[]; loaded: LoadedPluginFixture }) => HookEventName[]
    >(required(hookTarget, "hook-sources"), "listPluginHookEventNames");

    const sources = listSources({ diagnostics, loaded: loaded(root, manifest) });
    const events = listEvents({ diagnostics, loaded: loaded(root, manifest) });
    assert.equal(sources.length, 1);
    assert.deepEqual(events, ["SessionStart"]);
    assert.ok(
      diagnostics.every(
        (item) =>
          item.code === "plugin_hook_invalid" &&
          item.severity === "warning" &&
          /Duplicate plugin hooks file ignored:/u.test(item.message),
      ),
    );
  });

  test("HOOK-02: invalid JSON, escaped source, unsupported event and matcher each diagnose", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      hooks: [
        "../outside/hooks.json",
        {
          MadeUpEvent: [{ hooks: [{ command: "bad-event", type: "command" }] }],
          PreToolUse: [{ hooks: [{ command: 42, type: "command" }], matcher: 99 }],
        },
      ],
      name: "bad-hooks",
    };
    const root = writePlugin(sandbox, "bad-hooks", manifest, {
      "hooks/hooks.json": "{ definitely not json\n",
    });
    const diagnostics: PluginDiagnostic[] = [];
    const listEvents = exportedFunction<
      (input: { diagnostics: PluginDiagnostic[]; loaded: LoadedPluginFixture }) => HookEventName[]
    >(required(hookTarget, "hook-sources"), "listPluginHookEventNames");

    assert.deepEqual(listEvents({ diagnostics, loaded: loaded(root, manifest) }), ["PreToolUse"]);
    const codes = diagnostics.map((item) => item.code);
    assert.ok(codes.includes("plugin_hook_read_failed"));
    assert.ok(codes.includes("plugin_component_path_invalid"));
    assert.ok(codes.includes("plugin_hook_unsupported_event"));
    assert.equal(codes.includes("plugin_hook_invalid"), false);

    setupPorts();
    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.ok(diagnosticCodes(outcome).includes("plugin_hook_invalid"));
    assert.equal(outcome.hooks.PreToolUse, undefined);
  });

  test("HOOK-03: valid command/process hooks preserve option fields and host plugin context", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "rich-hooks" };
    const hooks = {
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                async: true,
                command: "notify",
                shell: "powershell",
                statusMessage: "Notifying",
                timeout: 3,
                timeoutMs: 3000,
                type: "command",
              },
              {
                args: ["--check"],
                command: "validator",
                statusMessage: "Validating",
                timeoutMs: 4000,
                type: "process",
              },
            ],
            matcher: "Write",
          },
        ],
      },
    };
    const root = writePlugin(sandbox, "rich-hooks", manifest, {
      "hooks/hooks.json": `${JSON.stringify(hooks)}\n`,
    });
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    const runtime = outcome.hooks.PostToolUse;
    assert.equal(runtime?.length, 1);
    assert.equal(runtime?.[0]?.matcher, "Write");
    assert.equal(runtime?.[0]?.hooks[0]?.plugin?.id, "rich-hooks@inline");
    assert.equal(runtime?.[0]?.hooks[0]?.plugin?.sourcePath, join(root, "hooks", "hooks.json"));
    assert.equal(runtime?.[0]?.hooks[1]?.plugin?.dataPath, outcome.plugins[0]?.dataPath);
    assert.deepEqual(
      outcome.plugins[0]?.hookDetails.map((detail) => ({
        args: detail.args,
        async: detail.async,
        matcher: detail.matcher,
        shell: detail.shell,
        statusMessage: detail.statusMessage,
        timeout: detail.timeout,
        timeoutMs: detail.timeoutMs,
        type: detail.type,
      })),
      [
        {
          args: undefined,
          async: true,
          matcher: "Write",
          shell: "powershell",
          statusMessage: "Notifying",
          timeout: 3,
          timeoutMs: 3000,
          type: "command",
        },
        {
          args: ["--check"],
          async: undefined,
          matcher: "Write",
          shell: undefined,
          statusMessage: "Validating",
          timeout: undefined,
          timeoutMs: 4000,
          type: "process",
        },
      ],
    );
  });

  test("HOOK-04: third-party hooks run when enabled and remain details-only when disabled", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(
      sandbox,
      "community-hooks",
      { name: "community-hooks" },
      {
        "hooks/hooks.json": `${JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ command: "cleanup", type: "command" }] }],
          },
        })}\n`,
      },
    );
    const ports = setupPorts();
    ports.installedRecords.push({
      id: "community-hooks@community",
      installPath: "ignored",
      installedAt: "2026-01-02T03:04:05.000Z",
      marketplace: "community",
      name: "community-hooks",
      scope: "user",
      version: "1.0.0",
    });
    ports.resolvedInstalledRoots.set("community-hooks@community", root);
    const request = baseRequest(sandbox);
    request.config.enabledPlugins = { "community-hooks@community": true };

    let outcome = adapterFrom(required(indexTarget, "index"), sandbox.storage).discoverPluginsSync(
      request,
    );
    assert.equal(outcome.hooks.Stop?.[0]?.hooks[0]?.plugin?.id, "community-hooks@community");
    assert.equal(outcome.plugins[0]?.hookDetails[0]?.runnable, true);

    request.config.enabledPlugins = { "community-hooks@community": false };
    outcome = adapterFrom(required(indexTarget, "index"), sandbox.storage).discoverPluginsSync(
      request,
    );
    assert.deepEqual(outcome.hooks, {});
    assert.equal(outcome.plugins[0]?.hookDetails.length, 1);
    assert.equal(outcome.plugins[0]?.hookDetails[0]?.command, "cleanup");
    assert.equal(outcome.plugins[0]?.hookDetails[0]?.runnable, true);
    assert.equal(diagnosticCodes(outcome).includes("plugin_hook_invalid"), false);
  });
});
