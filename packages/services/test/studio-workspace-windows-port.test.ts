// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { promisify } from "node:util";

test("Windows readiness attributes only the exact owned loopback TCP listener without ambient credentials", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const previous = process.env.GH_TOKEN;
  Object.defineProperty(process, "platform", { value: "win32" });
  process.env.GH_TOKEN = "synthetic-port-probe";
  let stdout = "";
  const calls: Array<{
    file: string;
    args: string[];
    options: { env: NodeJS.ProcessEnv; timeout: number };
  }> = [];
  const execFile = Object.assign(() => {}, {
    [promisify.custom]: async (
      file: string,
      args: string[],
      options: (typeof calls)[number]["options"],
    ) => {
      calls.push({ file, args, options });
      return { stdout, stderr: "" };
    },
  });
  mock.module("node:child_process", { namedExports: { execFile } });
  try {
    const { workspaceRuntimeOwnsPort } =
      await import("../src/studio-runtime/adapters/workspaceRuntimeNetwork.js");
    const proof = {
      rootPid: 501,
      identities: [{ pid: 501, parentPid: 1, startToken: "a".repeat(64) }],
    };
    const cases: Array<[string, boolean]> = [
      ["TCP 127.0.0.1:43210 0.0.0.0:0 LISTENING 501", true],
      ["TCP 127.0.0.1:43211 0.0.0.0:0 LISTENING 501", false],
      ["TCP 127.0.0.1:43210 0.0.0.0:0 LISTENING 502", false],
      ["TCP 0.0.0.0:43210 0.0.0.0:0 LISTENING 501", false],
      ["TCP [::1]:43210 [::]:0 LISTENING 501", false],
      ["TCP 127.0.0.1:43210 127.0.0.1:65432 ESTABLISHED 501", false],
      ["TCP 127.0.0.1:43210 0.0.0.0:0 LISTENING 501extra", false],
      ["UDP 127.0.0.1:43210 0.0.0.0:0 LISTENING 501", false],
      ["TCP 127.0.0.1:43210 0.0.0.0:0 LISTENING 501 extra", false],
    ];
    for (const [row, expected] of cases) {
      stdout = `Active Connections\r\n  Proto Local Address Foreign Address State PID\r\n  ${row}\r\n`;
      assert.equal(await workspaceRuntimeOwnsPort(proof, 43210), expected, row);
    }
    assert.equal(await workspaceRuntimeOwnsPort({ rootPid: 501, identities: [] }, 43210), false);
    assert.equal(calls.length, cases.length);
    for (const call of calls) {
      assert.equal(call.file, "netstat.exe");
      assert.deepEqual(call.args, ["-ano", "-p", "TCP"]);
      assert.equal(call.options.timeout, 1500);
      assert.equal(call.options.env.GH_TOKEN, undefined);
    }
  } finally {
    Object.defineProperty(process, "platform", platform);
    if (previous === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previous;
    mock.restoreAll();
  }
});
