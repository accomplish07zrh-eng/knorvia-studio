// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type {
  BrowserCommand,
  BrowserCommandMethod,
  BrowserPlaywrightAction,
  BrowserRecordingAction,
} from "../src/browser-use/index.js";

// 从公开调用面构造最小消息，独立于 schema 内部结构。
export const commands = {
  navigate: { method: "navigate", url: "about:blank" },
  back: { method: "back" },
  forward: { method: "forward" },
  reload: { method: "reload" },
  snapshot: { method: "snapshot" },
  click: { method: "click" },
  fill: { method: "fill", ref: "e1", value: "" },
  type: { method: "type", text: "" },
  press: { method: "press", key: "Enter" },
  cuaKeypress: { method: "cuaKeypress", keys: ["Shift"] },
  scroll: { method: "scroll" },
  cuaScroll: { method: "cuaScroll", x: 0, y: -1, scrollX: 1, scrollY: 0 },
  domCuaScroll: { method: "domCuaScroll", scrollX: 0, scrollY: 1 },
  hover: { method: "hover" },
  select: { method: "select", ref: "e1", values: [""] },
  check: { method: "check", ref: "e1" },
  drag: { method: "drag" },
  cuaDrag: { method: "cuaDrag", path: [{ x: 0, y: 0 }] },
  screenshot: { method: "screenshot" },
  getState: { method: "getState" },
  elementInfo: { method: "elementInfo", x: 0, y: 0 },
  evaluate: { method: "evaluate", expression: "0" },
  getDialog: { method: "getDialog" },
  handleDialog: { method: "handleDialog", accept: false },
  waitFor: { method: "waitFor" },
  playwright: { method: "playwright", action: { name: "domSnapshot" } },
  playwrightWaitForTimeout: { method: "playwrightWaitForTimeout", timeoutMs: 0 },
  capabilities: { method: "capabilities" },
  browserVisibilityGet: { method: "browserVisibilityGet" },
  browserVisibilitySet: { method: "browserVisibilitySet", visible: false },
  browserViewportSet: { method: "browserViewportSet", width: 320, height: 320 },
  browserViewportReset: { method: "browserViewportReset" },
  recordingStart: { method: "recordingStart" },
  recordingStatus: { method: "recordingStatus", recordingId: "recording-1" },
  recordingCancel: { method: "recordingCancel", recordingId: "recording-1" },
  activateTab: { method: "activateTab", tabId: "tab-1" },
  newTab: { method: "newTab" },
  finalize: { method: "finalize" },
  finalizeTabs: { method: "finalizeTabs", keep: [] },
  listUserTabs: { method: "listUserTabs" },
  claimTab: { method: "claimTab", tabId: "tab-1" },
  markDeliverable: { method: "markDeliverable", tabId: "tab-1" },
  markHandoff: { method: "markHandoff", tabId: "tab-1" },
  nameSession: { method: "nameSession", name: "A session" },
  turnEnded: { method: "turnEnded" },
  closeSession: { method: "closeSession" },
  cancelRequest: { method: "cancelRequest", requestId: "request-1" },
  close: { method: "close" },
  list: { method: "list" },
} satisfies Record<BrowserCommandMethod, BrowserCommand>;

export const playwrightActions = {
  domSnapshot: { name: "domSnapshot" },
  elementInfo: { name: "elementInfo", x: 0, y: 0 },
  elementScreenshot: { name: "elementScreenshot", x: -1, y: 0 },
  evaluate: { name: "evaluate", expression: "0", expressionKind: "string" },
  waitForLoadState: { name: "waitForLoadState" },
  waitForURL: { name: "waitForURL", url: "**/done" },
  waitForEvent: { name: "waitForEvent", event: "download" },
  downloadPath: { name: "downloadPath", downloadId: "download-1" },
  fileChooserSetFiles: { name: "fileChooserSetFiles", fileChooserId: "chooser-1", files: [""] },
  locator: { name: "locator", selector: "button", operation: "click" },
} satisfies Record<BrowserPlaywrightAction["name"], BrowserPlaywrightAction>;

export const recordingActions = {
  wait: { type: "wait", durationMs: 0 },
  click: { type: "click" },
  type: { type: "type", selector: "input", text: "" },
  hover: { type: "hover" },
  move: { type: "move", x: 0, y: 0 },
  scroll: { type: "scroll", deltaY: 0 },
  scrollTo: { type: "scrollTo" },
  wheel: { type: "wheel", deltaY: 0 },
  drag: {
    type: "drag",
    path: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  waitFor: { type: "waitFor", selector: "input" },
} satisfies Record<BrowserRecordingAction["type"], BrowserRecordingAction>;

export const discovery = {
  requestId: "request-1",
  workspaceKey: "workspace-1",
  workspacePath: "/workspace/one",
  sessionId: "session-1",
  clientMode: "desktop-continuous",
  sessionContext: "live",
} as const;

export const brokerBase = {
  id: "4df5a6e8-3e0b-4571-a6a9-489902c05194",
  runtimeScope: "main",
  token: "fixture-".repeat(4),
  sessionId: "session-1",
} as const;

export const snapshotElement = {
  ref: "e1",
  tag: "input",
  selector: "#name",
  xpath: "//input",
  rect: { x: -1, y: 0, width: 0, height: -1 },
  inViewport: true,
};
