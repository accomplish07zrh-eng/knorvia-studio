import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { buildNodeReplHostBundle } from "../scripts/build.mjs";
import { WINDOWS_CUA_ARTIFACT } from "../../../../../packages/cua/windows-artifact.js";

let directory, client, transport, loader;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "knorvia-windows-host-test-"));
  const src = resolve(import.meta.dirname, "../src");
  const output = join(directory, "fixture.mjs");
  const hostOutput = join(directory, "host.mjs");
  await buildNodeReplHostBundle({ outfile: hostOutput });
  await build({
    stdin: {
      contents: `import { createNodeReplMcpRuntime } from ${JSON.stringify(pathToFileURL(hostOutput).href)};
import { serveStdio } from '@modelcontextprotocol/server/stdio';
const windowsRuntime = {
  listTools: () => [{name:'computer_observe',description:'fixture only',inputSchema:{type:'object'}}],
  execute: async (input) => ({content:[{type:'text',text:JSON.stringify(input.context)}],structuredContent:{fixture:true}}),
  dispose: async () => {}, closeSession: async () => {}
};
serveStdio(() => createNodeReplMcpRuntime({windowsRuntime}).server,{legacy:'reject'});`,
      resolveDir: src,
      sourcefile: "fixture.ts",
      loader: "ts",
    },
    outfile: output,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    external: ["file:*"],
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });
  await build({
    entryPoints: [join(src, "windows-computer.ts")],
    outfile: join(directory, "loader.mjs"),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
  });
  loader = await import(pathToFileURL(join(directory, "loader.mjs")).href);
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [output],
    stderr: "pipe",
    env: { KNORVIA_WINDOWS_COMPUTER_USE: "0" },
  });
  client = new Client(
    { name: "offline-windows-host", version: "1" },
    { versionNegotiation: { mode: "auto", probe: { timeoutMs: 5000 } } },
  );
  await client.connect(transport);
});
after(async () => {
  await client?.close();
  await transport?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("dedicated computer tools preserve trusted request context and ignore forged input scope", async () => {
  assert.deepEqual(
    (await client.listTools()).tools.map((t) => t.name),
    ["computer_observe", "js"],
  );
  const result = await client.callTool({
    name: "computer_observe",
    arguments: { sessionId: "forged", approved: true },
    _meta: {
      "com.knorvia-studio/request-context": {
        session_id: "session",
        turn_id: "turn",
        workspace_key: "workspace",
        runtime_scope: "main",
        client_mode: "desktop-continuous",
        delivery_kind: "desktop-continuous",
      },
    },
  });
  const context = JSON.parse(result.content[0].text);
  assert.equal(context.sessionId, "session");
  assert.equal(context.turnId, "turn");
  assert.equal(context.workspaceKey, "workspace");
  assert.equal(context.runtimeScope, "main");
  assert.equal(context.clientMode, "desktop-continuous");
  assert.equal(context.approved, undefined);
});

test("missing desktop identity does not acquire main-scope defaults", async () => {
  const result = await client.callTool({ name: "computer_observe", arguments: {} });
  const context = JSON.parse(result.content[0].text);
  assert.equal(context.sessionId, "");
  assert.equal(context.runtimeScope, "subagent");
  assert.equal(context.clientMode, "web-remote-replayable");
});

test("disabled/unsupported/malformed or untrusted binary cannot expose computer tools", async () => {
  const root = join(directory, "plugin");
  await mkdir(join(root, ".knorvia-plugin"), { recursive: true });
  await mkdir(join(root, "dist/windows"), { recursive: true });
  await writeFile(
    join(root, ".knorvia-plugin/plugin.json"),
    JSON.stringify({ name: "computer-use", version: "0.7.0" }),
  );
  const bytes = Buffer.from("not an executable: availability must not launch it");
  await writeFile(join(root, "dist/windows/knorvia-computer-driver.exe"), bytes);
  await writeFile(
    join(root, "dist/windows/driver.json"),
    JSON.stringify({
      schemaVersion: 1,
      inputIsolation: "independent",
      platform: "win32",
      arch: "x64",
      filename: "knorvia-computer-driver.exe",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }),
  );
  const env = { KNORVIA_CUA_PLUGIN_ROOT: root, KNORVIA_WINDOWS_COMPUTER_USE: "1" };
  assert.equal(
    await loader.captureWindowsComputerRuntime(
      { ...env, KNORVIA_WINDOWS_COMPUTER_USE: "0" },
      "win32",
      "x64",
    ),
    undefined,
  );
  assert.equal(await loader.captureWindowsComputerRuntime(env, "linux", "x64"), undefined);
  assert.equal(await loader.captureWindowsComputerRuntime(env, "win32", "arm64"), undefined);
  // 旧原型即使自带正确的自身摘要也不能被当成正式第三方驱动。
  assert.equal(await loader.captureWindowsComputerRuntime(env, "win32", "x64"), undefined);
  const manifestPath = join(root, "dist/windows/driver.json");
  const manifest = {
    schemaVersion: 2,
    backend: "cua-driver",
    platform: "win32",
    arch: "x64",
    filename: "cua-driver.exe",
    version: WINDOWS_CUA_ARTIFACT.version,
    archiveSha256: WINDOWS_CUA_ARTIFACT.sha256,
    files: WINDOWS_CUA_ARTIFACT.files,
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  for (const filename of Object.keys(WINDOWS_CUA_ARTIFACT.files))
    await writeFile(join(root, "dist/windows", filename), bytes);
  assert.equal(await loader.captureWindowsComputerRuntime(env, "win32", "x64"), undefined);
  // 同时伪造 manifest 摘要和二进制仍不满足固定官方发布摘要。
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      files: Object.fromEntries(
        Object.keys(WINDOWS_CUA_ARTIFACT.files).map((name) => [
          name,
          createHash("sha256").update(bytes).digest("hex"),
        ]),
      ),
    }),
  );
  assert.equal(await loader.captureWindowsComputerRuntime(env, "win32", "x64"), undefined);
});
