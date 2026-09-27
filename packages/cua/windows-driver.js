import { randomUUID } from "node:crypto";
import { createCuaMcpTransport } from "./windows-mcp-transport.js";
import { WindowsComputerUseError, nativeWindow, reject, sameWindow } from "./windows-contract.js";
import { nativeScrollPoint, screenshotFrom } from "./windows-screenshot.js";

const ALLOWED = new Set([
  "list_windows",
  "get_window_state",
  "click",
  "drag",
  "type_text",
  "press_key",
  "hotkey",
  "scroll",
]);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function body(response) {
  if (!record(response) || !Array.isArray(response.content))
    reject("invalid_driver_result", "Invalid Cua tool envelope.");
  let value = response.structuredContent;
  if (!record(value)) {
    try {
      value = JSON.parse(response.content.find((item) => item.type === "text")?.text);
    } catch {
      /* 只接纳 JSON 元数据，不能把描述文字猜成成功。 */
    }
  }
  if (!record(value)) reject("invalid_driver_result", "Cua did not return structured metadata.");
  return value;
}
function safeCode(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value)
    ? value
    : "driver_rejected";
}
function refusal(response, value, action) {
  if (
    !response.isError &&
    value.effect !== "refused" &&
    value.status !== "refused" &&
    !value.refusal
  )
    return;
  const code = safeCode(value.refusal?.code ?? value.error?.code ?? value.code);
  // 通用 isError 不证明零派发；只有上游明确定义的拒绝形状可以保留可重试语义。
  const explicit =
    value.effect === "refused" &&
    !value.delivery &&
    !value.evidence &&
    record(value.error) &&
    typeof value.route === "string";
  const preflight = ["ambiguous_window_target", "window_target_not_found"].includes(code);
  const dispatched = action && !(explicit || preflight);
  throw new WindowsComputerUseError(code, `Cua driver reported ${code}.`, {
    dispatched,
    outcome: dispatched ? "unknown" : "not-dispatched",
  });
}
function windowFrom(value, generation) {
  if (!record(value) || !Number.isSafeInteger(value.window_id) || value.window_id <= 0)
    reject("invalid_driver_result", "Invalid Cua window identity.");
  return nativeWindow({
    windowId: String(value.window_id),
    pid: value.pid,
    driverGeneration: generation,
    title: value.title ?? value.window_title ?? "",
    bounds: value.bounds ?? value.window_bounds,
  });
}
function elementsFrom(value) {
  const elements = [];
  let bytes = 0;
  for (const item of (Array.isArray(value.elements) ? value.elements : []).slice(0, 200)) {
    if (!record(item) || !Number.isSafeInteger(item.element_index) || typeof item.role !== "string")
      continue;
    const element = { index: item.element_index, role: item.role.slice(0, 80) };
    if (
      typeof item.element_token === "string" &&
      item.element_token.length > 0 &&
      item.element_token.length <= 4096
    )
      element.elementToken = item.element_token;
    for (const key of ["label", "value"])
      if (typeof item[key] === "string") element[key] = item[key].slice(0, 256);
    for (const key of ["enabled", "selected"])
      if (typeof item[key] === "boolean") element[key] = item[key];
    if (Array.isArray(item.actions))
      element.actions = item.actions
        .filter((x) => typeof x === "string")
        .slice(0, 12)
        .map((x) => x.slice(0, 80));
    bytes += Buffer.byteLength(JSON.stringify(element));
    if (bytes > 20 * 1024) break;
    elements.push(element);
  }
  return elements;
}

export function createWindowsComputerDriver(options = {}) {
  const connections = new Map();
  const opening = new Map();
  const keyFor = (call) => call.scopeId ?? "isolated-direct-call";
  const connection = async (call) => {
    const key = keyFor(call);
    const existing = connections.get(key);
    if (existing?.transport.alive) return existing;
    if (existing) {
      await existing.transport.close();
      connections.delete(key);
    }
    if (opening.has(key)) return opening.get(key);
    if (connections.size + opening.size >= 4)
      reject("driver_busy", "Four computer sessions are already active; stop an unused session.");
    const promise = createCuaMcpTransport({ ...options, initialCall: call })
      .then((transport) => {
        const entry = { transport, generation: randomUUID() };
        connections.set(key, entry);
        return entry;
      })
      .finally(() => opening.delete(key));
    opening.set(key, promise);
    return promise;
  };
  const tool = async (entry, name, args, call, action = false) => {
    if (!ALLOWED.has(name)) reject("unsupported_method", "The Cua tool is not allowed.");
    const response = await entry.transport.request(
      "tools/call",
      { name, arguments: args },
      call,
      action,
    );
    let value;
    try {
      value = body(response);
      refusal(response, value, action);
    } catch (failure) {
      if (action && failure.code === "invalid_driver_result")
        throw new WindowsComputerUseError(
          "invalid_driver_result",
          "Cua action outcome is uncertain.",
          { dispatched: true, outcome: "unknown" },
        );
      throw failure;
    }
    return { response, value };
  };
  const check = async (entry, window, call) => {
    if (window.driverGeneration && window.driverGeneration !== entry.generation)
      reject("window_changed", "The driver restarted; request access again.");
    const { value } = await tool(
      entry,
      "list_windows",
      { pid: window.pid, on_screen_only: true },
      call,
    );
    if (!Array.isArray(value.windows) || value.windows.length > 4096)
      reject("invalid_driver_result", "Invalid Cua window list.");
    const match = value.windows.find(
      (item) =>
        String(item.window_id) === window.windowId &&
        item.pid === window.pid &&
        item.minimized !== true &&
        item.is_on_screen === true,
    );
    if (!match) reject("window_unavailable", "The authorized window is no longer visible.");
    return windowFrom(match, entry.generation);
  };
  const driver = async (request, call = {}) => {
    if (call.signal?.aborted) reject("cancelled", "The computer operation was cancelled.");
    if (!["list_windows", "observe", "check_window", "act"].includes(request.method))
      reject("unsupported_method", "Unknown driver operation.");
    const entry = await connection(call);
    const params = request.params;
    if (request.method === "list_windows") {
      const { value } = await tool(entry, "list_windows", { on_screen_only: true }, call);
      if (!Array.isArray(value.windows) || value.windows.length > 4096)
        reject("invalid_driver_result", "Invalid Cua window list.");
      return {
        windows: value.windows
          .filter((item) => item.is_on_screen === true && item.minimized !== true)
          .map((item) => windowFrom(item, entry.generation)),
      };
    }
    if (request.method === "check_window")
      return { window: await check(entry, params.window, call) };
    if (request.method === "observe") {
      const before = await check(entry, { windowId: params.windowId, ...params.identity }, call);
      const { response, value } = await tool(
        entry,
        "get_window_state",
        {
          pid: before.pid,
          window_id: Number(before.windowId),
          include_screenshot: true,
          include_accessibility_tree: true,
          max_image_dimension: 1600,
          max_elements: 200,
          max_depth: 12,
          timeout_ms: 3000,
        },
        call,
      );
      const window = windowFrom(value, entry.generation);
      if (!sameWindow(before, window) || value.screenshot_frame_valid === false)
        reject("window_changed", "Window changed while capturing.");
      const elements = elementsFrom(value);
      return {
        window,
        image: screenshotFrom(response, value),
        frame: {
          imageWidth: value.screenshot_width,
          imageHeight: value.screenshot_height,
          coordinateSpace: "window-image",
          ...(typeof value.snapshot_id === "string" ? { snapshotId: value.snapshot_id } : {}),
          ...(typeof value.capture_id === "string" ? { captureId: value.capture_id } : {}),
        },
        accessibility: {
          elements,
          truncated: value.truncated === true || elements.length < (value.elements?.length ?? 0),
          complete: value.elements_complete === true,
          degraded: value.degraded === true,
        },
      };
    }
    const checked = await check(entry, params.window, call);
    if (!sameWindow(checked, params.window))
      reject("window_changed", "Window geometry changed before dispatch.");
    const action = params.action;
    // 固定版本的 move_cursor 接收屏幕坐标，却没有提供可信截图屏幕原点；不得猜测 DWM 边框。
    if (action.type === "move")
      reject("unsupported_method", "Pointer-only movement is unsupported for window images.");
    const target = { kind: "window", pid: checked.pid, window_id: Number(checked.windowId) };
    const args = { target, delivery_mode: action.deliveryMode ?? "background" };
    if (action.elementToken) {
      args.element_token = action.elementToken;
      args.snapshot_id = params.frame.snapshotId;
    } else for (const key of ["x", "y"]) if (key in action) args[key] = action[key];
    let name = action.type;
    if (["click", "double_click", "right_click"].includes(action.type)) {
      name = "click";
      args.count = action.type === "double_click" ? 2 : 1;
      args.button = action.type === "right_click" ? "right" : "left";
      if (!action.elementToken && params.frame.captureId) args.capture_id = params.frame.captureId;
    } else if (action.type === "drag") {
      delete args.x;
      delete args.y;
      Object.assign(args, {
        from_x: action.x,
        from_y: action.y,
        to_x: action.endX,
        to_y: action.endY,
        duration_ms: 500,
        steps: 20,
      });
    } else if (action.type === "type_text") {
      args.text = action.text;
      args.delay_ms = 0;
    } else if (action.type === "key") {
      const keys = action.key.split("+").map((key) => (key === "enter" ? "return" : key));
      name = keys.length > 1 ? "hotkey" : "press_key";
      if (keys.length > 1) args.keys = keys;
      else args.key = keys[0];
    } else if (action.type === "scroll") {
      Object.assign(args, { direction: action.direction, amount: action.amount, by: "line" });
      if (!action.elementToken) {
        if (args.delivery_mode !== "foreground")
          reject(
            "background_unavailable",
            "Pixel scrolling requires explicit foreground delivery.",
          );
        // 0.30.1 的 scroll 未应用截图缩放，且 Windows 不输出 schema 中的 screenshot_scale。
        // 用同窗原生 PNG 取得真实位图尺寸；不从 GetWindowRect 推算 DWM 裁剪或屏幕原点。
        const captured = await tool(
          entry,
          "get_window_state",
          {
            pid: checked.pid,
            window_id: Number(checked.windowId),
            include_screenshot: true,
            include_accessibility_tree: false,
            max_image_dimension: 0,
            timeout_ms: 3000,
          },
          call,
        );
        if (
          !sameWindow(checked, windowFrom(captured.value, entry.generation)) ||
          captured.value.screenshot_frame_valid === false
        )
          reject("window_changed", "Window changed while preparing pixel scrolling.");
        const image = screenshotFrom(captured.response, captured.value, 16384);
        Object.assign(args, nativeScrollPoint(action, params.frame, image));
        if (!sameWindow(checked, await check(entry, checked, call)))
          reject("window_changed", "Window geometry changed while preparing pixel scrolling.");
      }
    }
    if (Number.isFinite(params.expiresAt) && params.expiresAt <= (options.now ?? Date.now)())
      reject("observation_expired", "The observation expired before native dispatch.");
    call.signal?.throwIfAborted();
    const { value } = await tool(entry, name, args, call, true);
    if (
      !["confirmed", "partial", "unverifiable", "suspected_noop"].includes(value.effect) ||
      ![
        "accessibility",
        "synthetic_events",
        "global_input",
        "system_api",
        "dom",
        "trusted_input",
      ].includes(value.route)
    )
      throw new WindowsComputerUseError(
        "invalid_driver_result",
        "Cua action outcome is uncertain.",
        { dispatched: true, outcome: "unknown" },
      );
    if (
      (value.delivery != null &&
        (!record(value.delivery) ||
          !["background", "foreground", "not_applicable", "unknown"].includes(
            value.delivery.mode,
          ))) ||
      (value.effect === "partial" &&
        (!Number.isSafeInteger(value.delivery?.delivered_count) ||
          value.delivery.delivered_count < 1)) ||
      (value.escalation != null &&
        (!record(value.escalation) ||
          !["pixel", "foreground", "page", "session"].includes(value.escalation.target) ||
          ![
            "route_unavailable",
            "delivery_failed",
            "effect_unconfirmed",
            "suspected_noop",
            "permission_required",
          ].includes(value.escalation.reason)))
    )
      throw new WindowsComputerUseError(
        "invalid_driver_result",
        "Cua action metadata is uncertain.",
        { dispatched: true, outcome: "unknown" },
      );
    return {
      performed: true,
      dispatched: true,
      effect: value.effect,
      route: value.route,
      ...(record(value.delivery)
        ? {
            delivery: {
              mode: value.delivery.mode,
              ...(Number.isInteger(value.delivery.delivered_count)
                ? { deliveredCount: value.delivery.delivered_count }
                : {}),
            },
          }
        : {}),
      ...(record(value.escalation)
        ? { escalation: { target: value.escalation.target, reason: value.escalation.reason } }
        : {}),
      ...(record(value.error) ? { code: safeCode(value.error.code) } : {}),
    };
  };
  driver.closeScope = async (scopeId) => {
    const creating = opening.get(scopeId);
    if (creating) {
      try {
        await creating;
      } catch {
        /* 创建失败已清理。 */
      }
    }
    const entry = connections.get(scopeId);
    if (entry) {
      await entry.transport.close();
      connections.delete(scopeId);
    }
  };
  driver.dispose = async () => {
    await Promise.allSettled(
      [...new Set([...connections.keys(), ...opening.keys()])].map((key) => driver.closeScope(key)),
    );
  };
  return driver;
}
