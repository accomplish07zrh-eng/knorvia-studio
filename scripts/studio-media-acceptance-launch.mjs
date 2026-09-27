import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
const { chromium } = createRequire(import.meta.url)("playwright-core");

// Packaged Electron ignores --require. Pause before Main, install the test-only guard,
// then resume the unchanged packaged entry. Both debugger endpoints stay on loopback.
export async function launchGuardedPackage({ executable, guard, env }) {
  const child = spawn(executable, ["--inspect-brk=0", "--remote-debugging-port=0"], {
    cwd: dirname(executable),
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  let node;
  let browser;
  let sequence = 0;
  const pending = new Map();
  const events = [];
  const wait = async (check, label) => {
    const end = Date.now() + 90_000;
    while (Date.now() < end) {
      if (child.exitCode !== null) throw new Error(`Package exited: ${stderr.slice(-3000)}`);
      const value = check();
      if (value) return value;
      await sleep(50);
    }
    throw new Error(`${label}: ${stderr.slice(-3000)}`);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      node.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (fn) => {
    const response = await send("Runtime.evaluate", {
      expression: `(${fn.toString()})(require("electron"))`,
      includeCommandLineAPI: true,
      awaitPromise: true,
      returnByValue: true,
    });
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  try {
    const nodeUrl = await wait(
      () => /Debugger listening on (ws:\/\/[^\s]+)/.exec(stderr)?.[1],
      "Node debugger",
    );
    node = new WebSocket(nodeUrl);
    await new Promise((resolve, reject) => {
      node.addEventListener("open", resolve, { once: true });
      node.addEventListener("error", reject, { once: true });
    });
    node.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
        else request?.resolve(message.result);
      } else events.push(message);
    });
    node.addEventListener("close", () => {
      for (const request of pending.values()) request.reject(new Error("Main inspector closed"));
      pending.clear();
    });
    await send("Debugger.enable");
    await send("Runtime.runIfWaitingForDebugger");
    await wait(
      () => events.find((event) => event.method === "Debugger.paused"),
      "Main entry breakpoint",
    );
    const injected = await send("Runtime.evaluate", {
      expression: `require(${JSON.stringify(guard)})`,
      includeCommandLineAPI: true,
      returnByValue: true,
    });
    assert(!injected.exceptionDetails, JSON.stringify(injected.exceptionDetails));
    await send("Debugger.resume");
    const browserUrl = await wait(
      () => /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)?.[1],
      "Renderer debugger",
    );
    browser = await chromium.connectOverCDP(browserUrl);
    const context = browser.contexts()[0];
    return {
      evaluate,
      context: () => context,
      firstWindow: () => wait(() => context.pages()[0], "First packaged window"),
      close: async () => {
        await Promise.race([
          evaluate(({ app, dialog }) => {
            const original = dialog.showMessageBoxSync.bind(dialog);
            dialog.showMessageBoxSync = (...args) => {
              const options = args.at(-1);
              if (
                ["Confirm Quit", "退出确认"].includes(options.title) &&
                /Knorvia Studio/.test(options.message)
              )
                return options.buttons.findIndex(
                  (button) => button === "Quit" || button === "退出",
                );
              return original(...args);
            };
            app.quit();
          }).catch(() => {}),
          sleep(1000),
        ]);
        node.close();
        await browser.close().catch(() => {});
        const end = Date.now() + 20_000;
        while (child.exitCode === null && Date.now() < end) await sleep(50);
        if (child.exitCode === null) {
          child.kill();
          throw new Error("Package needed forced termination");
        }
        assert.equal(child.exitCode, 0, "Packaged application must exit cleanly");
        return { pid: child.pid, exitCode: child.exitCode };
      },
    };
  } catch (error) {
    node?.close();
    await browser?.close().catch(() => {});
    child.kill();
    throw error;
  }
}
