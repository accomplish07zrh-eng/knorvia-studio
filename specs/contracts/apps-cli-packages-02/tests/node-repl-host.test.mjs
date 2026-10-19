// SPDX-License-Identifier: Apache-2.0
// node-repl-host（B37/B38）合同测试：只锁发布面与 tool-contract 常量/文本语义。
// 宿主实现与 broker-transaction.ts 不在本包合同内（known-differences.md §五.1、§六.6）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { load, packageDir, packageJson } from "./entry.mjs";

function pluginManifest() {
  return JSON.parse(
    readFileSync(join(packageDir("node-repl-host"), ".knorvia-plugin/plugin.json"), "utf8"),
  );
}

function assertIncludesAll(text, fragments, label) {
  const haystack = text.toLowerCase();
  for (const fragment of fragments) {
    assert.ok(haystack.includes(fragment.toLowerCase()), `${label} must express: ${fragment}`);
  }
}

test("B37 包清单、导出面与发布面", async () => {
  const manifest = packageJson("node-repl-host");
  assert.equal(manifest.name, "@knorvia/node-repl-host");
  assert.equal(manifest.version, "0.8.0");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.exports, {
    ".": "./src/server.ts",
    "./browser-bridge": "./src/browser-bridge.ts",
    "./cua-bridge": "./src/cua-bridge.ts",
    "./cua-broker": "./src/cua-broker.ts",
    "./result": "./src/result.ts",
    "./runtime-bridge": "./src/runtime-bridge.ts",
    "./tool-contract": "./src/tool-contract.ts",
  });
  assert.equal(manifest.scripts.build, "tsc && node scripts/build.mjs");

  const plugin = pluginManifest();
  assert.equal(plugin.name, "node-repl-host");
  assert.equal(plugin.version, "0.8.0");
  assert.equal(plugin.author.name, "Knorvia Studio");
  assert.equal(plugin.license, "SEE LICENSE IN docs/LICENSE.txt");

  const contract = await load("node-repl-host", "tool-contract");
  assert.equal(contract.NODE_REPL_SERVER_VERSION, manifest.version);
  assert.equal(contract.NODE_REPL_SERVER_VERSION, plugin.version);
});

test("B38 工具契约常量与文本", async () => {
  const {
    JS_TOOL_DESCRIPTION,
    NODE_REPL_DEFAULT_TIMEOUT_MS,
    NODE_REPL_SERVER_INSTRUCTIONS,
    NODE_REPL_SERVER_VERSION,
  } = await load("node-repl-host", "tool-contract");

  assert.equal(NODE_REPL_DEFAULT_TIMEOUT_MS, 60_000);
  assert.equal(typeof NODE_REPL_DEFAULT_TIMEOUT_MS, "number");
  assert.equal(NODE_REPL_SERVER_VERSION, "0.8.0");

  assert.equal(typeof NODE_REPL_SERVER_INSTRUCTIONS, "string");
  assert.equal(typeof JS_TOOL_DESCRIPTION, "string");
  assert.equal(NODE_REPL_SERVER_INSTRUCTIONS.split("\n").length, 8);
  assert.equal(JS_TOOL_DESCRIPTION.split("\n").length, 5);

  assertIncludesAll(
    NODE_REPL_SERVER_INSTRUCTIONS,
    [
      "isolated",
      "JavaScript cell",
      "per request",
      "Variables",
      "module state",
      "survive",
      "node:",
      "absolute file module URLs",
      "nodeRepl",
      "cwd",
      "homeDir",
      "tmpDir",
      "requestMeta",
      "write",
      "emitImage",
      "emitStructuredResult",
      "setResponseMeta",
      "observed facts",
      "Never fabricate",
      "computer_*",
      "temporary access",
      "screenshot",
      "one action",
      "verify",
      "user takeover",
      "unknown outcome",
      "Read-only page content",
      "evidence",
    ],
    "NODE_REPL_SERVER_INSTRUCTIONS",
  );

  assertIncludesAll(
    JS_TOOL_DESCRIPTION,
    [
      "code",
      "title",
      "user's language",
      "timeout_ms",
      "1",
      "120000",
      "60000",
      "imports",
      "browser",
      "console.log",
      "nodeRepl.write",
      "nodeRepl.emitImage(await tab.screenshot())",
      "image bytes",
      "report failures",
    ],
    "JS_TOOL_DESCRIPTION",
  );
});
