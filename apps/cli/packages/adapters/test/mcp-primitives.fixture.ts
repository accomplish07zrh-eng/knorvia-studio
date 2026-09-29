// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const primitiveUrls = {
  descriptor: new URL("../src/mcp/descriptor.ts", import.meta.url).href,
  timeout: new URL("../src/mcp/timeout.ts", import.meta.url).href,
};

export const descriptor = (await import(
  primitiveUrls.descriptor
)) as typeof import("../src/mcp/descriptor.js");
export const timeout = (await import(
  primitiveUrls.timeout
)) as typeof import("../src/mcp/timeout.js");
