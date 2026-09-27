// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplSession } from "@knorvia/core/repl";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/shared/browser-use";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { CUA_APP_ASSOCIATIONS_META_KEY } from "@knorvia/cua/host-display-contract";
import { textField } from "./request-context.js";

type Observation =
  | { kind: "metadata"; value: Record<string, unknown> }
  | { kind: "image"; value: Parameters<NodeReplSession["recordBrowserScreenshot"]>[0] }
  | { kind: "application"; value: Parameters<NodeReplSession["recordCuaAppIdentity"]>[0] };
interface ObservationPolicy {
  openTabs?: true;
  endsSession?: true;
  turnScreenshot?: false;
}
const tabChange: ObservationPolicy = { openTabs: true };
const noTurnScreenshot: ObservationPolicy = { turnScreenshot: false };
const policies: Partial<Record<BrowserCommand["method"], ObservationPolicy>> = {
  navigate: tabChange,
  back: tabChange,
  forward: tabChange,
  reload: tabChange,
  click: tabChange,
  fill: tabChange,
  type: tabChange,
  press: tabChange,
  scroll: tabChange,
  hover: tabChange,
  select: tabChange,
  check: tabChange,
  drag: tabChange,
  handleDialog: tabChange,
  close: tabChange,
  capabilities: noTurnScreenshot,
  list: noTurnScreenshot,
  listUserTabs: noTurnScreenshot,
  browserVisibilityGet: noTurnScreenshot,
  cancelRequest: noTurnScreenshot,
  closeSession: noTurnScreenshot,
  nameSession: noTurnScreenshot,
  turnEnded: noTurnScreenshot,
  finalizeTabs: { openTabs: true, endsSession: true, turnScreenshot: false },
};
const locatorWrites = new Set([
  "click",
  "dblclick",
  "downloadMedia",
  "fill",
  "press",
  "selectOption",
  "setChecked",
]);

/** Pure projection of authenticated browser observations; it does not grant permission. */
export function browserObservations(
  command: BrowserCommand,
  result: BrowserCommandResult,
): Observation[] {
  const observations: Observation[] = [];
  if (command.method === "screenshot" && result.ok && result.image) {
    observations.push({ kind: "image", value: result.image });
  }
  const meta = result.meta;
  if (!meta) return observations;
  const policy: ObservationPolicy =
    command.method === "playwright" && command.action.name === "locator"
      ? locatorWrites.has(command.action.operation)
        ? tabChange
        : {}
      : (policies[command.method] ?? {});
  const surface: Record<string, unknown> = {
    kind: "browserUse",
    backend: meta.backendType,
    browserId: meta.browserId,
  };
  if (result.ok && policy.openTabs) surface.openTabIds = meta.openTabIds;
  if (result.ok && policy.endsSession) surface.sessionEnded = true;
  const value: Record<string, unknown> = {
    "knorvia/browserUse": true,
    "knorvia/toolSurface": surface,
    browser_use: meta.currentUrl ? { url: meta.currentUrl } : {},
  };
  if (result.ok && meta.tabId && policy.turnScreenshot !== false) {
    value["knorvia/browserTurnScreenshot"] = {
      browserGeneration: meta.browserGeneration,
      browserId: meta.browserId,
      tabId: meta.tabId,
    };
  }
  observations.push({ kind: "metadata", value });
  return observations;
}

export function computerObservations(frame: Record<string, unknown>): {
  result: CallToolResult;
  observations: Observation[];
} {
  const result = frame.result as CallToolResult | undefined;
  if (!result || !Array.isArray(result.content))
    throw new Error("Computer Use broker returned no result");
  const observations: Observation[] = [];
  if (frame.responseMeta && typeof frame.responseMeta === "object") {
    observations.push({ kind: "metadata", value: frame.responseMeta as Record<string, unknown> });
  }
  const association = result._meta?.[CUA_APP_ASSOCIATIONS_META_KEY] as
    | { primary?: Record<string, unknown> }
    | undefined;
  const primary = association?.primary;
  if (primary && typeof primary === "object") {
    const appKey = textField(primary, "appKey");
    if (appKey) {
      const displayName = textField(primary, "displayName");
      observations.push({
        kind: "application",
        value: { appKey, ...(displayName ? { displayName } : {}) },
      });
    }
  }
  return { result, observations };
}

/** Only the host calls these methods; ordinary cell metadata is not an observation. */
export function publishObservations(
  session: NodeReplSession,
  observations: readonly Observation[],
): void {
  for (const observation of observations) {
    switch (observation.kind) {
      case "metadata":
        session.mergeResponseMeta(observation.value);
        break;
      case "image":
        session.recordBrowserScreenshot(observation.value);
        break;
      case "application":
        session.recordCuaAppIdentity(observation.value);
        break;
    }
  }
}
