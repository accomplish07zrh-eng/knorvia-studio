// SPDX-License-Identifier: Apache-2.0
// 截图环境：真实 Web 前端开发服务器（packages/web 的 Vite 配置）+ 真实 @knorvia/server HTTP 入口，
// 数据目录指向固定夹具。不下载浏览器，不启动第二套 UI 壳。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { delimiter, dirname, join } from "node:path";
import { createServer as createViteServer } from "vite";

const SERVER_ENTRY = ["packages", "server", "dist", "entry-http.js"];
const READINESS_TIMEOUT_MS = 120_000;

let serverLog = [];
const MAX_LOG_LINES = 200;

function rememberServerOutput(chunk) {
  for (const line of String(chunk).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    serverLog.push(line);
    if (serverLog.length > MAX_LOG_LINES) serverLog.shift();
  }
}

/** 服务端输出尾部：就绪失败时附在错误里，避免只看到「等待超时」这类无用信息。 */
function serverOutputTail(lines = 40) {
  return serverLog.slice(-lines).join("\n");
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("无法分配空闲端口");
  return port;
}

async function waitForHttp(url, timeoutMs, isAlive) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (isAlive && !isAlive()) throw new Error("服务进程在就绪前退出");
    try {
      const response = await fetch(url, { redirect: "manual" });
      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `等待 ${url} 就绪超时：${lastError instanceof Error ? lastError.message : "unknown"}`,
  );
}

async function runServerBuild(repoRoot) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(command, ["--filter", "@knorvia/server", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    // Windows 上 Node 不允许直接 spawn .cmd（EINVAL），必须交给 shell；参数都是无空格的简单值。
    shell: process.platform === "win32",
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`@knorvia/server 构建失败，退出码 ${code}`);
}

function terminateTree(pid) {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // 落到通用 kill。
    }
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // 进程已经退出。
  }
}

/**
 * 等子进程真正退出。stdio 管道只要还开着就会让 Node 事件循环不结束，
 * 所以这里必须等到 exit 事件，必要时再补一次强杀。
 */
function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 已经退出。
      }
      resolve();
    }, 10_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    terminateTree(child.pid);
  });
}

/**
 * 启动完整 Web 开发环境。
 * 默认先构建 @knorvia/server：dist 是构建产物，残留一份旧构建会让截图连到与当前
 * 分支不一致的服务端（例如缺少构建期嵌入的 built-in provider config），这种失败很难看懂。
 * 返回 `{ webUrl, serverUrl, webPort, serverPort, stop, report }`。
 */
export async function startWebEnvironment({
  repoRoot,
  fixture,
  buildServer = true,
  log = () => {},
}) {
  const webRoot = join(repoRoot, "packages", "web");
  const serverEntry = join(repoRoot, ...SERVER_ENTRY);
  if (buildServer || !existsSync(serverEntry)) {
    log(`[ui-baseline] 构建 @knorvia/server（${serverEntry}）`);
    await runServerBuild(repoRoot);
  }
  const serverPort = await freePort();
  const childEnv = { ...process.env };
  // 夹具只走 KNORVIA_HOME；清掉可能继承的其它数据目录变量，避免写进真实用户数据。
  delete childEnv.KNORVIA_DATA_BASE_DIR;
  delete childEnv.KNORVIA_STORAGE_DIR;
  childEnv.PORT = String(serverPort);
  childEnv.KNORVIA_HOME = fixture.home;
  childEnv.KNORVIA_ENV = "test";
  delete childEnv.KNORVIA_WEB_STATIC_ROOT;
  // 外部 CLI 内核探测按 PATH、home 与 APPDATA/LOCALAPPDATA 下的固定目录找 CLI（~/.local/bin、
  // ~/.grok/bin、%LOCALAPPDATA%/Microsoft/WinGet/Links、%LOCALAPPDATA%/antigravity 等），
  // 并为每个候选起子进程做版本/协议探测（带超时）。同一提交两次运行可能一次探到、一次超时，
  // 界面因此不同（实测活动栏会晚 1s 左右多出一个内核图标）。把这些位置全部指向夹具：
  // 夹具状态固定为「没有安装任何外部内核」，基线也因此与本机装了哪些 CLI 无关。
  const fixtureBin = join(fixture.root, "bin");
  const fixtureHome = join(fixture.root, "os-home");
  const fixtureAppData = join(fixtureHome, "AppData", "Roaming");
  const fixtureLocalAppData = join(fixtureHome, "AppData", "Local");
  await mkdir(fixtureBin, { recursive: true });
  await mkdir(fixtureAppData, { recursive: true });
  await mkdir(fixtureLocalAppData, { recursive: true });
  const pathKey = Object.keys(childEnv).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  childEnv[pathKey] = [fixtureBin, dirname(process.execPath)].filter(Boolean).join(delimiter);
  if (process.platform === "win32") {
    childEnv.USERPROFILE = fixtureHome;
    childEnv.APPDATA = fixtureAppData;
    childEnv.LOCALAPPDATA = fixtureLocalAppData;
  } else {
    childEnv.HOME = fixtureHome;
    childEnv.XDG_DATA_HOME = join(fixtureHome, ".local", "share");
    childEnv.XDG_CACHE_HOME = join(fixtureHome, ".cache");
    childEnv.XDG_CONFIG_HOME = join(fixtureHome, ".config");
  }
  serverLog = [];
  const server = spawn(process.execPath, [serverEntry], {
    cwd: fixture.workspace,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", rememberServerOutput);
  server.stderr.on("data", rememberServerOutput);
  let serverExited = false;
  server.once("exit", () => {
    serverExited = true;
  });
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const vite = await createViteServer({
    configFile: join(webRoot, "vite.config.ts"),
    root: webRoot,
    logLevel: "error",
    cacheDir: join(fixture.root, "vite-cache"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      proxy: {
        "/ws": { target: `ws://127.0.0.1:${serverPort}`, ws: true },
        "/api": { target: serverUrl },
      },
    },
  });
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Vite 未监听 TCP 端口");
    const webUrl = `http://127.0.0.1:${address.port}`;
    try {
      await waitForHttp(serverUrl, READINESS_TIMEOUT_MS, () => !serverExited);
      await waitForHttp(webUrl, READINESS_TIMEOUT_MS, () => !serverExited);
    } catch (error) {
      const tail = serverOutputTail();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(tail ? `${message}\n--- 服务端输出尾部 ---\n${tail}` : message);
    }
    return {
      webUrl,
      serverUrl,
      webPort: address.port,
      serverPort,
      fixture,
      report: { serverPort: address.port },
      async stop() {
        await vite.close().catch(() => {});
        if (!serverExited && server.pid) await waitForExit(server);
        server.stdout?.destroy();
        server.stderr?.destroy();
      },
    };
  } catch (error) {
    await vite.close().catch(() => {});
    if (!serverExited && server.pid) await waitForExit(server);
    throw error;
  }
}
