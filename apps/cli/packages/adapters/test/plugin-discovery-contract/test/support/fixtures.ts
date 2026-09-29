// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  PluginDiscoverRequest,
  PluginLoadOutcome,
  PluginManifest,
  PluginOperationOptions,
} from "@knorvia/contracts";
import type { TestContext } from "node:test";
import type { BoundTarget } from "../../src/harness/target-binder.js";
import { createPortState, installPortState, type TestPortState } from "../../src/harness/ports.js";

export interface Sandbox {
  readonly outside: string;
  readonly plugins: string;
  readonly root: string;
  readonly storage: string;
  readonly working: string;
}

export interface PluginFileMap {
  readonly [relativePath: string]: string;
}

export type ManifestFamily = "claude" | "codex" | "knorvia";

interface NodePluginAdapterLike {
  discoverPlugins(
    request: PluginDiscoverRequest,
    options?: PluginOperationOptions,
  ): Promise<PluginLoadOutcome>;
  discoverPluginsSync(
    request: PluginDiscoverRequest,
    options?: { signal?: AbortSignal },
  ): PluginLoadOutcome;
}

type AdapterConstructor = new (options: { storageRoot: string }) => NodePluginAdapterLike;
type DiscoverSync = (
  request: PluginDiscoverRequest,
  options?: { signal?: AbortSignal },
) => PluginLoadOutcome;

export function createSandbox(context: TestContext): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "knorvia-plugin-discovery-"));
  const sandbox = {
    outside: join(root, "outside"),
    plugins: join(root, "plugins"),
    root,
    storage: join(root, "storage"),
    working: join(root, "working"),
  } satisfies Sandbox;
  for (const directory of [sandbox.outside, sandbox.plugins, sandbox.storage, sandbox.working]) {
    mkdirSync(directory, { recursive: true });
  }
  context.after(() => {
    const canonicalTemp = realpathSync(tmpdir());
    const canonicalRoot = realpathSync(root);
    const rel = relative(canonicalTemp, canonicalRoot);
    if (
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      !canonicalRoot.includes("knorvia-plugin-discovery-")
    ) {
      throw new Error(`Refusing to remove unexpected test root: ${canonicalRoot}`);
    }
    rmSync(canonicalRoot, { force: true, recursive: true });
  });
  return sandbox;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(path: string, value: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, value, "utf8");
}

export function writePlugin(
  sandbox: Sandbox,
  directoryName: string,
  manifest: PluginManifest,
  files: PluginFileMap = {},
  family: ManifestFamily = "knorvia",
): string {
  const root = join(sandbox.plugins, directoryName);
  const familyDirectory = `.${family}-plugin`;
  writeJson(join(root, familyDirectory, "plugin.json"), manifest);
  for (const [relativePath, contents] of Object.entries(files)) {
    writeText(join(root, relativePath), contents);
  }
  return root;
}

export function baseRequest(sandbox: Sandbox, dirs: string[] = []): PluginDiscoverRequest {
  return {
    config: {
      dirs,
      enabled: true,
      enabledPlugins: {},
      extraKnownMarketplaces: {},
      options: {},
      suppressedBuiltins: [],
    },
    env: {},
    storageRoot: sandbox.storage,
    workingDirectory: sandbox.working,
  };
}

export function setupPorts(): TestPortState {
  const state = createPortState();
  installPortState(state);
  return state;
}

export function adapterFrom(bound: BoundTarget, storageRoot: string): NodePluginAdapterLike {
  const value = bound.exports.NodePluginAdapter;
  if (typeof value !== "function") throw new Error("Target does not export NodePluginAdapter");
  return new (value as AdapterConstructor)({ storageRoot });
}

export function convenienceDiscoverFrom(bound: BoundTarget): DiscoverSync {
  const value = bound.exports.discoverNodePluginsSync;
  if (typeof value !== "function")
    throw new Error("Target does not export discoverNodePluginsSync");
  return value as DiscoverSync;
}

export function exportedFunction<T extends (...args: never[]) => unknown>(
  bound: BoundTarget,
  name: string,
): T {
  const value = bound.exports[name];
  if (typeof value !== "function") throw new Error(`Target does not export ${name}`);
  return value as T;
}

export function diagnosticCodes(outcome: PluginLoadOutcome): string[] {
  return outcome.diagnostics.map((item) => item.code);
}

export function normalizedOutcome(outcome: PluginLoadOutcome): unknown {
  return JSON.parse(JSON.stringify(outcome)) as unknown;
}
