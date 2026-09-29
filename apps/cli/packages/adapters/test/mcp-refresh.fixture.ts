// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import * as nativePath from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import type * as SDK from "@modelcontextprotocol/client";
import type { Logger } from "@knorvia/contracts";
import type * as Shared from "@knorvia/shared/node";
import type { SharedKnorviaCredentialStore } from "../src/auth/shared-credentials.js";
import type * as Credentials from "../src/mcp/oauth-credentials.js";
import type * as Errors from "../src/mcp/oauth-errors.js";
import type * as Discovery from "../src/mcp/oauth-shared.js";
import type { refreshMcpOAuthTokensUnderLock } from "../src/mcp/oauth-refresh.js";

export const targetUrls = {
  refresh: new URL("../src/mcp/oauth-refresh.ts", import.meta.url),
  sdk: new URL(import.meta.resolve("@modelcontextprotocol/client")),
  esbuild: new URL(import.meta.resolve("esbuild")),
  sharedLock: new URL(import.meta.resolve("@knorvia/shared/node")),
  ownedTemp: pathToFileURL(nativePath.join(tmpdir(), "knorvia-owned-mcp-refresh")),
};

export type RefreshInput = Parameters<typeof refreshMcpOAuthTokensUnderLock>[0];
export type Snapshot = Credentials.CredentialPairSnapshot;
export type OwnedPorts = Pick<
  typeof Credentials,
  "loadCredentialPair" | "publishCanonicalCredentials" | "invalidateCanonicalCredentials"
> &
  Pick<typeof Discovery, "loadDiscoveryRecord" | "saveDiscoveryRecord"> &
  Pick<
    typeof Errors,
    "createInteractiveAuthorizationRequiredError" | "createTemporaryRefreshFailureError"
  > &
  Pick<typeof SDK, "discoverOAuthServerInfo" | "selectResourceURL" | "refreshAuthorization"> & {
    withFileLock: typeof Shared.withFileLock;
    sanitizeKeyPrefix(prefix: string): string;
    isKnorviaFileLockTimeoutError(error: unknown): boolean;
  };

type Call = { name: string; args: readonly unknown[] };
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`fixture wait expired: ${label}`)), 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    source: "canonical",
    generation: "generation-before",
    raw: "owned-cas-before",
    clientInformation: { client_id: "owned-client" },
    tokens: { access_token: "owned-before", token_type: "Bearer", refresh_token: "owned-refresh" },
    ...overrides,
  };
}

export async function fixture() {
  const sdk = (await import(targetUrls.sdk.href)) as typeof SDK;
  const calls: Call[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
  };
  const unexpected = async (): Promise<never> => {
    throw new Error("unmocked credential store access");
  };
  const store: SharedKnorviaCredentialStore = {
    filePath: nativePath.join(
      fileURLToPath(targetUrls.ownedTemp),
      "ports-only",
      "credentials.json",
    ),
    delete: unexpected,
    deleteIfValue: unexpected,
    deleteIfValues: unexpected,
    deleteManyIfValue: unexpected,
    load: unexpected,
    loadMany: unexpected,
    save: unexpected,
    saveMany: unexpected,
    saveReplacing: unexpected,
  };
  const before = snapshot();
  const next: SDK.OAuthTokens = {
    access_token: "owned-after",
    token_type: "Bearer",
    refresh_token: "owned-rotated",
  };
  const discovered: SDK.OAuthDiscoveryState = {
    authorizationServerUrl: "https://issuer.invalid/oauth",
  };
  const published = {
    canonical: {
      client_information: before.clientInformation!,
      published_by: "refresh:owned-prefix",
      tokens: next,
      version: 2 as const,
    },
    generation: "0123456789abcdef-published",
    legacyClientRaw: "client",
    legacyTokensRaw: "tokens",
    raw: "canonical",
  };
  const timeout = new Error("owned lock timeout");
  let current: Snapshot | undefined = before;
  let cached: SDK.OAuthDiscoveryState | undefined = discovered;
  let insideLock = false;
  const logger: Logger = {
    debug(message, context) {
      record("debug", message, context);
    },
    info(message, context) {
      assert.equal(this, logger);
      record("info", message, context);
    },
    warn(message, context) {
      assert.equal(this, logger);
      record("warn", message, context);
    },
    error(message, error, context) {
      record("error", message, error, context);
    },
    child() {
      return logger;
    },
  };
  const input: RefreshInput = {
    credentialStore: store,
    keyPrefix: "owned-prefix",
    reactive: true,
    serverName: "owned-server",
    serverUrl: "https://resource.invalid/mcp",
    logger,
  };
  const ports: OwnedPorts = {
    async loadCredentialPair(...args) {
      record("loadCredentialPair", ...args);
      return current;
    },
    sanitizeKeyPrefix(prefix) {
      record("sanitizeKeyPrefix", prefix);
      return "safe-owned-prefix";
    },
    async withFileLock<T>(
      path: string,
      operation: () => Promise<T>,
      options?: Shared.SharedFileLockOptions,
    ) {
      record("withFileLock", path, operation, options);
      insideLock = true;
      try {
        return await operation();
      } finally {
        insideLock = false;
      }
    },
    isKnorviaFileLockTimeoutError(error) {
      record("isKnorviaFileLockTimeoutError", error);
      return error === timeout;
    },
    async loadDiscoveryRecord(...args) {
      record("loadDiscoveryRecord", ...args);
      return cached;
    },
    async saveDiscoveryRecord(...args) {
      record("saveDiscoveryRecord", ...args);
    },
    async discoverOAuthServerInfo(...args) {
      record("discoverOAuthServerInfo", ...args);
      return discovered;
    },
    async selectResourceURL(...args) {
      record("selectResourceURL", ...args);
      return undefined;
    },
    async refreshAuthorization(...args) {
      record("refreshAuthorization", ...args);
      return next;
    },
    async publishCanonicalCredentials(...args) {
      record("publishCanonicalCredentials", ...args);
      assert.equal(insideLock, true);
      return published;
    },
    async invalidateCanonicalCredentials(...args) {
      record("invalidateCanonicalCredentials", ...args);
      return false;
    },
    createInteractiveAuthorizationRequiredError(value) {
      record("createInteractiveAuthorizationRequiredError", value);
      return Object.assign(new Error("owned interactive", { cause: value.cause }), {
        code: "MCP_OAUTH_INTERACTIVE_REQUIRED" as const,
        reason: value.reason,
      });
    },
    createTemporaryRefreshFailureError(value) {
      record("createTemporaryRefreshFailureError", value);
      return Object.assign(new Error("owned temporary", { cause: value.cause }), {
        code: "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE" as const,
      });
    },
  };
  const routes: Record<string, unknown> = {
    "node:path": nativePath,
    "@knorvia/shared": {
      isKnorviaFileLockTimeoutError: (
        ...args: Parameters<OwnedPorts["isKnorviaFileLockTimeoutError"]>
      ) => ports.isKnorviaFileLockTimeoutError(...args),
    },
    "@knorvia/shared/node": {
      withFileLock: <T>(...args: Parameters<typeof Shared.withFileLock<T>>) =>
        ports.withFileLock(...args),
    },
    "./oauth-lease.js": { sanitizeKeyPrefix: (prefix: string) => ports.sanitizeKeyPrefix(prefix) },
  };
  for (const [specifier, names] of [
    [
      "./oauth-credentials.js",
      ["loadCredentialPair", "publishCanonicalCredentials", "invalidateCanonicalCredentials"],
    ],
    ["./oauth-shared.js", ["loadDiscoveryRecord", "saveDiscoveryRecord"]],
    [
      "./oauth-errors.js",
      ["createInteractiveAuthorizationRequiredError", "createTemporaryRefreshFailureError"],
    ],
    [
      "@modelcontextprotocol/client",
      ["discoverOAuthServerInfo", "selectResourceURL", "refreshAuthorization"],
    ],
  ] as const) {
    routes[specifier] = Object.fromEntries(
      names.map((name) => [
        name,
        (...args: unknown[]) => Reflect.apply(ports[name], undefined, args),
      ]),
    );
  }
  Object.assign(routes["@modelcontextprotocol/client"] as object, {
    OAuthError: sdk.OAuthError,
    OAuthErrorCode: sdk.OAuthErrorCode,
  });
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const source = await readFile(targetUrls.refresh, "utf8");
  const { code } = await transform(source, {
    format: "cjs",
    loader: "ts",
    target: "node24",
    sourcefile: fileURLToPath(targetUrls.refresh),
  });
  const module = { exports: {} as Record<string, unknown> };
  const requireOwned = (name: string): unknown => {
    assert.ok(Object.hasOwn(routes, name), `unapproved target dependency: ${name}`);
    return routes[name];
  };
  // Only root executes the selected trusted local target; no bundling or dependency body rewriting.
  new Function("require", "module", "exports", code)(requireOwned, module, module.exports);
  assert.deepEqual(Object.keys(module.exports), ["refreshMcpOAuthTokensUnderLock"]);
  assert.equal(typeof module.exports.refreshMcpOAuthTokensUnderLock, "function");
  const refresh = module.exports
    .refreshMcpOAuthTokensUnderLock as typeof refreshMcpOAuthTokensUnderLock;
  const h = {
    sdk,
    ports,
    calls,
    record,
    store,
    input,
    logger,
    before,
    next,
    discovered,
    published,
    timeout,
    refresh,
    run: () => refresh(input),
    get current() {
      return current;
    },
    set current(value: Snapshot | undefined) {
      current = value;
    },
    get cached() {
      return cached;
    },
    set cached(value: SDK.OAuthDiscoveryState | undefined) {
      cached = value;
    },
    names: () => calls.map((call) => call.name),
    count: (name: string) => calls.filter((call) => call.name === name).length,
    only<K extends keyof OwnedPorts>(name: K): Parameters<OwnedPorts[K]> {
      const matches = calls.filter((call) => call.name === name);
      assert.equal(matches.length, 1, name);
      return matches[0]!.args as Parameters<OwnedPorts[K]>;
    },
  };
  return h;
}

export async function useRealLock(t: TestContext, h: Awaited<ReturnType<typeof fixture>>) {
  const base = nativePath.resolve(fileURLToPath(targetUrls.ownedTemp));
  await mkdir(base, { recursive: true });
  const owned = await mkdtemp(nativePath.join(base, "refresh-lock-"));
  t.after(async () => {
    const relative = nativePath.relative(base, nativePath.resolve(owned));
    assert.ok(relative.startsWith("refresh-lock-") && !nativePath.isAbsolute(relative));
    assert.ok(!relative.split(nativePath.sep).includes(".."));
    await rm(owned, { recursive: true, force: true });
  });
  const real = (await import(targetUrls.sharedLock.href)) as typeof Shared;
  const lockRequestedTwice = deferred<void>();
  let requests = 0;
  h.input.credentialStore = { ...h.store, filePath: nativePath.join(owned, "credentials.json") };
  h.ports.withFileLock = async <T>(
    path: string,
    operation: () => Promise<T>,
    options?: Shared.SharedFileLockOptions,
  ) => {
    h.record("withFileLock", path, operation, options);
    if (++requests === 2) lockRequestedTwice.resolve();
    return real.withFileLock(path, operation, options);
  };
  return { lockRequestedTwice, owned };
}

export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection");
}
