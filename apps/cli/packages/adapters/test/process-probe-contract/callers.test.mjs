// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { target } from "./subject.mjs";
import { bashFrame, mcpFrames } from "./caller-fixture.mjs";
const loaded = await target({ callerRoot: fileURLToPath(new URL("../../src/", import.meta.url)) });
after(() => loaded.dispose());
test("actual MCP consumer preserves sampled RSS/CPU and shared schema across two windows", () =>
  mcpFrames(loaded));
test("actual Bash consumer preserves group peaks/deltas, finish idempotence and shared schema", () =>
  bashFrame(loaded));
