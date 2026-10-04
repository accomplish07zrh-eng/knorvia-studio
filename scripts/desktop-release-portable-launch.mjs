// Actual launcher/profile acceptance in an owned hosted-runner fixture.
// Node-inspector transport and quit-dialog selection follow the existing
// studio-media-acceptance-launch.mjs; no packaged application file is edited.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function unusedPort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done, fail) => server.close((error) => (error ? fail(error) : done())));
  return port;
}

export async function connectOwnedMainInspector(url) {
  const socket = new WebSocket(url);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.fail(new Error(JSON.stringify(message.error)));
    else request.done(message.result);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.fail(new Error("Owned Main inspector closed"));
    }
    pending.clear();
  });
  return {
    evaluate: async (expression) => {
      const result = await new Promise((done, fail) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          fail(new Error("Owned inspector request timed out"));
        }, 10000);
        pending.set(id, { done, fail, timer });
        socket.send(
          JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: {
              expression,
              // 显式加载器不依赖 console 扩展；过早安装扩展会访问尚未初始化的 argv。
              includeCommandLineAPI: false,
              // 两个表达式均同步；bootstrap 时等待 inspector Promise 会被 GC 中断。
              awaitPromise: false,
              returnByValue: true,
            },
          }),
        );
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    close: () => socket.close(),
  };
}

const stateExpression = `(() => {
  // inspector 可早于 Node 全局与 Electron browser 初始化；先等原生 owner 的完成标记。
  if(typeof process==="undefined" || process.type!=="browser" || typeof process.resourcesPath!=="string")
    return {ready:false,bootstrap:"electron-browser-process-pending"};
  // pinned browser/init.ts 在 app/API 设置完成、加载应用入口之前删除此属性。
  if("appCodeLoaded" in process) return {ready:false,bootstrap:"electron-browser-entry-pending"};
  // 打包 Main 是 ESM，inspector 没有全局 require；从实际 ASAR 创建加载器。
  if(typeof process.getBuiltinModule!=="function") return {ready:false, bootstrap:"node-module-api-pending"};
  const module=process.getBuiltinModule("module");
  // inspector 可早于 Electron bootstrap 接入；等真实别名注册，不吞运行时异常。
  if(!module?._cache?.electron) return {ready:false, bootstrap:"electron-module-pending"};
  const require=module.createRequire(process.resourcesPath+"/app.asar/package.json");
  const {app,BrowserWindow}=require("electron");
  // 路径查询可创建默认 userData；ready/data owner 就绪前不调用窗口、版本或路径 API。
  const ready=app.isReady(), base=process.env.KNORVIA_DATA_BASE_DIR;
  if(!ready || !base) return {ready:false,bootstrap:"app-ready-and-data-owner-pending",base};
  return {pid:process.pid, ready, windows:BrowserWindow.getAllWindows().length,
    version:app.getVersion(), executable:process.execPath, resourcesPath:process.resourcesPath,
    userData:app.getPath("userData"), portableDirectory:process.env.KNORVIA_PORTABLE_DIR,
    base:process.env.KNORVIA_DATA_BASE_DIR, home:process.env.KNORVIA_HOME,
    storage:process.env.KNORVIA_STORAGE_DIR, launcherDirectory:process.env.PORTABLE_EXECUTABLE_DIR,
    appImage:process.env.APPIMAGE};
})()`;
const quitExpression = `(() => {
  const require=process.getBuiltinModule("module").createRequire(process.resourcesPath+"/app.asar/package.json");
  const {app,dialog}=require("electron"); const original=dialog.showMessageBoxSync.bind(dialog);
  dialog.showMessageBoxSync=(...args)=>{const o=args.at(-1);
    if(["Confirm Quit","退出确认"].includes(o.title)&&/Knorvia Studio/.test(o.message))
      return o.buttons.findIndex(b=>b==="Quit"||b==="退出"); return original(...args);};
  app.quit();
})()`;

export async function probePortableLaunch({
  executable,
  expectedBase,
  fixture,
  version,
  captureDirectory,
}) {
  const report = {
    status: "running",
    launches: [],
    checks: [],
    limits: [
      "Actual packaged window creation and Main paths, not human visual GUI acceptance",
      "Synthetic fixture sentinel, not complete existing-user migration",
      "Probe selects only the owned app's quit-confirmation button",
    ],
  };
  const fixtureRelative = relative(fixture, expectedBase);
  assert.ok(
    fixtureRelative &&
      !isAbsolute(fixtureRelative) &&
      fixtureRelative !== ".." &&
      !fixtureRelative.startsWith(".." + sep),
  );
  const probeRoot = await mkdtemp(join(fixture, "portable-launch-probe-"));
  const sentinel = join(expectedBase, "release-portable-sentinel.txt");
  const database = join(expectedBase, "release-portable-sentinel.sqlite");
  const sentinelBytes = Buffer.from("portable launcher owns persistent data\n");
  for (let iteration = 0; iteration < 2; iteration++) {
    const root = join(probeRoot, `launch-${iteration}`);
    await mkdir(root);
    const appdata = join(root, "appdata"),
      localappdata = join(root, "localappdata");
    await mkdir(appdata);
    await mkdir(localappdata);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(?:PATH|PATHEXT|SystemRoot|WINDIR|ComSpec|DISPLAY|XAUTHORITY|USERPROFILE|USERNAME)$/i.test(
          key,
        ),
      ),
    );
    Object.assign(env, {
      APPDATA: appdata,
      LOCALAPPDATA: localappdata,
      XDG_CONFIG_HOME: appdata,
      TMPDIR: root,
      TEMP: root,
      TMP: root,
      NODE_OPTIONS: "",
      NODE_PATH: "",
      KNORVIA_ENV: "production",
      KNORVIA_RUNTIME_ENV: "production",
      KNORVIA_BASE_URL: "http://127.0.0.1:9",
      KNORVIA_MODEL_TELEMETRY_ENABLED: "0",
      KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
    });
    if (executable.endsWith(".AppImage")) env.APPIMAGE_EXTRACT_AND_RUN = "1";
    const port = await unusedPort();
    const args = [
      `--inspect=${port}`,
      ...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : []),
    ];
    const child = spawn(executable, args, {
      env,
      cwd: dirname(executable),
      detached: process.platform === "linux",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let spawnError;
    const closed = new Promise((done) => {
      // 启动失败也归入本探针的失败记录，避免等 inspector 时出现未处理的 Promise 拒绝。
      child.once("error", (error) => {
        spawnError = error;
        done({ error });
      });
      child.once("close", (code, signal) => done({ code, signal }));
    });
    let stderr = "",
      stdout = "";
    child.stdout.on("data", (bytes) => {
      stdout = (stdout + bytes).slice(-1024 * 1024);
    });
    child.stderr.on("data", (bytes) => {
      stderr = (stderr + bytes).slice(-1024 * 1024);
    });
    let remote;
    let phase = "inspector-endpoint",
      lastState,
      requests = 0;
    try {
      const deadline = Date.now() + 90000;
      while (!remote && Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(`Portable launcher exited before Main inspector: ${stderr}`);
        try {
          const targets = await (
            await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
          ).json();
          const target = targets.find((item) => item.webSocketDebuggerUrl);
          if (target) {
            const endpoint = new URL(target.webSocketDebuggerUrl);
            assert.equal(endpoint.hostname, "127.0.0.1");
            assert.equal(endpoint.port, String(port));
            remote = await connectOwnedMainInspector(target.webSocketDebuggerUrl);
          }
        } catch {
          /* Startup polling ends at the explicit deadline; no acceptance is skipped. */
        }
        if (!remote) await delay(100);
      }
      assert.ok(remote, `Main inspector unavailable: ${stderr}`);
      let state;
      phase = "window-state";
      while (Date.now() < deadline) {
        requests++;
        state = await remote.evaluate(stateExpression);
        lastState = state;
        if (state.ready && state.windows > 0 && state.base) break;
        await delay(100);
      }
      assert.ok(
        state?.ready && state.windows > 0,
        `Packaged Electron did not create a window: ${JSON.stringify(state)}; ${stderr}`,
      );
      assert.equal(state.version, version);
      assert.equal(
        relative(expectedBase, state.base),
        "",
        "Real portable Main base must stay beside original launcher",
      );
      assert.equal(relative(join(expectedBase, "profile"), state.userData), "");
      assert.equal(relative(dirname(expectedBase), state.portableDirectory), "");
      assert.equal(relative(join(expectedBase, ".knorvia-studio"), state.home), "");
      assert.equal(state.storage, state.home);
      if (captureDirectory && iteration === 0) {
        await cp(dirname(state.executable), captureDirectory, {
          recursive: true,
          verbatimSymlinks: true,
        });
        report.capturedApplication = captureDirectory;
      }
      report.launches.push({
        iteration,
        wrapperPid: child.pid,
        main: state,
        inspectorPort: port,
        stderr,
        stdout,
      });
      phase = "normal-quit";
      await remote.evaluate(quitExpression).catch((error) => {
        if (!/inspector closed/.test(error.message)) throw error;
      });
      remote.close();
      remote = undefined;
      let timer;
      const ended = await Promise.race([
        closed,
        new Promise((_, fail) => {
          timer = setTimeout(
            () => fail(new Error("Owned portable app did not quit normally within 30s")),
            30000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      assert.deepEqual(ended, { code: 0, signal: null });
      report.launches.at(-1).ended = ended;
      if (iteration === 0) {
        await writeFile(sentinel, sentinelBytes);
        const db = new DatabaseSync(database);
        try {
          db.exec("CREATE TABLE release_portable_sentinel (value TEXT NOT NULL)");
          db.prepare("INSERT INTO release_portable_sentinel VALUES (?)").run("preserved");
        } finally {
          db.close();
        }
      } else {
        assert.deepEqual(await readFile(sentinel), sentinelBytes);
        const db = new DatabaseSync(database);
        try {
          assert.equal(
            db.prepare("SELECT value FROM release_portable_sentinel").get().value,
            "preserved",
          );
        } finally {
          db.close();
        }
      }
    } catch (error) {
      remote?.close();
      if (Number.isInteger(child.pid) && child.exitCode === null && child.signalCode === null) {
        if (process.platform === "win32")
          await exec("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
        else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {}
        }
        // 等自己的进程关闭再删 DLL；SIGTERM 无响应时只升级自己的进程组。
        const didClose = await Promise.race([
          closed.then(() => true),
          delay(3000).then(() => false),
        ]);
        if (!didClose && process.platform === "linux") {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
          await Promise.race([closed, delay(3000)]);
        }
        if (!didClose && process.platform === "win32")
          report.cleanupError = "Owned process pipes did not close after taskkill";
      }
      report.status = "failed";
      report.error = error.stack || String(error);
      report.stderr = stderr;
      report.stdout = stdout;
      report.failurePhase = { iteration, phase, requests, lastState, wrapperPid: child.pid };
      throw Object.assign(error, { report });
    }
  }
  report.status = "passed";
  report.checks = [
    "Actual portable artifact starts a packaged Electron window twice without explicit Knorvia profile overrides",
    "Actual Main profile and shared environment remain beside the original launcher",
    "Owned fixture file and SQLite sentinel survive both normal launches/quits",
  ];
  return report;
}
