import { fixtureSource } from "./windows-cua-smoke-fixture.mjs";
// Explicit desktop acceptance: only this process's disposable dark fixture may be controlled.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { createPackagedHost, runHostChecks } from "./windows-cua-smoke-host.mjs";

const execute = promisify(execFile);
const argv = process.argv.slice(2);
const scrollIndex = argv.indexOf("--scroll");
const scrollMode = scrollIndex !== -1;
if (scrollMode) argv.splice(scrollIndex, 1);
const evidenceIndex = argv.indexOf("--evidence");
let evidencePath;
if (evidenceIndex !== -1) {
  assert.equal(evidenceIndex, argv.length - 2, "--evidence <json> must be the last argument pair");
  evidencePath = resolve(argv[evidenceIndex + 1]);
  argv.splice(evidenceIndex, 2);
}
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Windows x64 required");
const hostMode = argv.length === 4 && argv[0] === "--host" && argv[2] === "--plugin-root";
if (scrollMode && !hostMode) throw new Error("--scroll requires --host and --plugin-root");
if (!hostMode && (argv.length !== 2 || argv[0] !== "--driver"))
  throw new Error(
    "Usage: windows-cua-driver-smoke.mjs --driver <exe> | --host <server.js> --plugin-root <plugin>",
  );
const executable = await realpath(resolve(argv[1]));
const pluginRoot = hostMode ? await realpath(resolve(argv[3])) : undefined;
const directory = await mkdtemp(resolve(tmpdir(), "knorvia-cua-driver-smoke-"));
const driverHome = resolve(directory, "driver-home");
await mkdir(driverHome);
const cancellation = new AbortController();
const cancel = () => cancellation.abort(new Error("Owned-window smoke interrupted"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const env = {};
for (const key of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "COMSPEC", "TEMP", "TMP"])
  if (process.env[key] !== undefined) env[key] = process.env[key];
Object.assign(env, {
  CUA_DRIVER_RS_HOME: driverHome,
  CUA_DRIVER_RS_TELEMETRY_ENABLED: "false",
  CUA_DRIVER_RS_UPDATE_CHECK: "false",
  CUA_DRIVER_PERMISSION_MODE: "standard",
});

function lineRequests(child, protocol) {
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let serial = 0;
  let fixtureRequest;
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4_096);
  });
  const rejectAll = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    fixtureRequest?.reject(error);
    fixtureRequest = undefined;
  };
  child.on("error", rejectAll);
  cancellation.signal.addEventListener("abort", () => rejectAll(cancellation.signal.reason), {
    once: true,
  });
  child.on("exit", (code) => rejectAll(new Error(`${protocol} exited (${code}): ${stderr}`)));
  child.stdin.on("error", rejectAll);
  lines.on("line", (line) => {
    try {
      assert.ok(Buffer.byteLength(line) <= 16 * 1024 * 1024, "Protocol line too large");
      const value = JSON.parse(line);
      if (protocol === "fixture") {
        const request = fixtureRequest;
        fixtureRequest = undefined;
        request?.resolve(value);
      } else if (value.id !== undefined) {
        const request = pending.get(value.id);
        pending.delete(value.id);
        if (value.error) request?.reject(new Error(JSON.stringify(value.error)));
        else request?.resolve(value.result);
      }
    } catch (error) {
      rejectAll(error);
    }
  });
  const wait = (send, timeoutMs = 30_000) =>
    new Promise((accept, reject) => {
      if (cancellation.signal.aborted) return reject(cancellation.signal.reason);
      const id = ++serial;
      const timeout = setTimeout(() => {
        pending.delete(id);
        fixtureRequest = undefined;
        reject(new Error(`${protocol} request timed out; no action was retried`));
      }, timeoutMs);
      const request = {
        resolve: (value) => {
          clearTimeout(timeout);
          accept(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
      if (protocol === "fixture") fixtureRequest = request;
      else pending.set(id, request);
      send(id);
    });
  return {
    lines,
    call: (method, params) =>
      wait((id) =>
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`),
      ),
    readFixture: (command) =>
      wait(() => {
        if (command) child.stdin.write(`${command}\n`);
      }, 10_000),
    notify: (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`),
  };
}

async function closeOwnedChild(child, close) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((accept) => child.once("exit", accept));
  close();
  const timeout = setTimeout(() => child.kill(), 2_000);
  await exited;
  clearTimeout(timeout);
}

let driver;
let fixture;
let mcp;
let fixtureIo;
let sessionStarted = false;
let connection;
const stages = [];
const evidence = { observations: [] };
let report;
try {
  let initialized;
  let call;
  if (hostMode) {
    connection = await createPackagedHost({
      host: executable,
      pluginRoot,
      directory,
      env,
      signal: cancellation.signal,
    });
  } else {
    driver = spawn(executable, ["mcp", "--direct", "--embedded"], {
      cwd: dirname(executable),
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    mcp = lineRequests(driver, "driver");
    initialized = await mcp.call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "knorvia-owned-window-smoke", version: "1" },
    });
    assert.equal(initialized.serverInfo.version, "0.30.1");
    mcp.notify("notifications/initialized");
    const descriptors = (await mcp.call("tools/list", {})).tools;
    for (const name of [
      "list_windows",
      "get_window_state",
      "type_text",
      "click",
      "start_session",
      "end_session",
    ])
      assert.ok(
        descriptors.some((tool) => tool.name === name),
        `Missing ${name}`,
      );
    call = async (name, args) => {
      const result = await mcp.call("tools/call", { name, arguments: args });
      const message = result.content
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      assert.notEqual(result.isError, true, `${name}: ${message?.slice(0, 1_000)}`);
      return result;
    };
    await call("start_session", {});
    sessionStarted = true;
  }
  const source = resolve(directory, "fixture.cs");
  const fixturePath = resolve(directory, "owned-fixture.exe");
  await writeFile(source, fixtureSource);
  await execute(
    resolve(process.env.SystemRoot || "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe"),
    [
      "/nologo",
      "/target:winexe",
      "/platform:x64",
      "/warnaserror+",
      "/utf8output",
      "/reference:System.Drawing.dll",
      "/reference:System.Windows.Forms.dll",
      "/reference:System.Web.Extensions.dll",
      `/out:${fixturePath}`,
      source,
    ],
    { windowsHide: true },
  );
  // 实机验收明确需要可见夹具；只显示此脚本创建的窗口。
  fixture = spawn(fixturePath, scrollMode ? ["--scroll"] : [], {
    windowsHide: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  fixtureIo = lineRequests(fixture, "fixture");
  const ready = await fixtureIo.readFixture();
  assert.equal(ready.ready, true);
  evidence.fixture = { pid: fixture.pid, ...ready };
  if (hostMode) {
    report = await runHostChecks({
      connection,
      fixturePid: fixture.pid,
      ready,
      readState: () => fixtureIo.readFixture("state"),
      stages,
      evidence,
    });
  } else {
    const exact = { pid: fixture.pid, window_id: ready.windowId };
    const listing = await call("list_windows", { pid: fixture.pid, on_screen_only: true });
    assert.ok(listing.structuredContent.windows.every((window) => window.pid === fixture.pid));
    assert.ok(
      listing.structuredContent.windows.some((window) => window.window_id === exact.window_id),
      `Owned HWND not enumerated: ${JSON.stringify({ exact, windows: listing.structuredContent.windows })}`,
    );
    evidence.listing = listing.structuredContent;
    stages.push("own-pid-and-window-enumeration");
    const observe = async (maxImageDimension = 0) => {
      const result = await call("get_window_state", {
        ...exact,
        include_screenshot: true,
        include_accessibility_tree: true,
        max_image_dimension: maxImageDimension,
        max_elements: 200,
        max_depth: 12,
        timeout_ms: 3_000,
      });
      const frame = result.content.find((part) => part.type === "image");
      assert.equal(frame?.mimeType, "image/png");
      const png = Buffer.from(frame.data, "base64");
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      const meta = result.structuredContent;
      assert.equal(png.readUInt32BE(16), meta.screenshot_width);
      assert.equal(png.readUInt32BE(20), meta.screenshot_height);
      assert.equal(meta.pid, exact.pid);
      assert.equal(meta.window_id, exact.window_id);
      // This metadata belongs exclusively to the disposable fixture; no image bytes are saved.
      evidence.observations.push({ maxImageDimension, ...meta });
      if (maxImageDimension === 0) {
        assert.equal(meta.screenshot_width, ready.captureBounds.width);
        assert.equal(meta.screenshot_height, ready.captureBounds.height);
      } else {
        assert.ok(Math.max(meta.screenshot_width, meta.screenshot_height) <= maxImageDimension);
      }
      return { meta, png };
    };
    const first = await observe();
    stages.push("window-png-native-dimensions");
    const inputElement = first.meta.elements.find(
      (element) => element.label === "Smoke Unicode input",
    );
    assert.ok(inputElement?.element_token, "Owned text input must expose a snapshot token");
    const text = "Knorvia 世界 😀";
    const typed = await call("type_text", {
      target: { kind: "window", ...exact },
      element_token: inputElement.element_token,
      text,
    });
    const waitForState = async (matches) => {
      let state;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        state = await fixtureIo.readFixture("state");
        if (matches(state)) return state;
        await delay(25);
      }
      assert.fail(`Owned fixture did not confirm input: ${JSON.stringify(state)}`);
    };
    await waitForState((state) => state.text === text);
    stages.push("unicode-type-and-independent-readback");
    const beforeClick = await observe(640);
    assert.equal(typeof beforeClick.meta.capture_id, "string");
    const clicked = await call("click", {
      target: { kind: "window", ...exact },
      capture_id: beforeClick.meta.capture_id,
      x:
        ((ready.buttonPoint.x - ready.captureBounds.x) * beforeClick.meta.screenshot_width) /
        ready.captureBounds.width,
      y:
        ((ready.buttonPoint.y - ready.captureBounds.y) * beforeClick.meta.screenshot_height) /
        ready.captureBounds.height,
      button: "left",
      count: 1,
    });
    const finalState = await waitForState((state) => state.clicks === 1);
    assert.equal(finalState.text, text);
    stages.push("resized-capture-bound-pixel-click-and-independent-readback");
    const after = await observe();
    assert.notDeepEqual(after.png, first.png);
    stages.push("post-action-window-screenshot");
    report = {
      passed: true,
      driver: executable,
      version: initialized.serverInfo.version,
      driverPid: driver.pid,
      fixturePid: fixture.pid,
      imageWidth: after.meta.screenshot_width,
      imageHeight: after.meta.screenshot_height,
      dpi: ready.dpi,
      typeEffect: typed.structuredContent?.effect,
      clickEffect: clicked.structuredContent?.effect,
      checks: stages,
    };
  }
  if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  report = {
    passed: false,
    ...(hostMode ? { host: executable } : { driver: executable }),
    checks: stages,
    error: error instanceof Error ? error.message : String(error),
    ...(error?.stdout ? { compilerOutput: String(error.stdout).slice(-4096) } : {}),
  };
  process.exitCode = 1;
} finally {
  if (sessionStarted && driver?.exitCode === null) {
    try {
      await mcp.call("tools/call", { name: "end_session", arguments: {} });
    } catch {
      /* Only our own driver process is terminated below if it cannot finish. */
    }
  }
  const cleanup = await Promise.allSettled([
    connection?.close(),
    closeOwnedChild(fixture, () => fixture.stdin.write("close\n")),
    closeOwnedChild(driver, () => driver.stdin.end()),
  ]);
  fixtureIo?.lines.close();
  mcp?.lines.close();
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
  const cleanupErrors = cleanup.filter((item) => item.status === "rejected");
  if (cleanupErrors.length) {
    report = {
      ...report,
      passed: false,
      cleanupErrors: cleanupErrors.map((item) => String(item.reason)),
    };
    process.exitCode = 1;
  }
  // Only remove the exact mkdtemp directory after all owned processes have exited.
  assert.ok(
    directory.startsWith(resolve(tmpdir(), "knorvia-cua-driver-smoke-")) &&
      dirname(directory) === resolve(tmpdir()),
  );
  assert.ok(resolve(driverHome).startsWith(directory + sep));
  if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      ...report,
      ...(hostMode ? { host: executable, pluginRoot } : {}),
      ownedProcessesClosed: cleanupErrors.length === 0,
    }),
  );
}
