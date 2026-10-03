import {
  assert,
  PlatformChannels,
  InternalChannels,
  EmbeddedBrowserWebviewChannels,
  plain,
  check,
  indexFixture,
  wheelFixture,
  dialogFixture,
} from "./owners.fixture.mjs";

check(
  "index",
  "public facade, promise/cancellation identity and buffered callback lifetime",
  async () => {
    const f = indexFixture(),
      ready = f.calls.find(
        ([tag, channel]) =>
          tag === "send" && channel === PlatformChannels.WindowControlsOverlayReady,
      );
    assert.deepEqual(plain(ready[2]), { zoomLevel: 2, metrics: { leftPaddingPx: 79 } });
    assert.ok(f.calls.indexOf(ready) < f.calls.findIndex(([tag]) => tag === "on"));
    assert.equal(f.processPort.title, "synthetic-renderer:virtual-title");
    assert.equal(f.exposed.__knorviaFinalArmsCustomEventsE2E, undefined);
    const promise = Promise.resolve("result"),
      target = { type: "synthetic" },
      context = { workspacePath: "/virtual", workspaceIdentity: "identity", requestId: "override" };
    f.results.set(PlatformChannels.ConnectRemote, promise);
    assert.equal(f.api.connectRemote(target, "request", context), promise);
    assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "invoke").slice(1)), [
      PlatformChannels.ConnectRemote,
      { target, requestId: "override", workspacePath: "/virtual", workspaceIdentity: "identity" },
    ]);
    f.api.cancelPendingRemoteConnection();
    const cancel = f.calls.findLast(([tag]) => tag === "invoke");
    assert.ok(Object.hasOwn(cancel[2], "requestId"));
    assert.equal(cancel[2].requestId, undefined);
    assert.equal(f.api.getPathForFile({ syntheticPath: "  /virtual/file  " }), "/virtual/file");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/first");
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/second");
    const seen = [],
      callback = (value) => seen.push(value),
      dispose = f.api.onOpenWorkspacePath(callback);
    assert.deepEqual(seen, ["/first", "/second"]);
    const otherDispose = f.api.onOpenWorkspacePath(callback);
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/live");
    assert.deepEqual(seen, ["/first", "/second", "/live"]);
    assert.equal(dispose(), true);
    assert.equal(otherDispose(), false);
    f.emit(PlatformChannels.OpenWorkspacePath, {}, "/queued");
    f.api.onOpenWorkspacePath(callback);
    assert.equal(seen.at(-1), "/queued");
    const eventValues = [],
      payload = { synthetic: true },
      unsub = f.api.onRemoteSessionClosed((v) => eventValues.push(v));
    const registered = f.handlers.get(PlatformChannels.RemoteSessionClosed)[0];
    f.emit(PlatformChannels.RemoteSessionClosed, { sender: "hidden" }, payload, "extra");
    assert.equal(eventValues[0], payload);
    unsub();
    unsub();
    assert.equal(f.calls.findLast(([tag]) => tag === "remove")[2], registered);
    f.emit(PlatformChannels.RemoteSessionClosed, {}, payload);
    assert.equal(eventValues.length, 1);
    const zooms = [],
      stopZoom = f.api.onDesktopZoomLevelChanged((v) => zooms.push(plain(v)));
    f.emit(PlatformChannels.DesktopZoomLevelChanged, {}, { zoomLevel: Infinity });
    f.emit(PlatformChannels.DesktopZoomLevelChanged, {}, { zoomLevel: -10 });
    stopZoom();
    assert.deepEqual(zooms, [{ zoomLevel: 2 }, { zoomLevel: -3 }]);
    assert.deepEqual(plain(await f.api.getDesktopZoomLevel()), { zoomLevel: 5 });
    const metrics = { leftPaddingPx: 42 };
    f.emit(PlatformChannels.WindowControlsOverlayChanged, {}, metrics);
    assert.equal(f.api.getWindowControlsOverlayMetrics(), metrics);
    assert.equal(f.api.reportRendererHeapSample({ synthetic: true }), "sentinel-send");
    assert.equal(f.api.browserViewScreenshotSurfaceReady({ synthetic: true }), undefined);
    const traceStart = f.calls.length;
    assert.equal(f.api.syncTelemetryContext({}), undefined);
    await f.api.reportTelemetryEvent({});
    await f.api.reportArmsCustomEvent({});
    const updateEvents = [];
    f.api.onUpdateReady((value) => updateEvents.push(value))();
    assert.deepEqual(plain(await f.api.getUpdateState()), { kind: "idle", enabled: false });
    assert.deepEqual(plain(await f.api.getAutoUpdatePreferences()), {
      autoDownloadAndInstallUpdates: false,
    });
    assert.equal(f.calls.length, traceStart);
    assert.deepEqual(updateEvents, []);
    const gated = indexFixture({ platform: "win32", gated: true });
    assert.deepEqual(Object.keys(gated.exposed.__knorviaFinalArmsCustomEventsE2E), [
      "read",
      "clear",
      "configure",
    ]);
    assert.deepEqual(
      plain(
        gated.calls.find(
          ([tag, channel]) =>
            tag === "send" && channel === PlatformChannels.WindowControlsOverlayReady,
        )[2],
      ),
      { zoomLevel: 2, metrics: { rightPaddingPx: 112, titleBarHeightPx: 58 } },
    );
  },
);
check("index", "exact sender/channel/schema admission and first-port closure/transfer", () => {
  const f = indexFixture(),
    closed = [],
    first = { close: () => closed.push("first") },
    second = { close: () => closed.push("second") },
    data = { startupId: "synthetic" };
  f.calls.length = 0;
  f.emit(InternalChannels.ServicePort, { ports: [first, second] }, { valid: false });
  assert.deepEqual(closed, ["first"]);
  assert.equal(
    f.calls.some(([tag]) => tag === "post"),
    false,
  );
  f.emit(InternalChannels.ServicePort, { ports: [first, second] }, { valid: true, data });
  const post = f.calls.findLast(([tag]) => tag === "post");
  assert.deepEqual(plain(post[1]), { type: InternalChannels.ServicePort, ...data });
  assert.equal(post[2], "*");
  assert.equal(post[3][0], first);
  assert.equal(post[3].length, 1);
  f.emit(
    InternalChannels.ScopedServicePort,
    { ports: [first] },
    { attachmentId: "a", sessionId: "s" },
  );
  const scoped = f.calls.findLast(([tag]) => tag === "post");
  assert.ok(Object.hasOwn(scoped[1], "target"));
  assert.equal(scoped[1].target, undefined);
  f.calls.length = 0;
  const valid = {
    type: InternalChannels.ScopedServicePortReady,
    attachmentId: " a ",
    sessionId: "s",
    extra: "drop",
  };
  f.message(valid, {});
  f.message({ ...valid, attachmentId: "" });
  f.message({ ...valid, sessionId: 1 });
  f.message(null);
  f.message({ ...valid, type: "other" });
  assert.equal(
    f.calls.some(([tag]) => tag === "send"),
    false,
  );
  f.message(valid);
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "send").slice(1)), [
    InternalChannels.ScopedServicePortReady,
    { attachmentId: " a ", sessionId: "s" },
  ]);
  f.calls.length = 0;
  const command = { kind: "synthetic" };
  f.message(
    { type: InternalChannels.DatabaseStartupControl, control: { valid: true, data: command } },
    {},
  );
  f.message({ type: InternalChannels.DatabaseStartupControl, control: { valid: false } });
  assert.equal(
    f.calls.some(([tag]) => tag === "send"),
    false,
  );
  f.message({
    type: InternalChannels.DatabaseStartupControl,
    control: { valid: true, data: command },
  });
  assert.equal(f.calls.findLast(([tag]) => tag === "send")[2], command);
  f.emit(PlatformChannels.TaskNotificationSound, {}, "ignored");
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "post").slice(1)), [
    InternalChannels.TaskNotificationSound,
    "*",
  ]);
  f.emit(InternalChannels.DatabaseStartupState, {}, { valid: false });
  f.emit(InternalChannels.DatabaseStartupState, {}, { valid: true, data: command });
  assert.equal(f.calls.findLast(([tag]) => tag === "post")[1].state, command);
});
check("wheel", "axis consumption, RTL, modes and bounded pixel forwarding", () => {
  const f = wheelFixture(),
    scroller = {
      nodeType: 1,
      scrollWidth: 200,
      clientWidth: 100,
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 50,
      scrollLeft: -50,
      style: { overflowX: "auto", overflowY: "auto", direction: "rtl" },
    };
  f.fire(f.event({ deltaX: 10, deltaY: 10 }, [scroller]));
  assert.equal(f.queue.length, 0);
  scroller.scrollTop = 100;
  f.fire(f.event({ deltaX: 10, deltaY: 2, deltaMode: 1 }, [scroller]));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host").slice(1)), [
    EmbeddedBrowserWebviewChannels.WheelBoundary,
    { deltaX: 0, deltaY: 80 },
  ]);
  f.fire(f.event({ deltaY: 20, shiftKey: true, deltaMode: 2 }));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 2000,
    deltaY: 0,
  });
  f.fire(f.event({ deltaX: Infinity, deltaY: 1e6 }));
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 0,
    deltaY: 10000,
  });
  const before = f.calls.length;
  f.fire(f.event({ deltaX: 0.01, deltaY: -0.01, deltaMode: 2 }));
  f.flush();
  assert.equal(f.calls.length, before);
});
check("wheel", "deferred preventDefault, captured payload and uncancelled queued send", () => {
  const f = wheelFixture(),
    blocked = f.event({ deltaY: 12 });
  f.fire(blocked);
  blocked.defaultPrevented = true;
  f.flush();
  assert.equal(
    f.calls.some(([tag]) => tag === "host"),
    false,
  );
  const admitted = f.event({ deltaY: 15 });
  f.fire(admitted);
  admitted.deltaY = 999;
  f.dispose();
  f.dispose();
  f.flush();
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "host")[2]), {
    deltaX: 0,
    deltaY: 15,
  });
  const added = f.calls.find(([tag]) => tag === "add"),
    removed = f.calls.find(([tag]) => tag === "remove");
  assert.equal(added[1], "wheel");
  assert.deepEqual(plain(added[3]), { passive: true });
  assert.equal(removed[2], added[2]);
  assert.equal(removed.length, 3);
});
check("dialog", "isolated bridge admission, boolean filtering and sync fallback", () => {
  const f = dialogFixture();
  assert.deepEqual(
    f.calls.map(([tag]) => tag),
    ["wheel", "expose", "execute"],
  );
  const show = f.exposed.__knorviaEmbeddedBrowserJavaScriptDialog__.show;
  assert.deepEqual(plain(show("confirm", "text")), { handled: true, value: false });
  assert.deepEqual(plain(f.calls.findLast(([tag]) => tag === "sync").slice(1)), [
    PlatformChannels.EmbeddedBrowserJavaScriptDialog,
    { type: "confirm", message: "text" },
  ]);
  f.respond({ handled: true, value: "bad", extra: "drop" });
  assert.deepEqual(plain(show("alert", "")), { handled: true });
  for (const value of [null, 1, false, { handled: 1 }]) {
    f.respond(value);
    assert.deepEqual(plain(show("alert", "")), { handled: false });
  }
  f.fail(new Error("sync down"));
  assert.deepEqual(plain(show("confirm", "")), { handled: false });
  const wheel = f.calls[0];
  wheel[2]("synthetic-channel", {});
  assert.equal(f.calls.at(-1)[0], "host");
});
