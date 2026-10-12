// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function isRecord(value: unknown): value is Record<string, unknown> {
  throw new Error("not implemented: core-tool-01");
}

export function summarizeInput(input: unknown): Record<string, unknown> {
  throw new Error("not implemented: core-tool-01");
}

export function previewHookValue(value: unknown): string {
  throw new Error("not implemented: core-tool-01");
}
