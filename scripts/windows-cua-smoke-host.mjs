// Explicit desktop acceptance only; never import this helper into a product runtime.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(
  resolve(import.meta.dirname, "../apps/cli/packages/node-repl-host/package.json"),
);

export async function createPackagedHost({ host, pluginRoot, directory, env, signal }) {
  const { Client } = require("@modelcontextprotocol/client");
  const { StdioClientTransport } = require("@modelcontextprotocol/client/stdio");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [host],
    cwd: dirname(host),
    stderr: "pipe",
    maxBufferSize: 16 * 1024 * 1024,
    env: {
      ...env,
      KNORVIA_WINDOWS_COMPUTER_USE: "1",
      KNORVIA_CUA_PLUGIN_ROOT: pluginRoot,
    },
  });
  // Only bounded errors are retained; window enumeration and image content are never logged.
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4096);
  });
  const client = new Client(
    { name: "knorvia-owned-window-host-smoke", version: "1" },
    { versionNegotiation: { mode: "auto", probe: { timeoutMs: 5000 } } },
  );
  const context = {
    session_id: `smoke-session-${randomUUID()}`,
    turn_id: `smoke-turn-${randomUUID()}`,
    workspace_key: directory,
    workspace_path: directory,
    runtime_scope: "main",
    client_mode: "desktop-continuous",
    delivery_kind: "desktop-continuous",
  };
  const call = (name, args) => {
    signal.throwIfAborted();
    // Test-only injection simulates trusted Host dispatch AFTER approval, not UI approval itself.
    return client.callTool(
      {
        name,
        arguments: args,
        _meta: { "com.knorvia-studio/request-context": context },
      },
      { signal, timeout: 25000, maxTotalTimeout: 25000 },
    );
  };
  const close = async () => {
    await client.close();
    await transport.close();
  };
  try {
    signal.throwIfAborted();
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    for (const name of ["list_windows", "request_access", "observe", "action", "stop"])
      assert.ok(
        tools.some((tool) => tool.name === `computer_${name}`),
        `Missing computer_${name}`,
      );
    return { call, close, pid: transport.pid, version: client.getServerVersion()?.version };
  } catch (error) {
    await close();
    throw new Error(`Packaged host initialization failed: ${error.message}; ${stderr}`, {
      cause: error,
    });
  }
}

function successful(result, name) {
  assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result.structuredContent)}`);
  return result;
}

function frame(result, windowId) {
  const images = result.content.filter((part) => part.type === "image");
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
  const png = Buffer.from(images[0].data, "base64");
  assert.ok(png.length <= 8 * 1024 * 1024);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const meta = result.structuredContent;
  assert.equal(meta.windowId, windowId);
  assert.equal(png.readUInt32BE(16), meta.imageWidth);
  assert.equal(png.readUInt32BE(20), meta.imageHeight);
  assert.ok(Math.max(meta.imageWidth, meta.imageHeight) <= 1600);
  assert.equal(typeof meta.observationId, "string");
  assert.ok(Number.isSafeInteger(meta.observationVersion));
  return { png, meta };
}

export async function runHostChecks({
  connection,
  fixturePid,
  ready,
  readState,
  stages,
  evidence,
}) {
  const call = async (name, args) => successful(await connection.call(name, args), name);
  const listing = await call("computer_list_windows", {});
  // Other window titles remain in memory only; never select a title or a guessed handle.
  const owned = listing.structuredContent.windows.filter((window) => window.pid === fixturePid);
  assert.equal(owned.length, 1, "Expected exactly one visible window owned by the fixture PID");
  evidence.listing = { windows: owned };
  const windowId = owned[0].windowId;
  stages.push("host-own-pid-and-opaque-window-enumeration");
  const access = await call("computer_request_access", {
    windowId,
    reason: "Owned test fixture only; this harness simulates Host dispatch after user approval.",
  });
  const first = frame(access, windowId);
  evidence.observations.push(first.meta);
  assert.equal(first.meta.status, "access_granted");
  const observed = frame(await call("computer_observe", { windowId }), windowId);
  evidence.observations.push(observed.meta);
  assert.ok(observed.meta.observationVersion > first.meta.observationVersion);
  if (ready.scroll) {
    assert.ok(ready.captureBounds.width > 1600, "Fixture must force screenshot downscaling");
    assert.equal(observed.meta.imageWidth, 1600);
    assert.ok(observed.meta.imageHeight < ready.captureBounds.height);
  } else {
    assert.equal(observed.meta.imageWidth, ready.captureBounds.width);
    assert.equal(observed.meta.imageHeight, ready.captureBounds.height);
  }
  stages.push("host-approved-scope-simulation-and-exact-window-png");
  const input = observed.meta.accessibility?.elements.find(
    (element) => element.label === "Smoke Unicode input",
  );
  assert.ok(input?.elementToken, "Owned input must have a current accessibility token");
  const actionArgs = (observation, action) => ({
    requestId: `smoke-${randomUUID()}`,
    windowId,
    observationId: observation.meta.observationId,
    observationVersion: observation.meta.observationVersion,
    action,
  });
  const text = "Knorvia 世界 😀";
  const typed = await call(
    "computer_action",
    actionArgs(observed, { type: "type_text", text, elementToken: input.elementToken }),
  );
  const waitForState = async (matches) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = await readState();
      if (matches(state)) return state;
      await delay(25);
    }
    assert.fail("Owned fixture did not confirm the action; no input was retried");
  };
  await waitForState((state) => state.text === text);
  const beforeClick = frame(typed, windowId);
  evidence.observations.push(beforeClick.meta);
  assert.ok(beforeClick.meta.observationVersion > observed.meta.observationVersion);
  stages.push("host-unicode-type-and-independent-readback");
  const point = {
    type: "click",
    x:
      ((ready.buttonPoint.x - ready.captureBounds.x) * beforeClick.meta.imageWidth) /
      ready.captureBounds.width,
    y:
      ((ready.buttonPoint.y - ready.captureBounds.y) * beforeClick.meta.imageHeight) /
      ready.captureBounds.height,
  };
  const clicked = await call("computer_action", actionArgs(beforeClick, point));
  let state = await waitForState((value) => value.clicks === 1);
  assert.equal(state.text, text);
  let after = frame(clicked, windowId);
  evidence.observations.push(after.meta);
  assert.ok(after.meta.observationVersion > beforeClick.meta.observationVersion);
  assert.notDeepEqual(after.png, first.png);
  stages.push("host-current-image-pixel-click-independent-readback-and-new-png");
  let scrollResult;
  if (ready.scroll) {
    assert.equal(state.scrollTop, 0);
    assert.equal(state.wheelEvents, 0);
    const scrolled = await call(
      "computer_action",
      actionArgs(after, {
        type: "scroll",
        x:
          ((ready.scrollPoint.x - ready.captureBounds.x) * after.meta.imageWidth) /
          ready.captureBounds.width,
        y:
          ((ready.scrollPoint.y - ready.captureBounds.y) * after.meta.imageHeight) /
          ready.captureBounds.height,
        direction: "down",
        amount: 3,
        deliveryMode: "foreground",
      }),
    );
    state = await waitForState((value) => value.scrollTop > 0 && value.wheelEvents > 0);
    assert.ok(Math.abs(state.wheelPoint.x - ready.scrollPoint.x) <= 2);
    assert.ok(Math.abs(state.wheelPoint.y - ready.scrollPoint.y) <= 2);
    assert.equal(state.clicks, 1);
    assert.equal(state.text, text);
    const latest = frame(scrolled, windowId);
    assert.ok(latest.meta.observationVersion > after.meta.observationVersion);
    assert.notDeepEqual(latest.png, after.png);
    after = latest;
    evidence.observations.push(after.meta);
    scrollResult = {
      nativeWidth: ready.captureBounds.width,
      nativeHeight: ready.captureBounds.height,
      scrollTop: state.scrollTop,
      wheelEvents: state.wheelEvents,
      expectedScreenPoint: ready.scrollPoint,
      actualScreenPoint: state.wheelPoint,
      effect: scrolled.structuredContent.effect,
      delivery: scrolled.structuredContent.delivery,
    };
    evidence.scroll = scrollResult;
    stages.push("host-downscaled-image-foreground-scroll-and-independent-list-position");
  }
  const stopped = await call("computer_stop", {});
  assert.equal(stopped.structuredContent.status, "stopped");
  const denied = await connection.call("computer_action", actionArgs(after, point));
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.code, "turn_stopped");
  assert.equal(denied.structuredContent.dispatched, false);
  assert.deepEqual(await readState(), state);
  stages.push("host-stop-and-subsequent-action-denied-with-unchanged-fixture");
  return {
    passed: true,
    mode: "packaged-host",
    approval: "simulated-trusted-host-dispatch-after-approval",
    uiApprovalE2E: false,
    modelInference: false,
    hostPid: connection.pid,
    version: connection.version,
    fixturePid,
    imageWidth: after.meta.imageWidth,
    imageHeight: after.meta.imageHeight,
    dpi: ready.dpi,
    typeEffect: typed.structuredContent.effect,
    clickEffect: clicked.structuredContent.effect,
    ...(scrollResult ? { scroll: scrollResult } : {}),
    checks: stages,
  };
}
