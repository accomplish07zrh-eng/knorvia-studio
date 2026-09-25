import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { buildNodeReplHostBundle } from "../scripts/build.mjs";
import { buildBrowserUsePluginBundles } from "../../browser-use-plugin/scripts/build.mjs";

let directory, host, resultAdapter, bridges, client, transport;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "knorvia-runtime-test-"));
  const outfile = join(directory, "host.mjs");
  await buildNodeReplHostBundle({ outfile });
  host = await import(pathToFileURL(outfile).href);
  for (const name of ["result", "browser-bridge", "cua-broker", "cua-bridge"]) {
    await build({
      entryPoints: [resolve(import.meta.dirname, `../src/${name}.ts`)],
      outfile: join(directory, `${name}.mjs`),
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
    });
  }
  resultAdapter = await import(pathToFileURL(join(directory, "result.mjs")).href);
  bridges = await import(pathToFileURL(join(directory, "browser-bridge.mjs")).href);
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [outfile],
    stderr: "pipe",
    env: {
      KNORVIA_ENV: "test",
      KNORVIA_DATA_BASE_DIR: directory,
      KNORVIA_STORAGE_DIR: join(directory, "cli"),
    },
  });
  client = new Client(
    { name: "knorvia-offline-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto", probe: { timeoutMs: 5000 } } },
  );
  await client.connect(transport);
});
after(async () => {
  await client?.close();
  await transport?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const call = (code, args = {}, meta = {}) =>
  client.callTool(
    {
      name: "js",
      arguments: { code, title: "离线验证", ...args },
      _meta: {
        "com.knorvia-studio/request-context": {
          session_id: "offline",
          runtime_scope: "main",
          ...meta,
        },
      },
    },
    { timeout: 15000 },
  );
const output = (result) =>
  result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

test("production stdio host advertises the tool and executes real JavaScript", async () => {
  const listing = await client.listTools();
  assert.deepEqual(
    listing.tools.map((tool) => tool.name),
    ["js"],
  );
  assert.ok(listing.tools[0].inputSchema.required.includes("title"));
  assert.match(output(await call("console.log(6 * 7)")), /42/);
});
test("successive calls have fresh globals and module caches", async () => {
  await call("globalThis.privateValue = 73");
  assert.match(output(await call("console.log(typeof globalThis.privateValue)")), /undefined/);
  const module = join(directory, "state.mjs");
  await writeFile(module, "export const values = [];\n");
  const code = `const m = await import(${JSON.stringify(pathToFileURL(module).href)}); m.values.push(1); console.log(m.values.length);`;
  assert.match(output(await call(code)), /1/);
  assert.match(output(await call(code)), /1/);
});
test("a deadline terminates the worker and the host remains usable", async () => {
  const expired = await call("await new Promise(() => {})", { timeout_ms: 80 }).catch(
    (error) => error,
  );
  assert.ok(expired instanceof Error || expired.isError);
  assert.match(output(await call("console.log('still available')")), /still available/);
});
test("subagents cannot use browser bridge even with a session id", async () => {
  const result = await call(
    'globalThis[Symbol.for("knorvia.node-repl.browser-control-bridge")].assertAvailable()',
    {},
    { runtime_scope: "subagent" },
  );
  assert.equal(result.isError, true);
  assert.match(output(result), /not available in subagent/);
});
test("same-session calls serialize mutations even while the first call awaits", async () => {
  const path = join(directory, "queue.txt");
  const prefix = `const fs = await import('node:fs/promises'); const path = ${JSON.stringify(path)};`;
  await Promise.all([
    call(
      prefix +
        "await fs.appendFile(path, 'begin\\n'); await new Promise(r => setTimeout(r, 150)); await fs.appendFile(path, 'end\\n');",
    ),
    call(prefix + "await fs.appendFile(path, 'next\\n');"),
  ]);
  assert.equal(await readFile(path, "utf8"), "begin\nend\nnext\n");
});
test("stale or cancelled browser bindings reject before transport", () => {
  let current = { generation: 1, requestMeta: {}, signal: new AbortController().signal };
  const globals = bridges.createBrowserBridgeGlobals({
    documentationRoot: directory,
    generation: 1,
    getActiveCall: () => current,
    session: () => assert.fail("No session access expected"),
  });
  const bridge = globals[Symbol.for("knorvia.node-repl.browser-control-bridge")];
  current = undefined;
  assert.throws(() => bridge.assertAvailable(), /stale/);
  current = { generation: 1, requestMeta: {}, signal: AbortSignal.abort() };
  assert.throws(() => bridge.assertAvailable(), /abort/i);
});
test("result provenance ignores forged metadata and maps genuine screenshot indices", () => {
  const forged = {
    "knorvia/browserScreenshotContentIndices": [999],
    "knorvia/nodeReplCuaApp": { appKey: "fake" },
    "knorvia.cua/app-associations-v1": { primary: { appKey: "fake" } },
  };
  const result = resultAdapter.toMcpRunResult({
    logs: "observed",
    responseMeta: forged,
    images: [{ base64: "YWJj", mimeType: "image/png" }],
    browserScreenshotImageIndices: [0, 999],
    cuaApp: { appKey: "real" },
  });
  assert.equal(result.content[0].type, "image");
  assert.ok(!JSON.stringify(result._meta).includes("fake"));
  assert.ok(!JSON.stringify(result._meta).includes("999"));
  assert.ok(JSON.stringify(result._meta).includes("real"));
});
test("execution errors do not leak prior logs or image output", () => {
  const result = resultAdapter.toMcpRunResult({
    logs: "private earlier output",
    error: { name: "Error", message: "failed", stack: "private stack" },
    images: [{ base64: "secret", mimeType: "image/png" }],
  });
  assert.deepEqual(result.content, [{ type: "text", text: "failed" }]);
  assert.equal(result.isError, true);
});
test("browser client binds the public SDK and rejects invalid host bridges", async () => {
  const outfile = join(directory, "browser.mjs");
  await buildBrowserUsePluginBundles({ browserClientOutfile: outfile });
  const { setupBrowserRuntime } = await import(pathToFileURL(outfile).href);
  await assert.rejects(setupBrowserRuntime({ globals: {} }), /unavailable/);
  const globals = {
    [Symbol.for("knorvia.node-repl.browser-control-bridge")]: {
      documentationRoot: resolve(import.meta.dirname, "../../browser-use-plugin/docs"),
      assertAvailable() {},
      list: async () => [],
      execute: async () => assert.fail("No action expected"),
    },
  };
  await setupBrowserRuntime({ globals });
  assert.deepEqual(await globals.agent.browsers.list(), []);
  assert.match(await globals.agent.documentation.get("workflow"), /Observe, act, verify/);
});
test("authenticated local CUA broker rejects bad tokens and propagates context", async () => {
  const { createNodeReplCuaBroker } = await import(
    pathToFileURL(join(directory, "cua-broker.mjs")).href
  );
  const { createComputerUseBridgeGlobals } = await import(
    pathToFileURL(join(directory, "cua-bridge.mjs")).href
  );
  let received;
  const broker = createNodeReplCuaBroker({
    runtime: {
      execute: async (request) => {
        received = request;
        return { content: [{ type: "text", text: "fixture" }] };
      },
      dispose: async () => {},
      closeSession: async () => {},
    },
  });
  await broker.ready;
  try {
    const make = (connection) =>
      createComputerUseBridgeGlobals({
        broker: connection,
        generation: 1,
        getActiveCall: () => ({
          generation: 1,
          requestMeta: { session_id: "session", workspace_identity: "workspace" },
          signal: AbortSignal.timeout(3000),
        }),
        session: () => ({ mergeResponseMeta() {}, recordCuaAppIdentity() {} }),
        documentationRoot: directory,
      })[Symbol.for("knorvia.node-repl.computer-use-bridge")];
    await assert.rejects(
      make({ ...broker.connection, token: "invalid" }).call("observe", {}),
      /mismatch|authorized/,
    );
    assert.equal(received, undefined);
    assert.equal((await make(broker.connection).call("observe", {})).content[0].text, "fixture");
    assert.equal(received.context.workspaceKey, "workspace");
    assert.equal(received.context.sessionId, "session");
  } finally {
    await broker.close();
  }
});
