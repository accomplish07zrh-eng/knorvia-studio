import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import test from "node:test";
import {
  createWindowsComputerDriver,
  type WindowsDriverRequest,
} from "../../cua/windows-runtime.js";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=";
function pngSize(width: number, height: number) {
  const chunk = (name: string, bytes: Buffer) => {
    const label = Buffer.from(name);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([label, bytes])));
    return Buffer.concat([length, label, bytes, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((width + 1) * height))),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
const window = {
  window_id: 123,
  pid: 42,
  title: "隔离测试😀",
  bounds: { x: -800, y: 40, width: 800, height: 600 },
  is_on_screen: true,
  minimized: false,
};
type Rpc = {
  id?: number;
  method?: string;
  params?: { name: string; arguments: Record<string, unknown> };
};
class ProcessDouble extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  onKill = () => {
    queueMicrotask(() => this.emit("close", null));
  };
  kill() {
    this.killed = true;
    this.onKill();
    return true;
  }
  send(message: unknown, fragmented = false) {
    const bytes = Buffer.from(JSON.stringify(message) + "\n");
    if (fragmented)
      for (let i = 0; i < bytes.length; i += 3) this.stdout.write(bytes.subarray(i, i + 3));
    else this.stdout.write(bytes);
  }
}
function setup(
  options: {
    onRpc?: (child: ProcessDouble, rpc: Rpc) => boolean;
    maxOutputBytes?: number;
    version?: string;
    effect?: string;
    now?: () => number;
  } = {},
) {
  const children: ProcessDouble[] = [];
  const calls: Rpc[] = [];
  const spawns: unknown[][] = [];
  let token = 0;
  const spawn = (...args: unknown[]) => {
    spawns.push(args);
    const child = new ProcessDouble();
    children.push(child);
    let input = "";
    child.stdin.on("data", (chunk) => {
      input += chunk.toString();
      while (input.includes("\n")) {
        const boundary = input.indexOf("\n");
        const rpc = JSON.parse(input.slice(0, boundary)) as Rpc;
        input = input.slice(boundary + 1);
        calls.push(rpc);
        queueMicrotask(() => {
          if (options.onRpc?.(child, rpc)) return;
          if (rpc.id === undefined || !rpc.method) return;
          if (rpc.method === "initialize") {
            child.send({
              jsonrpc: "2.0",
              id: rpc.id,
              result: {
                protocolVersion: "2025-06-18",
                serverInfo: { name: "cua-driver", version: options.version ?? "0.30.1" },
                capabilities: { tools: {} },
              },
            });
            return;
          }
          const name = rpc.params?.name;
          const value =
            name === "list_windows"
              ? { windows: [window] }
              : name === "get_window_state"
                ? {
                    pid: window.pid,
                    window_id: window.window_id,
                    window_title: window.title,
                    window_bounds: window.bounds,
                    screenshot_width: 1,
                    screenshot_height: 1,
                    screenshot_frame_valid: true,
                    snapshot_id: `snapshot-${++token}`,
                    capture_id: `capture-${token}`,
                    elements: [
                      {
                        element_index: 1,
                        role: "button",
                        label: "提交",
                        depth: 0,
                        element_token: `token-${token}`,
                      },
                    ],
                    elements_complete: true,
                  }
                : {
                    effect: options.effect ?? "confirmed",
                    route: "accessibility",
                    delivery: {
                      mode: "background",
                      ...(options.effect === "partial" ? { delivered_count: 1 } : {}),
                    },
                  };
          child.send(
            {
              jsonrpc: "2.0",
              id: rpc.id,
              result: {
                structuredContent: value,
                content: [
                  ...(name === "get_window_state"
                    ? [{ type: "image", mimeType: "image/png", data: png }]
                    : []),
                  { type: "text", text: JSON.stringify(value) },
                ],
              },
            },
            true,
          );
        });
      }
    });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const driver = createWindowsComputerDriver({
    platform: "win32",
    driverPath: resolve("fixed-cua-driver.exe"),
    spawn: spawn as unknown as typeof import("node:child_process").spawn,
    maxOutputBytes: options.maxOutputBytes,
    now: options.now,
  });
  const call = (
    method: WindowsDriverRequest["method"],
    params: Record<string, unknown> = {},
    signal = new AbortController().signal,
    scopeId = "test",
    timeoutMs = 1000,
  ) => driver({ method, params }, { signal, timeoutMs, scopeId });
  const observe = async (scopeId = "test") => {
    const listed = (await call("list_windows", {}, undefined, scopeId)) as {
      windows: Array<{ windowId: string; pid: number; driverGeneration: string }>;
    };
    const target = listed.windows[0]!;
    return (await call(
      "observe",
      {
        windowId: target.windowId,
        identity: { pid: target.pid, driverGeneration: target.driverGeneration },
      },
      undefined,
      scopeId,
    )) as {
      window: Record<string, unknown>;
      frame: Record<string, unknown>;
      accessibility: { elements: Array<{ elementToken: string }> };
    };
  };
  return { driver, call, observe, calls, children, spawns };
}

test("fixed Cua stdio handshake uses isolated home, disabled telemetry/update and preserves fragmented UTF8", async () => {
  const f = setup();
  try {
    const list = (await f.call("list_windows")) as { windows: Array<{ title: string }> };
    assert.equal(list.windows[0]?.title, window.title);
    assert.deepEqual(f.spawns[0]!.slice(0, 2), [
      resolve("fixed-cua-driver.exe"),
      ["mcp", "--direct", "--embedded"],
    ]);
    const config = f.spawns[0]![2] as {
      shell: boolean;
      windowsHide: boolean;
      env: Record<string, string>;
      cwd: string;
    };
    assert.equal(config.shell, false);
    assert.equal(config.windowsHide, true);
    assert.equal(config.env.CUA_DRIVER_RS_TELEMETRY_ENABLED, "false");
    assert.equal(config.env.CUA_DRIVER_RS_UPDATE_CHECK, "false");
    assert.equal(config.env.CUA_DRIVER_RS_HOME, config.cwd);
    assert.equal(config.env.CUA_DRIVER_PERMISSION_MODE, "standard");
    assert.equal(f.calls.filter((rpc) => rpc.method === "initialize").length, 1);
    await f.call("list_windows");
    assert.equal(f.children.length, 1);
  } finally {
    await f.driver.dispose!();
  }
  assert.equal(f.children[0]!.killed, true);
});

test("Cua screenshot/token mapping preserves exact image coordinates and never refreshes a snapshot before action", async () => {
  const f = setup();
  try {
    const observed = await f.observe();
    assert.equal(observed.accessibility.elements[0]!.elementToken, "token-1");
    await f.call("act", {
      ...observed,
      action: { type: "click", x: 0.5, y: 0.75, deliveryMode: "foreground" },
    });
    const click = f.calls.find((rpc) => rpc.params?.name === "click")!.params!.arguments;
    assert.deepEqual(click, {
      target: { kind: "window", pid: 42, window_id: 123 },
      delivery_mode: "foreground",
      x: 0.5,
      y: 0.75,
      count: 1,
      button: "left",
      capture_id: "capture-1",
    });
    const next = await f.observe();
    await f.call("act", {
      ...next,
      action: {
        type: "type_text",
        text: "hello 世界",
        elementToken: next.accessibility.elements[0]!.elementToken,
      },
    });
    const typed = f.calls.find((rpc) => rpc.params?.name === "type_text")!.params!.arguments;
    assert.equal(typed.element_token, "token-2");
    assert.equal(typed.snapshot_id, "snapshot-2");
    assert.equal(typed.x, undefined);
    assert.equal(typed.capture_id, undefined);
    assert.equal(f.calls.filter((rpc) => rpc.params?.name === "get_window_state").length, 2);
  } finally {
    await f.driver.dispose!();
  }
});

test("mature action effect is preserved; unknown tool errors never claim zero dispatch", async () => {
  for (const effect of ["confirmed", "partial", "unverifiable", "suspected_noop"]) {
    const f = setup({ effect });
    try {
      const observed = await f.observe();
      const value = (await f.call("act", {
        ...observed,
        action: { type: "click", x: 0, y: 0 },
      })) as { effect: string };
      assert.equal(value.effect, effect);
    } finally {
      await f.driver.dispose!();
    }
  }
  for (const explicit of [true, false]) {
    const f = setup({
      onRpc(child, rpc) {
        if (rpc.params?.name !== "click") return false;
        child.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            isError: true,
            content: [],
            structuredContent: explicit
              ? {
                  effect: "refused",
                  route: "synthetic_events",
                  error: { code: "background_unavailable" },
                }
              : { code: "input_failed", message: "sensitive" },
          },
        });
        return true;
      },
    });
    try {
      const observed = await f.observe();
      await assert.rejects(
        f.call("act", { ...observed, action: { type: "click", x: 0, y: 0 } }),
        (error: unknown) => {
          const e = error as { dispatched: boolean; message: string };
          assert.equal(e.dispatched, !explicit);
          assert.equal(e.message.includes("sensitive"), false);
          return true;
        },
      );
    } finally {
      await f.driver.dispose!();
    }
  }
});

test("stop during dispatched MCP action kills immediately and waits for close", async () => {
  let entered!: () => void;
  const ready = new Promise<void>((resolveReady) => {
    entered = resolveReady;
  });
  const f = setup({
    onRpc(child, rpc) {
      if (rpc.params?.name !== "click") return false;
      child.onKill = () => {};
      entered();
      return true;
    },
  });
  const observed = await f.observe();
  const controller = new AbortController();
  const output = f.call(
    "act",
    { ...observed, action: { type: "click", x: 0, y: 0 } },
    controller.signal,
  );
  let settled = false;
  output.catch(() => {
    settled = true;
  });
  await ready;
  controller.abort();
  assert.equal(f.children[0]!.killed, true);
  await Promise.resolve();
  assert.equal(settled, false);
  f.children[0]!.emit("close", null);
  await assert.rejects(output, { outcome: "unknown", dispatched: true });
  await f.driver.dispose!();
});

test("separate scopes own transports and stopping one does not retain or affect another grant", async () => {
  const f = setup();
  try {
    const a = await f.observe("one");
    const b = await f.observe("two");
    assert.notEqual(a.window.driverGeneration, b.window.driverGeneration);
    await f.driver.closeScope!("one");
    assert.equal(f.children[0]!.killed, true);
    assert.equal(f.children[1]!.killed, false);
    await assert.rejects(
      f.call("act", { ...a, action: { type: "click", x: 0, y: 0 } }, undefined, "one"),
      { code: "window_changed", dispatched: false },
    );
    await f.call("act", { ...b, action: { type: "click", x: 0, y: 0 } }, undefined, "two");
    await f.call("list_windows", {}, undefined, "three");
    await f.call("list_windows", {}, undefined, "four");
    await assert.rejects(f.call("list_windows", {}, undefined, "five"), { code: "driver_busy" });
  } finally {
    await f.driver.dispose!();
  }
});

test("version mismatch, malformed NDJSON, unrelated response and output limits close the owned process", async () => {
  const version = setup({ version: "0.30.2" });
  await assert.rejects(version.call("list_windows"), { code: "driver_version_mismatch" });
  assert.equal(version.children[0]!.killed, true);
  for (const variant of ["malformed", "wrong-id", "stdout", "stderr", "timeout"]) {
    const f = setup({
      maxOutputBytes: 8192,
      onRpc(child, rpc) {
        if (rpc.params?.name !== "click") return false;
        if (variant === "malformed") child.stdout.write("broken\n");
        if (variant === "wrong-id") child.send({ jsonrpc: "2.0", id: 900, result: {} });
        if (variant === "stdout") child.stdout.write("private".repeat(2000));
        if (variant === "stderr") child.stderr.write("private".repeat(10000));
        return true;
      },
    });
    try {
      const observed = await f.observe();
      await assert.rejects(
        f.call(
          "act",
          { ...observed, action: { type: "click", x: 0, y: 0 } },
          undefined,
          "test",
          10,
        ),
        { outcome: "unknown", dispatched: true },
      );
      assert.equal(f.children[0]!.killed, true);
    } finally {
      await f.driver.dispose!();
    }
  }
});

test("unsolicited server requests are refused without exposing client capabilities", async () => {
  const f = setup({
    onRpc(child, rpc) {
      if (rpc.params?.name === "list_windows")
        child.send({
          jsonrpc: "2.0",
          id: "server-1",
          method: "sampling/createMessage",
          params: {},
        });
      return false;
    },
  });
  try {
    await f.call("list_windows");
    assert.ok(
      f.calls.some(
        (rpc) => (rpc as unknown as { error?: { code: number } }).error?.code === -32601,
      ),
    );
  } finally {
    await f.driver.dispose!();
  }
});

test("pixel scroll uses a fresh native PNG ratio while click and drag retain image coordinates", async () => {
  const small = pngSize(1600, 1000);
  const native = pngSize(3200, 2000);
  const f = setup({
    onRpc(child, rpc) {
      if (rpc.params?.name !== "get_window_state") return false;
      const original = rpc.params.arguments.max_image_dimension === 0;
      child.send({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          content: [{ type: "image", mimeType: "image/png", data: original ? native : small }],
          structuredContent: {
            pid: window.pid,
            window_id: window.window_id,
            window_bounds: window.bounds,
            screenshot_width: original ? 3200 : 1600,
            screenshot_height: original ? 2000 : 1000,
            capture_id: original ? "native-capture" : "scaled-capture",
          },
        },
      });
      return true;
    },
  });
  try {
    const observed = await f.observe();
    await f.call("act", {
      ...observed,
      action: {
        type: "scroll",
        x: 123,
        y: 456,
        direction: "down",
        amount: 2,
        deliveryMode: "foreground",
      },
    });
    const scroll = f.calls.find((rpc) => rpc.params?.name === "scroll")!.params!.arguments;
    assert.deepEqual(scroll, {
      target: { kind: "window", pid: 42, window_id: 123 },
      delivery_mode: "foreground",
      x: 246,
      y: 912,
      direction: "down",
      amount: 2,
      by: "line",
    });
    const capture = f.calls.find(
      (rpc) =>
        rpc.params?.name === "get_window_state" && rpc.params.arguments.max_image_dimension === 0,
    )!;
    assert.equal(capture.params!.arguments.include_accessibility_tree, false);
    const after = f.calls.slice(f.calls.indexOf(capture) + 1);
    assert.deepEqual(
      after.map((rpc) => rpc.params?.name),
      ["list_windows", "scroll"],
    );
    const fresh = await f.observe();
    await f.call("act", {
      ...fresh,
      action: { type: "drag", x: 123, y: 456, endX: 321, endY: 654, deliveryMode: "foreground" },
    });
    const drag = f.calls.find((rpc) => rpc.params?.name === "drag")!.params!.arguments;
    assert.equal(drag.from_x, 123);
    assert.equal(drag.from_y, 456);
    assert.equal(drag.to_x, 321);
    assert.equal(drag.to_y, 654);
    assert.equal(
      f.calls.filter((rpc) => rpc.params?.arguments?.max_image_dimension === 0).length,
      1,
    );
  } finally {
    await f.driver.dispose!();
  }
});

test("AX scroll keeps its token and never takes a replacement capture", async () => {
  const f = setup();
  try {
    const observed = await f.observe();
    await f.call("act", {
      ...observed,
      action: { type: "scroll", elementToken: "token-1", direction: "down", amount: 2 },
    });
    assert.deepEqual(f.calls.find((rpc) => rpc.params?.name === "scroll")!.params!.arguments, {
      target: { kind: "window", pid: 42, window_id: 123 },
      delivery_mode: "background",
      element_token: "token-1",
      snapshot_id: "snapshot-1",
      direction: "down",
      amount: 2,
      by: "line",
    });
    assert.equal(f.calls.filter((rpc) => rpc.params?.name === "get_window_state").length, 1);
    await assert.rejects(
      f.call("act", {
        ...observed,
        action: { type: "scroll", x: 0, y: 0, direction: "down", amount: 1 },
      }),
      { code: "background_unavailable", dispatched: false },
    );
    await assert.rejects(f.call("act", { ...observed, action: { type: "move", x: 0, y: 0 } }), {
      code: "unsupported_method",
      dispatched: false,
    });
    assert.equal(
      f.calls.some((rpc) => rpc.params?.name === "move_cursor"),
      false,
    );
    assert.equal(f.calls.filter((rpc) => rpc.params?.name === "scroll").length, 1);
  } finally {
    await f.driver.dispose!();
  }
});

test("native scroll preparation refuses changed geometry, malformed images, expiry and cancellation without input", async () => {
  for (const variant of [
    "bounds",
    "post-capture-bounds",
    "aspect",
    "png",
    "expired",
    "cancelled",
  ]) {
    let clock = 1;
    let captured = false;
    const controller = new AbortController();
    const f = setup({
      now: () => clock,
      onRpc(child, rpc) {
        if (rpc.params?.name === "list_windows" && captured && variant === "post-capture-bounds") {
          child.send({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              content: [],
              structuredContent: { windows: [{ ...window, bounds: { ...window.bounds, x: 500 } }] },
            },
          });
          return true;
        }
        if (
          rpc.params?.name !== "get_window_state" ||
          rpc.params.arguments.max_image_dimension !== 0
        )
          return false;
        captured = true;
        if (variant === "expired") clock = 100;
        if (variant === "cancelled") controller.abort();
        const height = variant === "aspect" ? 6 : 2;
        child.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            content: [
              {
                type: "image",
                mimeType: "image/png",
                data: variant === "png" ? png : pngSize(2, height),
              },
            ],
            structuredContent: {
              pid: window.pid,
              window_id: window.window_id,
              window_bounds: variant === "bounds" ? { ...window.bounds, x: 500 } : window.bounds,
              screenshot_width: 2,
              screenshot_height: height,
            },
          },
        });
        return true;
      },
    });
    try {
      const observed = await f.observe();
      await assert.rejects(
        f.call(
          "act",
          {
            ...observed,
            expiresAt: 100,
            action: {
              type: "scroll",
              x: 0,
              y: 0,
              direction: "down",
              amount: 1,
              deliveryMode: "foreground",
            },
          },
          controller.signal,
        ),
        { dispatched: false },
      );
      assert.equal(
        f.calls.some((rpc) => rpc.params?.name === "scroll"),
        false,
        variant,
      );
    } finally {
      await f.driver.dispose!();
    }
  }
});
