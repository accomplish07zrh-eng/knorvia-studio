import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { connectOwnedMainInspector } from "./desktop-release-portable-launch.mjs";

test(
  "owned ESM inspector reads synchronously without console bootstrap extensions",
  { timeout: 15000 },
  async () => {
    const child = spawn(
      process.execPath,
      [
        "--inspect=127.0.0.1:0",
        "--input-type=module",
        "--eval",
        'process.on("message", message => { if(message === "close") process.disconnect(); });',
      ],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      },
    );
    const ended = once(child, "exit");
    let remote;
    try {
      let stderr = "";
      const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Owned Node inspector unavailable")), 5000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.stderr.on("data", (bytes) => {
          stderr += bytes;
          const match = stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/);
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        });
      });
      remote = await connectOwnedMainInspector(url);
      assert.deepEqual(
        await remote.evaluate(
          '({requireType:typeof require, helperType:typeof copy, moduleType:typeof process.getBuiltinModule("module").createRequire})',
        ),
        {
          requireType: "undefined",
          helperType: "undefined",
          moduleType: "function",
        },
      );
      assert.deepEqual(
        await remote.evaluate('({ready:false, bootstrap:"node-module-api-pending"})'),
        { ready: false, bootstrap: "node-module-api-pending" },
      );
      // 同步协议不等一个永不 resolve 的 Promise；错误也不能被启动轮询吞掉。
      assert.deepEqual(await remote.evaluate("new Promise(() => {})"), {});
      await assert.rejects(
        remote.evaluate('(() => { throw new Error("owned fixture exception"); })()'),
        /owned fixture exception/,
      );
      remote.close();
      remote = undefined;
      child.send("close");
      let timer;
      const result = await Promise.race([
        ended,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Owned inspector fixture did not exit normally")),
            5000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      assert.deepEqual(result, [0, null]);
    } finally {
      remote?.close();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await ended.catch(() => {});
    }
  },
);
