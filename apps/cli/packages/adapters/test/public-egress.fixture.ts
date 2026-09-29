// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HttpClientPortError } from "@knorvia/contracts";

type PolicyModule = typeof import("../src/http/public-egress-policy.js");
export type Resolver = ReturnType<PolicyModule["defaultPublicDnsLookup"]>;
export const target = new URL("../src/http/public-egress-policy.js", import.meta.url).href;
export const policy = (await import(target)) as PolicyModule;
export const url = "https://context.invalid:8443/resource";
export const publicRows = () => [
  { address: "8.8.8.8", family: 4 },
  { address: "2606:4700:4700::1111", family: 6 },
];
export { setImmediate as turn };
export function portError(error: unknown, message: string, expectedUrl = url) {
  assert.ok(error instanceof HttpClientPortError);
  assert.equal(error.name, "HttpClientPortError");
  assert.equal(error.code, "egress_blocked");
  assert.equal(error.message, message);
  assert.equal(error.url, expectedUrl);
  assert.equal(error.cause, undefined);
  assert.equal(error.status, undefined);
}
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  const result = await promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  return result.error;
}
export type RuntimeLookup = (
  hostname: string,
  options: unknown,
  callback?: (...args: unknown[]) => void,
) => void;
export async function lookup(
  hostname: string,
  resolver: Resolver,
  options: unknown = {},
  signal?: AbortSignal,
) {
  const result = Promise.withResolvers<unknown[]>();
  let count = 0,
    onStack = true,
    calledOnStack = false;
  const done = (...args: unknown[]) => {
    count++;
    calledOnStack = onStack;
    result.resolve(args);
  };
  const fn = policy.createPublicEgressLookup(url, resolver, { signal }) as RuntimeLookup;
  const returned = options === "two-arguments" ? fn(hostname, done) : fn(hostname, options, done);
  onStack = false;
  const args = await result.promise;
  await setImmediate();
  return {
    args,
    get count() {
      return count;
    },
    calledOnStack,
    returned,
  };
}
export async function isolated(mode: string) {
  assert.ok(target);
  const output: Buffer[] = [],
    errors: Buffer[] = [];
  const child = spawn(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("./public-egress-rejection-child.ts", import.meta.url)),
      target,
      mode,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    },
  );
  assert.equal(exit.code, 0, Buffer.concat(errors).toString());
  assert.equal(exit.signal, null);
  return JSON.parse(Buffer.concat(output).toString()) as {
    primary: boolean;
    unhandled: boolean[];
    calls: number;
    identity?: boolean;
  };
}
