// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export interface BashTimeoutPolicy {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
}

export const DEFAULT_BASH_TIMEOUT_MS = notImplemented("DEFAULT_BASH_TIMEOUT_MS");

export const DEFAULT_BASH_MAX_TIMEOUT_MS = notImplemented("DEFAULT_BASH_MAX_TIMEOUT_MS");

export const DEFAULT_BASH_TIMEOUT_POLICY: BashTimeoutPolicy = notImplemented(
  "DEFAULT_BASH_TIMEOUT_POLICY",
);

export function resolveBashTimeoutPolicy(
  env: Readonly<Record<string, string | undefined>>,
): BashTimeoutPolicy {
  throw new Error("not implemented: core-tool-01");
}

export function resolveBashTimeoutMs(
  inputTimeoutMs: number | undefined,
  policy: BashTimeoutPolicy,
): number {
  throw new Error("not implemented: core-tool-01");
}
