// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import * as nativeCrypto from "node:crypto";
import { readFile } from "node:fs/promises";
import * as nativeTimers from "node:timers";
import * as nativeUrl from "node:url";
import type * as SDK from "@modelcontextprotocol/client";
import type { Logger } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../src/auth/shared-credentials.js";
import type * as Entry from "../src/mcp/oauth-interactive.js";
import type * as Credentials from "../src/mcp/oauth-credentials.js";
import type * as Lease from "../src/mcp/oauth-lease.js";
import type * as Callback from "../src/auth/localhost-callback.js";
import type * as Discovery from "../src/mcp/oauth-shared.js";
import type * as Timeout from "../src/mcp/timeout.js";

export const targetUrls = {
  entry: new URL("../src/mcp/oauth-interactive.ts", import.meta.url),
  companions: {
    "./oauth-interactive-transaction.js": new URL(
      "../src/mcp/oauth-interactive-transaction.ts",
      import.meta.url,
    ),
  } as Record<string, URL>,
  callback: new URL("../src/auth/localhost-callback.ts", import.meta.url),
  esbuild: new URL(import.meta.resolve("esbuild")),
};
export type Input = Parameters<typeof Entry.runMcpInteractiveAuthorization>[0];
export type Provider = SDK.OAuthClientProvider;
export type Snapshot = Credentials.CanonicalCredentialSnapshot;
export type Ports = Pick<
  typeof Credentials,
  "loadCanonicalCredentials" | "publishCanonicalCredentials"
> &
  Pick<
    typeof Lease,
    | "tryAcquireAuthorizationLease"
    | "loadPendingAuthorization"
    | "publishPendingAuthorization"
    | "deletePendingAuthorizationIfOwned"
  > &
  Pick<typeof Callback, "createLocalhostOAuthCallbackServer"> &
  Pick<typeof Discovery, "loadDiscoveryRecord" | "saveDiscoveryRecord"> &
  Pick<typeof Timeout, "withTimeout"> &
  Pick<typeof SDK, "auth">;
type Call = { name: string; args: readonly unknown[] };
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
export async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = realSetTimeout(() => reject(new Error(`test gate expired: ${label}`)), 3000);
      }),
    ]);
  } finally {
    if (timer) realClearTimeout(timer);
  }
}
export async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection");
}
export const digest = (value: string) =>
  nativeCrypto.createHash("sha256").update(value).digest("hex");
export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    generation: "baseline-generation",
    raw: "owned-raw",
    clientInformation: { client_id: "persisted-old-client" },
    tokens: { access_token: "persisted-old-token", token_type: "Bearer" },
    ...overrides,
  };
}

export async function fixture() {
  const calls: Call[] = [];
  const watchers: { name: string; count: number; gate: ReturnType<typeof deferred<void>> }[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    for (const watch of watchers)
      if (watch.name === name && calls.filter((call) => call.name === name).length >= watch.count)
        watch.gate.resolve();
  };
  const unexpected = async (): Promise<never> => {
    throw new Error("unowned store access");
  };
  const store: SharedKnorviaCredentialStore = {
    filePath: nativeUrl.fileURLToPath(new URL("../owned-credentials.json", import.meta.url)),
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
  const input: Input = {
    config: { type: "authorization_code" },
    credentialStore: store,
    keyPrefix: "owned-prefix",
    serverName: "owned server",
    serverUrl: "https://resource.invalid/mcp",
    logger,
  };
  const baseline = snapshot();
  let current: Snapshot | undefined = baseline;
  const lease = {
    attemptId: "0123456789abcdef-owned-attempt",
    async release() {
      record("release");
    },
  };
  const callback: Callback.LocalhostOAuthCallbackServer = {
    callbackPath: "/owned-callback",
    callbackUrl: "http://127.0.0.1:45123/owned-callback",
    async close() {
      record("close");
    },
    async waitForCallback() {
      record("waitForCallback");
      return callbackValue;
    },
  };
  let callbackValue: Callback.LocalhostOAuthCallback = {
    code: "fallback-code",
    url: `${callback.callbackUrl}?code=url-code`,
  };
  const tokens: SDK.OAuthTokens = {
    access_token: "owned-access",
    token_type: "Bearer",
    refresh_token: "owned-refresh",
    expires_in: 3600,
  };
  const published = {
    generation: "abcdef0123456789-published",
    raw: "published",
    legacyClientRaw: "client",
    legacyTokensRaw: "tokens",
    canonical: {
      version: 2 as const,
      published_by: "owned",
      tokens,
      client_information: { client_id: "fresh-client" },
    },
  };
  const ports: Ports = {
    async loadCanonicalCredentials(...args) {
      record("loadCanonicalCredentials", ...args);
      return current;
    },
    async publishCanonicalCredentials(...args) {
      record("publishCanonicalCredentials", ...args);
      return published;
    },
    async tryAcquireAuthorizationLease(...args) {
      record("tryAcquireAuthorizationLease", ...args);
      return lease;
    },
    async loadPendingAuthorization(...args) {
      record("loadPendingAuthorization", ...args);
      return undefined;
    },
    async publishPendingAuthorization(...args) {
      record("publishPendingAuthorization", ...args);
    },
    async deletePendingAuthorizationIfOwned(...args) {
      record("deletePendingAuthorizationIfOwned", ...args);
      return false;
    },
    async createLocalhostOAuthCallbackServer(...args) {
      record("createLocalhostOAuthCallbackServer", ...args);
      return callback;
    },
    async loadDiscoveryRecord(...args) {
      record("loadDiscoveryRecord", ...args);
      return undefined;
    },
    async saveDiscoveryRecord(...args) {
      record("saveDiscoveryRecord", ...args);
    },
    async withTimeout<T>(promise: Promise<T>, ms: number, message: string, signal?: AbortSignal) {
      record("withTimeout", promise, ms, message, signal);
      return promise;
    },
    async auth(...args) {
      record("auth", ...args);
      return "AUTHORIZED";
    },
  };
  const routes: Record<string, unknown> = {
    "node:crypto": nativeCrypto,
    "node:url": nativeUrl,
    "node:timers": nativeTimers,
  };
  for (const [specifier, names] of [
    ["./oauth-credentials.js", ["loadCanonicalCredentials", "publishCanonicalCredentials"]],
    [
      "./oauth-lease.js",
      [
        "tryAcquireAuthorizationLease",
        "loadPendingAuthorization",
        "publishPendingAuthorization",
        "deletePendingAuthorizationIfOwned",
      ],
    ],
    ["../auth/localhost-callback.js", ["createLocalhostOAuthCallbackServer"]],
    ["./oauth-shared.js", ["loadDiscoveryRecord", "saveDiscoveryRecord"]],
    ["./timeout.js", ["withTimeout"]],
    ["@modelcontextprotocol/client", ["auth"]],
  ] as const)
    routes[specifier] = Object.fromEntries(
      names.map((name) => [
        name,
        (...args: unknown[]) => Reflect.apply(ports[name], undefined, args),
      ]),
    );
  const { transform } = (await import(targetUrls.esbuild.href)) as typeof import("esbuild");
  const factories = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  for (const [specifier, url] of [
    ["$entry", targetUrls.entry] as const,
    ...Object.entries(targetUrls.companions),
  ]) {
    const source = await readFile(url, "utf8");
    const output = await transform(source, {
      format: "cjs",
      loader: "ts",
      target: "node24",
      sourcefile: nativeUrl.fileURLToPath(url),
    });
    factories.set(specifier, output.code);
  }
  const requireOwned = (specifier: string): unknown => {
    if (Object.hasOwn(routes, specifier)) return routes[specifier];
    const cached = modules.get(specifier);
    if (cached) return cached.exports;
    const code = factories.get(specifier);
    assert.ok(code, `unapproved dependency: ${specifier}`);
    const module = { exports: {} as Record<string, unknown> };
    modules.set(specifier, module);
    new Function("require", "module", "exports", code)(requireOwned, module, module.exports);
    return module.exports;
  };
  const exports = requireOwned("$entry") as typeof Entry;
  const h = {
    input,
    store,
    logger,
    baseline,
    lease,
    callback,
    tokens,
    published,
    ports,
    calls,
    record,
    exports,
    run: () => exports.runMcpInteractiveAuthorization(input),
    get current() {
      return current;
    },
    set current(value: Snapshot | undefined) {
      current = value;
    },
    get callbackValue() {
      return callbackValue;
    },
    set callbackValue(value: Callback.LocalhostOAuthCallback) {
      callbackValue = value;
    },
    count: (name: string) => calls.filter((call) => call.name === name).length,
    names: () => calls.map((call) => call.name),
    called(name: string, count = 1) {
      const gate = deferred<void>();
      if (calls.filter((call) => call.name === name).length >= count) gate.resolve();
      else watchers.push({ name, count, gate });
      return bounded(gate.promise, `${name} #${count}`);
    },
    only<K extends keyof Ports>(name: K): Parameters<Ports[K]> {
      const matches = calls.filter((call) => call.name === name);
      assert.equal(matches.length, 1, name);
      return matches[0]!.args as Parameters<Ports[K]>;
    },
    provider() {
      const auth = calls.find((call) => call.name === "auth");
      assert.ok(auth);
      return auth.args[0] as Provider;
    },
    state() {
      return h.only("createLocalhostOAuthCallbackServer")[0].state;
    },
  };
  return h;
}
