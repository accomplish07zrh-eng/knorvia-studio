// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { TestContext } from "node:test";
import type * as Lease from "../src/mcp/oauth-lease.js";
import type * as Provider from "../src/mcp/oauth-provider.js";
import type * as Credentials from "../src/mcp/oauth-credentials.js";
import type * as Refresh from "../src/mcp/oauth-refresh.js";
import type * as Errors from "../src/mcp/oauth-errors.js";
import type { SharedKnorviaCredentialStore } from "../src/auth/shared-credentials.js";
import type { acquireFileLock } from "@knorvia/shared/node";

export const targetUrls = {
  lease: new URL("../src/mcp/oauth-lease.ts", import.meta.url).href,
  provider: new URL("../src/mcp/oauth-provider.ts", import.meta.url).href,
  credentials: new URL("../src/mcp/oauth-credentials.ts", import.meta.url).href,
  sharedNode: "@knorvia/shared/node",
  toolAnchor: import.meta.url,
};
const credentials = (await import(targetUrls.credentials)) as typeof Credentials;
export const nativeLock = (await import(targetUrls.sharedNode)) as {
  acquireFileLock: typeof acquireFileLock;
};
export const timeoutCode = "KNORVIA_FILE_LOCK_TIMEOUT";
export interface Ports {
  acquireFileLock: typeof acquireFileLock;
  loadCredentialPair: typeof Credentials.loadCredentialPair;
  isCanonicalTokenNearExpiry: typeof Credentials.isCanonicalTokenNearExpiry;
  refreshMcpOAuthTokensUnderLock: typeof Refresh.refreshMcpOAuthTokensUnderLock;
  createInteractiveAuthorizationRequiredError: typeof Errors.createInteractiveAuthorizationRequiredError;
  isRecord: typeof Credentials.isRecord;
  mcpOAuthCredentialKey: typeof Credentials.mcpOAuthCredentialKey;
}
const blocked = (): never => {
  throw new Error("Unexpected dependency operation in owned fixture");
};
export async function harness(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-owned-oauth-lease-"));
  const absolute = resolve(root);
  assert.equal(dirname(absolute), resolve(tmpdir()));
  assert.ok(absolute.includes("knorvia-owned-oauth-lease-"));
  t.after(async () => {
    assert.equal(resolve(root), absolute);
    const inside = relative(resolve(tmpdir()), absolute);
    assert.ok(inside && !inside.startsWith("..") && !isAbsolute(inside));
    await rm(absolute, { recursive: true, force: true });
  });
  const portsPath = join(root, "ports.mjs");
  const portsBody = [
    "export const ports = {};",
    `export const KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE = ${JSON.stringify(timeoutCode)};`,
    ...[
      "acquireFileLock",
      "loadCredentialPair",
      "isCanonicalTokenNearExpiry",
      "refreshMcpOAuthTokensUnderLock",
      "createInteractiveAuthorizationRequiredError",
      "isRecord",
      "mcpOAuthCredentialKey",
    ].map((name) => `export function ${name}(...args) { return ports.${name}(...args); }`),
  ].join("\n");
  await writeFile(portsPath, portsBody, { flag: "wx" });
  const { build } = createRequire(targetUrls.toolAnchor)("esbuild") as typeof import("esbuild");
  for (const name of ["lease", "provider"] as const) {
    const result = await build({
      entryPoints: [fileURLToPath(targetUrls[name])],
      bundle: true,
      write: false,
      platform: "node",
      target: "node24",
      format: "esm",
      metafile: true,
      logLevel: "silent",
      plugins: [
        {
          name: "owned-contract-ports",
          setup(api) {
            api.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === "entry-point") return;
              if (["node:crypto", "node:path"].includes(args.path))
                return { path: args.path, external: true };
              assert.ok(
                [
                  "@knorvia/shared/node",
                  "@knorvia/shared",
                  "./oauth-credentials.js",
                  "./oauth-errors.js",
                  "./oauth-refresh.js",
                ].includes(args.path),
                args.path,
              );
              return { path: pathToFileURL(portsPath).href, external: true };
            });
          },
        },
      ],
    });
    assert.equal(Object.keys(result.metafile!.inputs).length, 1);
    assert.equal(result.outputFiles!.length, 1);
    await writeFile(join(root, name + ".mjs"), result.outputFiles![0]!.contents, { flag: "wx" });
  }
  const { ports } = (await import(pathToFileURL(portsPath).href)) as { ports: Ports };
  Object.assign(ports, {
    acquireFileLock: blocked,
    loadCredentialPair: blocked,
    isCanonicalTokenNearExpiry: blocked,
    refreshMcpOAuthTokensUnderLock: blocked,
    createInteractiveAuthorizationRequiredError: blocked,
    isRecord: credentials.isRecord,
    mcpOAuthCredentialKey: credentials.mcpOAuthCredentialKey,
  } satisfies Ports);
  return {
    root,
    ports,
    lease: (await import(pathToFileURL(join(root, "lease.mjs")).href)) as typeof Lease,
    provider: (await import(pathToFileURL(join(root, "provider.mjs")).href)) as typeof Provider,
  };
}
export function store(
  overrides: Partial<SharedKnorviaCredentialStore> = {},
): SharedKnorviaCredentialStore {
  return {
    filePath: "owned-memory-store",
    delete: blocked,
    deleteIfValue: blocked,
    deleteIfValues: blocked,
    deleteManyIfValue: blocked,
    load: blocked,
    loadMany: blocked,
    save: blocked,
    saveMany: blocked,
    saveReplacing: blocked,
    ...overrides,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export type Pending = Parameters<typeof Lease.publishPendingAuthorization>[2];
export type ProviderInput = Parameters<typeof Provider.createMcpOAuthTokenProvider>[0];
export type Pair = Awaited<ReturnType<typeof Credentials.loadCredentialPair>>;
export function providerInput(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    config: { type: "authorization_code" },
    credentialStore: store(),
    keyPrefix: "owned-prefix",
    serverName: "Owned server",
    serverUrl: "https://example.invalid",
    ...overrides,
  };
}
