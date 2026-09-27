import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packagedRuntimeEvidence } from "./packaged-runtime-evidence.mjs";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(repoRoot, "packages/desktop/package.json"));
const { _electron } = require("playwright-core");

/** 只运行真实打包程序；显式便携根优先于包内标记，绝不使用桌面用户的 data。 */
export async function packagedProbe(name, executable) {
  executable = resolve(executable || "");
  assert(existsSync(executable) && executable.endsWith(".exe"), "Pass a packaged executable");
  const root = await mkdtemp(join(tmpdir(), `knorvia-${name}-`));
  const result = {
    executable,
    root,
    status: "running",
    checks: [],
    pageErrors: [],
    resourceErrors: [],
  };
  result.packageEvidence = await packagedRuntimeEvidence(executable);
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "ComSpec", "TEMP", "TMP"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    PATH: [
      dirname(process.execPath),
      join(process.env.SystemRoot || "C:/Windows", "System32"),
      join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0"),
    ].join(";"),
    KNORVIA_ENV: "production",
    KNORVIA_PORTABLE_DIR: root,
    HOME: root,
    USERPROFILE: root,
    APPDATA: join(root, "AppData/Roaming"),
    LOCALAPPDATA: join(root, "AppData/Local"),
    KNORVIA_DATA_BASE_DIR: join(root, "data"),
    KNORVIA_HOME: join(root, "data/.knorvia-studio"),
    KNORVIA_STORAGE_DIR: join(root, "data/.knorvia-studio"),
    KNORVIA_BASE_URL: "http://127.0.0.1:9",
    KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
  });
  let app;
  let page;
  const dataRoot = join(root, "data");
  await mkdir(dataRoot);
  await mkdir(env.APPDATA, { recursive: true });
  await mkdir(env.LOCALAPPDATA, { recursive: true });
  const processIds = [];
  async function close() {
    if (!app) return;
    const current = app;
    const child = current.process();
    let timer;
    try {
      await Promise.race([
        current.close(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Owned test process ${child.pid} did not quit within 20s`)),
            20_000,
          );
        }),
      ]);
      assert(
        child.exitCode !== null || child.signalCode !== null,
        "Reopen requires real process exit",
      );
      result.closedProcesses = [
        ...(result.closedProcesses ?? []),
        { pid: child.pid, exitCode: child.exitCode, signal: child.signalCode },
      ];
    } catch (error) {
      // 只清理本脚本持有的临时应用进程；超时永远是失败，不能当成正常重开通过。
      child.kill();
      throw error;
    } finally {
      clearTimeout(timer);
      app = undefined;
    }
  }
  return {
    root,
    dataRoot,
    result,
    get page() {
      return page;
    },
    get app() {
      return app;
    },
    pass(message) {
      result.checks.push(message);
      console.log(`PASS ${message}`);
    },
    async open() {
      assert(!app, "Close the previous process before reopening");
      console.log(`Opening isolated package: ${root}`);
      app = await _electron.launch({
        executablePath: executable,
        cwd: dirname(executable),
        env,
        timeout: 90_000,
      });
      const pid = app.process().pid;
      assert(!processIds.includes(pid), "Reopening must start a new process");
      processIds.push(pid);
      result.processIds = [...processIds];
      result.identity = await app.evaluate(
        ({ app: electronApp, BrowserWindow, session, dialog }) => {
          const original = dialog.showMessageBoxSync.bind(dialog);
          // production 退出时会有原生阻塞确认。仅在隔离测试中回答这个确切问题，
          // 仍执行真实 quit/Host 清理；其他对话框不冒充成功。
          dialog.showMessageBoxSync = (...args) => {
            const options = args.at(-1);
            if (
              ["Confirm Quit", "退出确认"].includes(options.title) &&
              /Knorvia Studio/.test(options.message)
            ) {
              return options.buttons.findIndex((button) => button === "Quit" || button === "退出");
            }
            return original(...args);
          };
          const hide = (win) => {
            win.webContents.setBackgroundThrottling(false);
            win.on("show", () => win.hide());
            win.hide();
          };
          BrowserWindow.getAllWindows().forEach(hide);
          electronApp.on("browser-window-created", (_event, win) => hide(win));
          session.defaultSession.webRequest.onBeforeRequest(
            { urls: ["http://*/*", "https://*/*"] },
            ({ url }, callback) =>
              callback({
                cancel: !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
              }),
          );
          return {
            packaged: electronApp.isPackaged,
            userData: electronApp.getPath("userData"),
            version: electronApp.getVersion(),
            resourcesPath: process.resourcesPath,
          };
        },
      );
      assert.equal(result.identity.packaged, true);
      assert.equal(resolve(result.identity.resourcesPath), result.packageEvidence.resourcesPath);
      assert.equal(resolve(result.identity.userData), resolve(dataRoot, "profile"));
      page = await app.firstWindow({ timeout: 90_000 });
      page.setDefaultTimeout(45_000);
      page.on("pageerror", (error) => result.pageErrors.push(error.message));
      page.on("requestfailed", (request) => {
        if (request.url().startsWith("file:")) result.resourceErrors.push(request.url());
      });
      const cdp = await app.context().newCDPSession(page);
      await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      return page;
    },
    close,
    async finish(error) {
      if (error) {
        result.error = error.stack || String(error);
        if (page && !page.isClosed())
          result.lastPage = (
            await page
              .locator("body")
              .innerText()
              .catch(() => "")
          ).slice(-8000);
      }
      await writeFile(join(root, "result.json"), JSON.stringify(result, null, 2));
      try {
        await close();
      } catch (closeError) {
        error ??= closeError;
        result.error ??= closeError.stack;
      }
      if (!error) {
        try {
          assert.deepEqual(result.pageErrors, []);
          assert.deepEqual(result.resourceErrors, []);
        } catch (validationError) {
          error = validationError;
          result.error = validationError.stack;
        }
      }
      result.status = error ? "failed" : "passed";
      await writeFile(join(root, "result.json"), JSON.stringify(result, null, 2));
      console.log(`Result: ${join(root, "result.json")}`);
      if (error) throw error;
    },
  };
}

export async function completeOnboarding(page) {
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++)
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  await page.getByTestId("studio-first-run-later").click();
  await page.getByTestId("studio-first-run-guide").waitFor({ state: "hidden" });
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
