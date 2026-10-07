// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceRuntimeEnvironment } from "../src/studio-runtime/domain/workspaceRuntimeEnvironment.js";
import { createWorkspaceRuntimePort } from "../src/studio-runtime/adapters/workspaceRuntimeProcess.js";
import { runtimeFixture } from "./studio-workspace-runtime-fixture.js";

const secretNames = [
  "GH_TOKEN",
  "gH_tOkEn",
  "OPENAI_API_KEY",
  "OpenAI_Api_Key",
  "AWS_SECRET_ACCESS_KEY",
  "aWs_SeCrEt_AcCeSs_KeY",
  "HTTP_PROXY",
  "NPM_CONFIG_USERCONFIG",
  "KNORVIA_DATA_BASE_DIR",
  "NODE_OPTIONS",
  "ELECTRON_RUN_AS_NODE",
  "UNRELATED_RUNTIME_SENTINEL",
];
const blocked = new Set(secretNames.map((name) => name.toUpperCase()));
function sentinels(t: TestContext) {
  const previous = { ...process.env };
  for (const name of secretNames) process.env[name] = "synthetic-runtime-sentinel";
  t.after(() => {
    for (const key of Object.keys(process.env))
      if (blocked.has(key.toUpperCase())) delete process.env[key];
    for (const [key, value] of Object.entries(previous))
      if (blocked.has(key.toUpperCase()) && value !== undefined) process.env[key] = value;
  });
}
const reportCode = `JSON.stringify({keys:Object.keys(process.env),host:process.env.HOST,port:process.env.PORT,workspacePort:process.env.KNORVIA_WORKSPACE_PORT,hasPath:typeof process.env.PATH==='string'||typeof process.env.Path==='string'})`;
const writeReport = `require('fs').writeFileSync('environment-report.json',${reportCode});`;
async function report(path: string) {
  return JSON.parse(await readFile(join(path, "environment-report.json"), "utf8"));
}
function assertSafe(
  value: { keys: string[]; host: string; port?: string; workspacePort?: string; hasPath: boolean },
  port?: number,
) {
  assert.deepEqual(
    value.keys.filter((key) => blocked.has(key.toUpperCase())),
    [],
  );
  assert.equal(value.host, "127.0.0.1");
  assert.equal(value.hasPath, true);
  assert.equal(value.port, port === undefined ? undefined : String(port));
  assert.equal(value.workspacePort, port === undefined ? undefined : String(port));
}

test("Windows projection matches runtime names case-insensitively and drops every unrelated credential alias", () => {
  const source: Record<string, string> = Object.fromEntries(
    secretNames.map((name) => [name, "synthetic-runtime-sentinel"]),
  );
  Object.assign(source, {
    pAtH: "C:/runtime",
    uSeRpRoFiLe: "C:/users/fixture",
    sYsTeMrOoT: "C:/Windows",
    cOmSpEc: "C:/Windows/System32/cmd.exe",
    tEmP: "C:/temp",
    HOST: "0.0.0.0",
    PORT: "9999",
    KNORVIA_WORKSPACE_PORT: "9999",
  });
  const env = workspaceRuntimeEnvironment(source, "win32", 49123);
  assert.deepEqual(
    Object.keys(env).filter((key) => blocked.has(key.toUpperCase())),
    [],
  );
  assert.equal(env.PATH, "C:/runtime");
  assert.equal(env.USERPROFILE, "C:/users/fixture");
  assert.equal(env.SystemRoot, "C:/Windows");
  assert.equal(env.ComSpec, "C:/Windows/System32/cmd.exe");
  assert.equal(env.TEMP, "C:/temp");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.PORT, "49123");
  assert.equal(env.KNORVIA_WORKSPACE_PORT, "49123");
  assert.equal(Object.keys(env).filter((key) => key.toUpperCase() === "PATH").length, 1);
  assert.equal(workspaceRuntimeEnvironment(source, "win32").PORT, undefined);
  assert.equal(workspaceRuntimeEnvironment(source, "win32").KNORVIA_WORKSPACE_PORT, undefined);
  assert.equal(
    workspaceRuntimeEnvironment(
      { PATH: "/bin", path: "/wrong", HOME: "/fixture", GH_TOKEN: "sentinel" },
      "posix",
    ).PATH,
    "/bin",
  );
});

test("direct runtime subprocess receives OS projection instead of ambient Host credentials", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("environment-direct");
  sentinels(t);
  const process = await createWorkspaceRuntimePort().spawn(
    a.working,
    { executable: globalThis.process.execPath, args: ["-e", writeReport] },
    undefined,
    () => {},
  );
  t.after(() => process.stop());
  assert.equal((await process.exited).code, 0);
  assertSafe(await report(a.working));
});

test("approved setup and its subprocess do not receive credential sentinels", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("environment-setup");
  sentinels(t);
  const childCode = `require('fs').writeFileSync('descendant-report.json',${reportCode})`;
  const command = {
    executable: process.execPath,
    args: [
      "-e",
      `${writeReport}const child=require('child_process').spawnSync(process.execPath,['-e',${JSON.stringify(childCode)}]);process.exit(child.status??1)`,
    ],
  };
  await a.request({ action: "prepare", approved: true, command });
  await a.wait("prepared");
  assertSafe(await report(a.working));
  assertSafe(JSON.parse(await readFile(join(a.working, "descendant-report.json"), "utf8")));
});

test("approved service receives only safe OS values plus its assigned loopback port", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("environment-service");
  sentinels(t);
  await a.prepare();
  await a.request({
    action: "start",
    approved: true,
    command: {
      executable: process.execPath,
      args: [
        "-e",
        `${writeReport}require('http').createServer((q,r)=>r.end('ok')).listen(Number(process.env.PORT),process.env.HOST)`,
      ],
    },
    timeoutMs: 5000,
  });
  const ready = await a.wait("ready");
  assertSafe(await report(a.working), ready.port);
  assert.equal(await (await fetch(ready.previewUrl!)).text(), "ok");
});
