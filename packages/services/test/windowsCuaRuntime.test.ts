import assert from "node:assert/strict";
import test from "node:test";
import {
  createWindowsComputerUseRuntime,
  WindowsComputerUseError,
  type WindowsComputerDriver,
  type WindowsComputerResult,
} from "../../cua/windows-runtime.js";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=";
const context = {
  sessionId: "session",
  turnId: "turn",
  workspaceKey: "project",
  runtimeScope: "main" as const,
  clientMode: "desktop-continuous" as const,
  deliveryKind: "desktop-continuous" as const,
};

function fixture(options: Record<string, unknown> = {}) {
  let clock = 1000;
  let window = {
    windowId: "0x100",
    pid: 12,
    processStartedAt: "637000000000000000",
    title: "Test Window",
    bounds: { x: -1600, y: 20, width: 800, height: 600 },
    dpi: 144,
    inputTick: 50,
  };
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let failObserve = false;
  let act: WindowsComputerDriver | undefined;
  const capture = () => ({
    window: structuredClone(window),
    image: { mimeType: "image/png", base64: png, width: 1, height: 1 },
    frame: {
      imageWidth: 1,
      imageHeight: 1,
      coordinateSpace: "window-image",
      scaleX: window.bounds.width,
      scaleY: window.bounds.height,
    },
  });
  const driver: WindowsComputerDriver = async (request, requestOptions) => {
    calls.push(structuredClone(request));
    if (request.method === "list_windows") return { windows: [structuredClone(window)] };
    if (request.method === "check_window") return { window: structuredClone(window) };
    if (request.method === "observe") {
      if (failObserve) throw new WindowsComputerUseError("capture_failed", "Capture unavailable.");
      return capture();
    }
    if (act) return act(request, requestOptions);
    window.inputTick++;
    return { performed: true, dispatched: true, effect: "confirmed", route: "accessibility" };
  };
  const runtime = createWindowsComputerUseRuntime({ driver, now: () => clock, ...options });
  const call = (toolName: string, args: unknown = {}, scope = context, signal?: AbortSignal) =>
    runtime.execute({ toolName, arguments: args, context: scope, signal });
  const access = async () => {
    const listed = await call("computer_list_windows");
    const windowId = (listed.structuredContent.windows as Array<{ windowId: string }>)[0]!.windowId;
    const observed = await call("computer_request_access", {
      windowId,
      reason: "Control the isolated test window",
    });
    assert.equal(observed.isError, undefined);
    return { windowId, observed };
  };
  const action = (observation: WindowsComputerResult, requestId = "action-1") => ({
    requestId,
    windowId: observation.structuredContent.windowId,
    observationId: observation.structuredContent.observationId,
    observationVersion: observation.structuredContent.observationVersion,
    action: { type: "click", x: 0.5, y: 0.5 },
  });
  return {
    runtime,
    call,
    calls,
    access,
    action,
    capture,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    changeWindow: (change: Partial<typeof window>) => {
      window = { ...window, ...change };
    },
    setAct: (fn: WindowsComputerDriver) => {
      act = fn;
    },
    failObserve: () => {
      failObserve = true;
    },
  };
}

test("Windows computer runtime requires trusted local identities and rejects argument authority", async () => {
  const f = fixture();
  for (const bad of [
    { ...context, turnId: "" },
    { ...context, workspaceKey: "" },
    { ...context, runtimeScope: "subagent" },
    { ...context, remoteSessionId: "remote" },
    { ...context, clientMode: "web-remote-replayable" },
    { ...context, clientMode: undefined },
    { ...context, deliveryKind: undefined },
  ]) {
    const output = await f.runtime.execute({
      toolName: "computer_list_windows",
      context: bad as typeof context,
    });
    assert.equal(output.isError, true);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.call("computer_request_access", { windowId: "w", approved: true })).structuredContent
      .code,
    "invalid_request",
  );
  assert.equal((await f.call("computer_list_windows", { driverPath: "other.exe" })).isError, true);
  assert.equal((await f.call("computer_unknown")).structuredContent.code, "unsupported_method");
});

test("window listing exposes opaque IDs and access scopes native identity, focus and image geometry", async () => {
  const f = fixture();
  const { observed, windowId } = await f.access();
  assert.match(windowId, /^window_/);
  assert.notEqual(windowId, "0x100");
  assert.equal(f.calls[0]!.method, "list_windows");
  assert.equal(f.calls[1]!.params.focus, true);
  assert.deepEqual(f.calls[1]!.params.identity, {
    pid: 12,
    processStartedAt: "637000000000000000",
  });
  assert.equal(observed.content[0]!.type, "image");
  assert.equal(observed.structuredContent.imageWidth, 1);
  assert.equal(observed.structuredContent.expiresAt, 16000);
  assert.deepEqual(observed.structuredContent.bounds, { x: -1600, y: 20, width: 800, height: 600 });
  assert.equal(
    (await f.call("computer_observe", { windowId }, { ...context, turnId: "next" }))
      .structuredContent.code,
    "access_required",
  );
});

test("action uses cached native geometry and returns a new observed frame without replay", async () => {
  const f = fixture();
  const { observed } = await f.access();
  const args = f.action(observed);
  const output = await f.call("computer_action", args);
  assert.equal(output.isError, undefined);
  assert.equal(output.structuredContent.status, "action_performed");
  assert.equal(output.structuredContent.observationVersion, 2);
  assert.notEqual(output.structuredContent.observationId, observed.structuredContent.observationId);
  const native = f.calls.find((item) => item.method === "act")!;
  assert.equal((native.params.window as { windowId: string }).windowId, "0x100");
  assert.equal((native.params.window as { inputTick: number }).inputTick, 50);
  assert.deepEqual(native.params.frame, {
    imageWidth: 1,
    imageHeight: 1,
    coordinateSpace: "window-image",
    scaleX: 800,
    scaleY: 600,
  });
  assert.deepEqual(native.params.action, args.action);
  assert.equal(
    f.calls
      .filter((item) => item.method === "observe")
      .slice(1)
      .every((item) => item.params.focus === undefined),
    true,
  );
  const duplicate = await f.call("computer_action", args);
  assert.equal(duplicate.structuredContent.duplicate, true);
  assert.equal(f.calls.filter((item) => item.method === "act").length, 1);
  assert.equal(
    (await f.call("computer_action", { ...args, action: { type: "click", x: 0, y: 0 } }))
      .structuredContent.code,
    "request_conflict",
  );
});

test("expired observations, wrong windows, stale versions, input changes and bounds cannot dispatch", async () => {
  for (const variant of [
    "expired",
    "window",
    "version",
    "bounds",
    "moved",
    "identity",
    "input",
  ] as const) {
    const f = fixture();
    const { observed } = await f.access();
    const args = f.action(observed);
    if (variant === "expired") f.advance(15000);
    if (variant === "window") args.windowId = "window-other";
    if (variant === "version") args.observationVersion = 999;
    if (variant === "bounds") args.action.x = 1;
    if (variant === "moved")
      f.changeWindow({ bounds: { x: -1500, y: 20, width: 800, height: 600 } });
    if (variant === "identity") f.changeWindow({ processStartedAt: "638000000000000000" });
    if (variant === "input") f.changeWindow({ inputTick: 51 });
    assert.equal((await f.call("computer_action", args)).isError, true, variant);
    assert.equal(
      f.calls.some((item) => item.method === "act"),
      false,
      variant,
    );
  }
});

test("strict action schema rejects system keys, injected geometry, invalid text and nonfinite coordinates", async () => {
  const f = fixture();
  const { observed } = await f.access();
  for (const action of [
    { type: "key", key: "alt+tab" },
    { type: "click", x: Infinity, y: 0 },
    { type: "type_text", text: "a\0b" },
    { type: "type_text", text: "x".repeat(4097) },
    { type: "scroll", direction: "down", amount: 21, x: 0, y: 0 },
    { type: "scroll", direction: "down", amount: 1 },
    { type: "drag", x: 0, y: 0, endX: 1, endY: 0 },
    { type: "click", x: 0, y: 0, bounds: { x: 99 } },
  ])
    assert.equal(
      (await f.call("computer_action", { ...f.action(observed), action })).isError,
      true,
    );
  assert.equal(
    f.calls.some((item) => item.method === "act"),
    false,
  );
});

test("handle reuse cannot be approved using a previously listed identity", async () => {
  const f = fixture();
  const listed = await f.call("computer_list_windows");
  const windowId = (listed.structuredContent.windows as Array<{ windowId: string }>)[0]!.windowId;
  f.changeWindow({ pid: 13 });
  assert.equal(
    (
      await f.call("computer_request_access", {
        windowId,
        reason: "Control the isolated test window",
      })
    ).structuredContent.code,
    "window_changed",
  );
  assert.equal(
    (await f.call("computer_observe", { windowId })).structuredContent.code,
    "access_required",
  );
});

test("stop erects its barrier synchronously, aborts the active action and forbids queued actions", async () => {
  const f = fixture();
  const { observed } = await f.access();
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.setAct(async (_request, { signal }) => {
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
    );
  });
  const first = f.call("computer_action", f.action(observed));
  await entered;
  const queued = f.call("computer_action", f.action(observed, "queued"));
  const stopping = f.call("computer_stop");
  assert.equal((await stopping).structuredContent.status, "stopped");
  assert.equal((await first).structuredContent.outcome, "unknown");
  assert.equal((await queued).structuredContent.code, "turn_stopped");
  assert.equal(f.calls.filter((item) => item.method === "act").length, 1);
  assert.equal(
    (
      await f.call("computer_request_access", {
        windowId: observed.structuredContent.windowId,
        reason: "Control test window",
      })
    ).structuredContent.code,
    "turn_stopped",
  );
});

test("external abort also closes the turn and lost action replies are never replayed", async () => {
  for (const kind of ["abort", "lost"] as const) {
    const f = fixture();
    const { observed } = await f.access();
    const controller = new AbortController();
    f.setAct(async () => {
      if (kind === "abort") controller.abort();
      throw new Error("sensitive text must not escape");
    });
    const args = f.action(observed);
    const output = await f.call("computer_action", args, context, controller.signal);
    assert.equal(output.structuredContent.outcome, "unknown");
    assert.equal(JSON.stringify(output).includes("sensitive"), false);
    assert.equal((await f.call("computer_action", args)).structuredContent.outcome, "unknown");
    assert.equal(f.calls.filter((item) => item.method === "act").length, 1);
  }
});

test("explicit native pre-dispatch refusal differs from unknown and permits a new observation", async () => {
  const f = fixture();
  const { observed, windowId } = await f.access();
  f.setAct(async () => {
    throw new WindowsComputerUseError("point_obscured", "Target is obscured.");
  });
  const output = await f.call("computer_action", f.action(observed));
  assert.equal(output.structuredContent.outcome, "not-dispatched");
  assert.equal((await f.call("computer_observe", { windowId })).isError, undefined);
});

test("user takeover revokes authority until another approved access request", async () => {
  for (const code of ["user_interrupted", "foreground_required", "changed_input_tick"]) {
    const f = fixture();
    const { observed, windowId } = await f.access();
    if (code === "changed_input_tick") f.changeWindow({ inputTick: 51 });
    else
      f.setAct(async () => {
        throw new WindowsComputerUseError(code, "User took control.");
      });
    assert.equal((await f.call("computer_action", f.action(observed))).isError, true);
    assert.equal(
      (await f.call("computer_observe", { windowId })).structuredContent.code,
      "access_required",
    );
    assert.equal(
      (await f.call("computer_request_access", { windowId, reason: "Resume isolated test" }))
        .isError,
      undefined,
    );
  }
});

test("window titles and screenshots have independent bounded output contracts", async () => {
  const f = fixture();
  const listedRuntime = createWindowsComputerUseRuntime({
    driver: async () => ({
      windows: Array.from({ length: 250 }, (_, n) => ({
        ...f.capture().window,
        windowId: `0x${n + 100}`,
        title: "窗口".repeat(1000),
      })),
    }),
  });
  const listed = await listedRuntime.execute({ toolName: "computer_list_windows", context });
  const windows = listed.structuredContent.windows as Array<{ title: string }>;
  assert.equal(windows.length <= 200, true);
  assert.equal(
    windows.every((window) => window.title.length <= 512),
    true,
  );
  assert.equal(Buffer.byteLength(JSON.stringify(listed.structuredContent)) < 64 * 1024, true);
  assert.equal(listed.structuredContent.truncated, true);
  const tooLarge = createWindowsComputerUseRuntime({
    driver: async ({ method }) =>
      method === "list_windows"
        ? { windows: [f.capture().window] }
        : {
            ...f.capture(),
            image: {
              ...f.capture().image,
              base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64"),
            },
          },
  });
  const windowsResult = await tooLarge.execute({ toolName: "computer_list_windows", context });
  const windowId = (windowsResult.structuredContent.windows as Array<{ windowId: string }>)[0]!
    .windowId;
  const result = await tooLarge.execute({
    toolName: "computer_request_access",
    arguments: { windowId, reason: "Observe test" },
    context,
  });
  assert.equal(result.structuredContent.code, "invalid_driver_result");
  assert.equal(
    result.content.some((item) => item.type === "image"),
    false,
  );
});

test("post-action screenshot failure keeps known action success and never retries it", async () => {
  const f = fixture();
  const { observed } = await f.access();
  f.setAct(async () => {
    f.failObserve();
    return { performed: true, dispatched: true, effect: "confirmed", route: "accessibility" };
  });
  const args = f.action(observed);
  const output = await f.call("computer_action", args);
  assert.equal(output.structuredContent.code, "observation_after_action_failed");
  assert.equal(output.structuredContent.outcome, "succeeded");
  await f.call("computer_action", args);
  assert.equal(f.calls.filter((item) => item.method === "act").length, 1);
});

test("TTL and bounded result eviction discard payloads without allowing old IDs or stopped turns", async () => {
  const f = fixture({ maxRequests: 1, requestTtlMs: 100, scopeTtlMs: 1000 });
  const { observed, windowId } = await f.access();
  const firstArgs = f.action(observed);
  await f.call("computer_action", firstArgs);
  const next = await f.call("computer_observe", { windowId });
  await f.call("computer_action", f.action(next, "second"));
  assert.equal(
    (await f.call("computer_action", firstArgs)).structuredContent.code,
    "request_already_used",
  );
  f.advance(1001);
  assert.equal(
    (
      await f.call("computer_request_access", {
        windowId,
        reason: "Control the isolated test window",
      })
    ).structuredContent.code,
    "turn_stopped",
  );
});

test("closeSession and dispose reject late requests and clean temporary authority", async () => {
  const f = fixture();
  await f.access();
  await f.runtime.closeSession(context);
  assert.equal(
    (await f.call("computer_list_windows", {}, { ...context, turnId: "late" })).structuredContent
      .code,
    "turn_stopped",
  );
  await f.runtime.dispose();
  assert.equal((await f.call("computer_list_windows")).structuredContent.code, "runtime_disposed");
});

test("stop and session close wait only for their owned driver, not another scope's blocked queue", async () => {
  for (const method of ["stop", "closeSession"]) {
    const base = fixture();
    const own = context;
    const other = { ...context, sessionId: "other" };
    let entered!: () => void;
    let releaseOther!: () => void;
    let releaseOwnClose!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const otherBlocked = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });
    const ownClosed = new Promise<void>((resolve) => {
      releaseOwnClose = resolve;
    });
    const closed: string[] = [];
    const listed: string[] = [];
    let otherAborted = false;
    const driver: WindowsComputerDriver = async (_request, call) => {
      listed.push(call.scopeId!);
      if (call.scopeId!.includes('"other"')) {
        call.signal.addEventListener(
          "abort",
          () => {
            otherAborted = true;
          },
          { once: true },
        );
        entered();
        await otherBlocked;
      }
      return { windows: [base.capture().window] };
    };
    driver.closeScope = async (key) => {
      closed.push(key);
      if (!key.includes('"other"')) await ownClosed;
    };
    const runtime = createWindowsComputerUseRuntime({ driver });
    let pendingOther: Promise<WindowsComputerResult> | undefined;
    let pendingOwn: Promise<WindowsComputerResult> | undefined;
    try {
      await runtime.execute({ toolName: "computer_list_windows", context: own });
      pendingOther = runtime.execute({ toolName: "computer_list_windows", context: other });
      await started;
      pendingOwn = runtime.execute({ toolName: "computer_list_windows", context: own });
      const stopping =
        method === "stop"
          ? runtime.execute({ toolName: "computer_stop", context: own })
          : runtime.closeSession(own);
      let settled = false;
      void stopping.then(() => {
        settled = true;
      });
      await Promise.resolve();
      assert.equal(settled, false, "must wait for owned driver exit");
      assert.equal(closed.length, 1);
      releaseOwnClose();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          stopping,
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error("unrelated scope blocked stop")), 1000);
          }),
        ]);
      } finally {
        clearTimeout(deadline);
      }
      assert.equal(otherAborted, false);
      assert.equal(listed.length, 2, "queued stopped scope never entered driver");
      releaseOther();
      assert.equal((await pendingOther).isError, undefined);
      assert.equal((await pendingOwn).structuredContent.code, "turn_stopped");
      assert.equal(listed.length, 2);
    } finally {
      releaseOther();
      releaseOwnClose();
      await Promise.allSettled([pendingOther, pendingOwn]);
      await runtime.dispose();
      await base.runtime.dispose();
    }
  }
});

test("pointer-only movement is absent from tool schemas and rejected before native dispatch", async () => {
  const f = fixture();
  try {
    const { observed } = await f.access();
    const schemas = f.runtime
      .listTools()
      .find((tool) => tool.name === "computer_action")!.inputSchema;
    assert.equal(JSON.stringify(schemas).includes('"const":"move"'), false);
    const output = await f.call("computer_action", {
      ...f.action(observed),
      action: { type: "move", x: 0, y: 0 },
    });
    assert.equal(output.structuredContent.code, "invalid_request");
    assert.equal(
      f.calls.some((call) => call.method === "act"),
      false,
    );
  } finally {
    await f.runtime.dispose();
  }
});

test("invalid screenshot dimensions and non-Windows default driver remain fail closed", async () => {
  const f = fixture();
  const runtime = createWindowsComputerUseRuntime({
    driver: async ({ method }) =>
      method === "list_windows"
        ? { windows: [f.capture().window] }
        : { ...f.capture(), image: { ...f.capture().image, width: 2 } },
  });
  const listed = await runtime.execute({ toolName: "computer_list_windows", context });
  const windowId = (listed.structuredContent.windows as Array<{ windowId: string }>)[0]!.windowId;
  assert.equal(
    (
      await runtime.execute({
        toolName: "computer_request_access",
        arguments: { windowId, reason: "Control test window" },
        context,
      })
    ).structuredContent.code,
    "invalid_driver_result",
  );
  const unsupported = createWindowsComputerUseRuntime({
    platform: "linux",
    driverPath: "/driver.exe",
  });
  assert.equal(
    (await unsupported.execute({ toolName: "computer_list_windows", context })).structuredContent
      .code,
    "unsupported_platform",
  );
});

test("AX tokens belong to the latest authorized snapshot and do not survive refresh", async () => {
  const base = fixture();
  let version = 0;
  let dispatched = 0;
  const driver: WindowsComputerDriver = async ({ method, params }) => {
    if (method === "list_windows") return { windows: [base.capture().window] };
    if (method === "check_window") return { window: base.capture().window };
    if (method === "act") {
      dispatched++;
      assert.equal((params.action as { elementToken: string }).elementToken, `element-${version}`);
      assert.equal((params.frame as { snapshotId: string }).snapshotId, `snapshot-${version}`);
      return {
        performed: true,
        dispatched: true,
        effect: "unverifiable",
        route: "synthetic_events",
        delivery: { mode: "foreground" },
        escalation: { target: "pixel", reason: "effect_unconfirmed" },
      };
    }
    const captured = base.capture();
    return {
      ...captured,
      frame: { ...captured.frame, snapshotId: `snapshot-${++version}` },
      accessibility: {
        elements: [{ index: 1, role: "button", elementToken: `element-${version}` }],
        complete: true,
      },
    };
  };
  const f = fixture({ driver });
  try {
    const { observed, windowId } = await f.access();
    assert.equal(observed.structuredContent.accessibility !== undefined, true);
    const next = await f.call("computer_observe", { windowId });
    const invalid = await f.call("computer_action", {
      ...f.action(next, "stale-element"),
      action: { type: "click", elementToken: "element-1" },
    });
    assert.equal(invalid.structuredContent.code, "element_mismatch");
    const fresh = await f.call("computer_observe", { windowId });
    const args = {
      ...f.action(fresh),
      action: { type: "click", elementToken: `element-${version}`, deliveryMode: "foreground" },
    };
    const result = await f.call("computer_action", args);
    assert.equal(result.structuredContent.effect, "unverifiable");
    assert.equal(result.structuredContent.outcome, "unverifiable");
    assert.equal(result.structuredContent.verified, false);
    assert.deepEqual(result.structuredContent.escalation, {
      target: "pixel",
      reason: "effect_unconfirmed",
    });
    await f.call("computer_action", args);
    assert.equal(dispatched, 1);
    assert.equal(
      version,
      4,
      "only requested and post-action observations publish new native snapshots",
    );
  } finally {
    await f.runtime.dispose();
    await base.runtime.dispose();
  }
});

test("stop closes an idle scope immediately and does not report stopped before driver exit", async () => {
  const base = fixture();
  let closeCalled = false;
  let release!: () => void;
  const closed = new Promise<void>((resolveClose) => {
    release = resolveClose;
  });
  const driver: WindowsComputerDriver = async () => ({ windows: [base.capture().window] });
  driver.closeScope = async () => {
    closeCalled = true;
    await closed;
  };
  const f = fixture({ driver });
  await f.call("computer_list_windows");
  let finished = false;
  const stop = f.call("computer_stop").then((result) => {
    finished = true;
    return result;
  });
  assert.equal(closeCalled, true);
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  assert.equal((await stop).structuredContent.status, "stopped");
  await f.runtime.dispose();
  await base.runtime.dispose();
});

test("expired scopes close their transport and cannot revive old turn authority", async () => {
  const base = fixture();
  const closedScopes: string[] = [];
  const driver: WindowsComputerDriver = async () => ({ windows: [base.capture().window] });
  driver.closeScope = async (scopeId) => {
    closedScopes.push(scopeId);
  };
  const f = fixture({ driver, scopeTtlMs: 100 });
  await f.call("computer_list_windows");
  f.advance(101);
  assert.equal((await f.call("computer_list_windows")).structuredContent.code, "turn_stopped");
  assert.equal(closedScopes.length, 1);
  await f.runtime.dispose();
  await base.runtime.dispose();
});
