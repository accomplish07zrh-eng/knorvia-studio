// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import test from "node:test";
import * as wire from "../src/browser-use/index.js";
import type * as cli from "../../../apps/cli/packages/contracts/src/interfaces/browser-control.port.js";
import { brokerBase, discovery, snapshotElement } from "./browser-wire-fixtures.js";

type Equivalent<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const typeParity: [
  Equivalent<wire.BrowserCommand, cli.BrowserCommand>,
  Equivalent<wire.BrowserCommandResult, cli.BrowserCommandResult>,
  Equivalent<wire.BrowserBackendDescriptor, cli.BrowserBackendDescriptor>,
  Equivalent<wire.BrowserSessionContext, cli.BrowserSessionContext>,
  Equivalent<wire.BrowserPlaywrightAction, cli.BrowserPlaywrightAction>,
  Equivalent<wire.BrowserRecordingAction, cli.BrowserRecordingAction>,
] = [true, true, true, true, true, true];

test("CLI and shared browser contracts remain mutually assignable", () => {
  assert.ok(typeParity.every(Boolean));
});

test("backend discovery normalizes identity and defaults only descriptor generation", () => {
  const backend = { id: " b ", type: "iab", name: " Browser ", capabilities: {} };
  assert.deepEqual(wire.browserBackendDescriptorSchema.parse(backend), {
    ...backend,
    id: "b",
    name: "Browser",
    generation: 0,
  });
  for (const type of ["iab", "extension", "cdp"]) {
    assert.equal(wire.browserBackendDescriptorSchema.safeParse({ ...backend, type }).success, true);
  }
  for (const generation of [-1, 0.5, Infinity]) {
    assert.equal(
      wire.browserBackendDescriptorSchema.safeParse({ ...backend, generation }).success,
      false,
    );
  }
  for (const invalid of [
    { ...backend, capabilities: undefined },
    { ...backend, capabilities: { extra: [] } },
    { ...backend, metadata: { count: 1 } },
    { ...backend, apiSupportOverrides: { click: "yes" } },
  ]) {
    assert.equal(wire.browserBackendDescriptorSchema.safeParse(invalid).success, false);
  }
  assert.deepEqual(
    wire.browserCapabilityDescriptorSchema.parse({ id: " click ", description: " Text " }),
    { id: "click", description: "Text" },
  );
  assert.deepEqual(
    wire.browserBackendListResultSchema.parse({ browsers: [backend] }).browsers[0]?.generation,
    0,
  );
});

test("identity, transport mode and exact connection generation remain strict", () => {
  const session = {
    ...discovery,
    workspaceIdentity: " remote-1 ",
    remoteSessionId: " remote-session ",
    browserId: " b ",
    browserGeneration: 0,
  };
  assert.deepEqual(wire.browserSessionContextSchema.parse(session), {
    ...session,
    workspaceIdentity: "remote-1",
    remoteSessionId: "remote-session",
    browserId: "b",
  });
  for (const key of ["requestId", "workspaceKey", "workspacePath", "sessionId"] as const) {
    assert.equal(
      wire.browserDiscoveryContextSchema.safeParse({ ...discovery, [key]: "  " }).success,
      false,
    );
  }
  for (const clientMode of ["desktop-continuous", "web-remote-replayable"]) {
    for (const sessionContext of ["live", "cached"])
      assert.equal(
        wire.browserDiscoveryContextSchema.safeParse({ ...discovery, clientMode, sessionContext })
          .success,
        true,
      );
  }
  assert.equal(
    wire.browserSessionContextSchema.safeParse({ ...discovery, browserId: "b" }).success,
    false,
  );
  assert.equal(
    wire.browserDiscoveryContextSchema.safeParse({ ...discovery, extra: "x" }).success,
    false,
  );
  const commandContext = {
    workspaceKey: " ",
    sessionId: " ",
    requestId: " ",
    clientMode: "desktop-continuous",
  };
  assert.deepEqual(wire.browserCommandContextSchema.parse(commandContext), commandContext);
  assert.equal(
    wire.browserCommandContextSchema.safeParse({ ...commandContext, tabId: "" }).success,
    false,
  );
});

test("actual viewport and input limits remain different, with unchanged display defaults", () => {
  assert.deepEqual(wire.BROWSER_VIEWPORT_LIMITS, {
    minWidth: 320,
    maxWidth: 3840,
    minHeight: 320,
    maxHeight: 2160,
  });
  assert.deepEqual(wire.DEFAULT_AGENT_BROWSER_VIEWPORT, { width: 1280, height: 720 });
  assert.deepEqual(wire.DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE, {
    mode: "normal",
    viewport: { width: 393, height: 852 },
    zoom: "fit",
  });
  assert.deepEqual(wire.BROWSER_VIEWPORT_ZOOM_OPTIONS, [
    "fit",
    "50",
    "75",
    "100",
    "125",
    "150",
    "200",
  ]);
  assert.equal(wire.DEFAULT_BROWSER_VIEWPORT_ZOOM, "fit");
  for (const [width, height, accepted] of [
    [1, 1, false],
    [319, 320, false],
    [320, 320, true],
    [3840, 2160, true],
    [3841, 2160, false],
    [3840, 2161, false],
  ] as const) {
    assert.equal(wire.browserViewportSizeSchema.safeParse({ width, height }).success, true);
    assert.equal(wire.browserViewportInputSchema.safeParse({ width, height }).success, accepted);
  }
  for (const width of [0, -1, 0.5, Infinity])
    assert.equal(wire.browserViewportSizeSchema.safeParse({ width, height: 1 }).success, false);
  for (const mode of ["normal", "responsive"])
    for (const zoom of wire.BROWSER_VIEWPORT_ZOOM_OPTIONS) {
      assert.equal(
        wire.embeddedBrowserViewportPreferenceSchema.safeParse({
          mode,
          viewport: { width: 393, height: 852 },
          zoom,
        }).success,
        true,
      );
    }
});

test("snapshots preserve text before interaction details and do not tighten rectangle geometry", () => {
  const snapshot = {
    elements: [snapshotElement],
    truncated: false,
    domTruncated: true,
    dom: [{ tag: "p", depth: 0, inViewport: true, text: "中文" }],
    title: "Page",
    url: "about:blank",
  };
  const parsed = wire.browserSnapshotSchema.parse(snapshot);
  assert.deepEqual(parsed, snapshot);
  assert.deepEqual(Object.keys(parsed), [
    "url",
    "title",
    "dom",
    "domTruncated",
    "elements",
    "truncated",
  ]);
  for (const invalid of [
    { ...snapshotElement, ref: "" },
    { ...snapshotElement, rect: { ...snapshotElement.rect, extra: 1 } },
    { ...snapshotElement, attributes: { disabled: true } },
  ])
    assert.equal(wire.browserSnapshotElementSchema.safeParse(invalid).success, false);
  for (const depth of [-1, 0.5])
    assert.equal(
      wire.browserSnapshotDomNodeSchema.safeParse({ tag: "p", depth, inViewport: false }).success,
      false,
    );
  assert.equal(
    wire.browserSnapshotSchema.safeParse({ url: "", title: "", elements: [], truncated: false })
      .success,
    true,
  );
});

test("results retain real viewport, nullable dialog, arbitrary values and structured failures", () => {
  const tab = { tabId: "", url: "", title: "", viewport: { width: 1, height: 1 } };
  assert.deepEqual(wire.browserTabSummarySchema.parse(tab), tab);
  assert.equal(
    wire.browserTabSummarySchema.safeParse({ ...tab, viewport: undefined }).success,
    false,
  );
  for (const type of ["alert", "confirm", "prompt", "beforeunload"]) {
    assert.equal(
      wire.browserDialogSchema.safeParse({ type, message: "", defaultPrompt: "" }).success,
      true,
    );
  }
  for (const code of wire.browserErrorCodeSchema.options) {
    const input = {
      ok: false,
      elapsedMs: 0,
      error: { code, message: "", sideEffect: "uncertain" },
    };
    assert.deepEqual(wire.browserCommandResultSchema.parse(input), input);
  }
  const input = {
    ok: true,
    elapsedMs: 0.5,
    dialog: null,
    value: { nested: [null, 1, false] },
    image: { base64: "", mimeType: "image/png" },
    tabs: [tab],
    userTabs: [{ id: "u" }],
  };
  assert.deepEqual(wire.browserCommandResultSchema.parse(input), input);
  assert.equal(
    wire.browserCommandResultSchema.safeParse({ ok: false, elapsedMs: 0 }).success,
    true,
  );
  assert.equal(
    wire.browserCommandResultSchema.safeParse({
      ok: true,
      elapsedMs: 0,
      error: { code: "timeout", message: "" },
    }).success,
    true,
  );
  for (const invalid of [
    { ...input, elapsedMs: -1 },
    { ...input, image: { base64: "", mimeType: "image/jpeg" } },
    { ...input, error: { code: "unknown", message: "x" } },
    { ...input, extra: 1 },
  ])
    assert.equal(wire.browserCommandResultSchema.safeParse(invalid).success, false);
  assert.deepEqual(
    wire.browserPageStateSchema.parse({
      url: "",
      title: "",
      canGoBack: false,
      canGoForward: false,
      viewportWidth: -1.5,
    }),
    { url: "", title: "", canGoBack: false, canGoForward: false, viewportWidth: -1.5 },
  );
});

test("recording result and UI metadata maintain bounds and enum variants", () => {
  const artifact = {
    path: "clip.webm",
    mimeType: "video/webm",
    width: 1,
    height: 1,
    fps: 0.5,
    durationMs: 0,
    frameCount: 0,
  };
  assert.deepEqual(wire.browserRecordingArtifactSchema.parse(artifact), artifact);
  for (const status of ["running", "completed", "failed", "cancelled"])
    for (const phase of [
      "preparing",
      "capturing",
      "finalizing",
      "completed",
      "failed",
      "cancelled",
    ]) {
      assert.equal(
        wire.browserRecordingJobSchema.safeParse({
          id: "r",
          status,
          phase,
          progress: 1,
          startedAt: 0,
          updatedAt: 0,
          artifact,
        }).success,
        true,
      );
    }
  for (const progress of [-0.01, 1.01, Infinity])
    assert.equal(
      wire.browserRecordingJobSchema.safeParse({
        id: "r",
        status: "running",
        phase: "capturing",
        progress,
        startedAt: 0,
        updatedAt: 0,
      }).success,
      false,
    );
  const meta = {
    browserUse: true,
    backendType: "cdp",
    browserId: "b",
    browserGeneration: 0,
    openTabIds: [],
  };
  for (const lifecycle of ["active", "deliverable", "handoff", "closed"])
    assert.equal(wire.browserResponseMetaSchema.safeParse({ ...meta, lifecycle }).success, true);
  assert.equal(
    wire.browserResponseMetaSchema.safeParse({ ...meta, browserUse: false }).success,
    false,
  );
  assert.equal(
    wire.browserResponseMetaSchema.safeParse({ ...meta, browserGeneration: -1 }).success,
    false,
  );
});

test("broker envelopes preserve UUID, token, scope and narrow metadata boundaries", () => {
  assert.equal(wire.NODE_REPL_BROWSER_BROKER_SOCKET_ENV, "KNORVIA_NODE_REPL_BROWSER_BROKER_SOCKET");
  assert.equal(wire.NODE_REPL_BROWSER_BROKER_TOKEN_ENV, "KNORVIA_NODE_REPL_BROWSER_BROKER_TOKEN");
  for (const runtimeScope of ["main", "subagent"]) {
    const input = {
      ...brokerBase,
      runtimeScope,
      op: "list",
      sessionId: " s ",
      trace: { traceId: " t ", spanId: " span ", parentSpanId: " parent " },
    };
    assert.deepEqual(wire.nodeReplBrowserBrokerRequestSchema.parse(input), {
      ...input,
      sessionId: "s",
      trace: { traceId: "t", spanId: "span", parentSpanId: "parent" },
    });
  }
  assert.equal(
    wire.nodeReplBrowserBrokerRequestSchema.safeParse({
      ...brokerBase,
      op: "execute",
      browserId: " b ",
      browserGeneration: 0,
      command: { method: "newTab" },
    }).success,
    true,
  );
  for (const invalid of [
    { ...brokerBase, op: "list", token: "x".repeat(31) },
    { ...brokerBase, op: "list", id: "bad-id" },
    { ...brokerBase, op: "list", workspacePath: "/project" },
    { ...brokerBase, op: "list", trace: { traceId: "t", secret: "no" } },
    { ...brokerBase, op: "execute", browserId: "b", command: { method: "newTab" } },
  ])
    assert.equal(wire.nodeReplBrowserBrokerRequestSchema.safeParse(invalid).success, false);
  for (const input of [
    { id: brokerBase.id, ok: true },
    { id: brokerBase.id, ok: false, error: "failed" },
  ])
    assert.deepEqual(wire.nodeReplBrowserBrokerResponseSchema.parse(input), input);
  assert.equal(
    wire.nodeReplBrowserBrokerResponseSchema.safeParse({ id: brokerBase.id, ok: false, error: "" })
      .success,
    false,
  );
  assert.equal(
    wire.nodeReplBrowserBrokerResponseSchema.safeParse({
      id: brokerBase.id,
      ok: true,
      error: "failed",
    }).success,
    false,
  );
});
