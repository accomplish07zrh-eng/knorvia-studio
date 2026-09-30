// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export const PURE_NODE_BUILTINS = new Set([
  "node:assert",
  "node:buffer",
  "node:path",
  "node:string_decoder",
  "node:url",
  "node:util",
]);

export const CONTROLLED_NODE_BUILTINS = new Set([
  "crypto",
  "fs",
  "fs/promises",
  "node:crypto",
  "node:fs",
  "node:fs/promises",
  "node:os",
  "node:process",
  "node:timers",
  "node:timers/promises",
  "os",
  "process",
  "timers",
  "timers/promises",
]);

export const RETAINED_PACKAGES = new Set([
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@knorvia/contracts",
  "@knorvia/cua/frame-contract",
  "@knorvia/model-option-map",
  "@knorvia/provider",
  "@knorvia/shared",
  "@knorvia/shared/node",
  "ai",
]);

export const RETAINED_RELATIVE_SUFFIXES = [
  "/network/proxy-fetch.js",
  "/network/proxy-fetch.ts",
  "/device/cli-device-mid.js",
  "/device/cli-device-mid.ts",
] as const;
