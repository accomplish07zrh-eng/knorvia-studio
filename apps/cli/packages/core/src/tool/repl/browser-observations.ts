// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import type { NodeReplImage } from "../../repl/session-contract.js";

const pageActions = new Set<string>([
  "navigate",
  "back",
  "forward",
  "reload",
  "click",
  "fill",
  "type",
  "press",
  "scroll",
  "hover",
  "select",
  "check",
  "drag",
  "handleDialog",
  "close",
  "evaluate",
]);
const locatorActions = new Set<string>([
  "click",
  "dblclick",
  "downloadMedia",
  "fill",
  "press",
  "selectOption",
  "setChecked",
]);
const nonVisualCommands = new Set<string>([
  "capabilities",
  "list",
  "listUserTabs",
  "browserVisibilityGet",
  "cancelRequest",
  "closeSession",
  "finalizeTabs",
  "nameSession",
  "turnEnded",
]);

function updatesTabs(command: BrowserCommand): boolean {
  switch (command.method) {
    case "finalizeTabs":
      return true;
    case "playwright":
      // core 与 MCP 宿主对 evaluate 的既有观察策略不同，不把两份策略合并。
      return (
        command.action.name === "evaluate" ||
        (command.action.name === "locator" && locatorActions.has(command.action.operation))
      );
    default:
      return pageActions.has(command.method);
  }
}

export function browserObservation(
  command: BrowserCommand,
  response: BrowserCommandResult,
): { screenshot?: NodeReplImage; meta?: Record<string, unknown> } {
  const observation: { screenshot?: NodeReplImage; meta?: Record<string, unknown> } = {};
  if (response.ok && command.method === "screenshot" && response.image)
    observation.screenshot = response.image;
  const facts = response.meta;
  if (!facts) return observation;
  const surface: Record<string, unknown> = {
    kind: "browserUse",
    backend: facts.backendType,
    browserId: facts.browserId,
  };
  if (response.ok && updatesTabs(command)) surface.openTabIds = facts.openTabIds;
  if (response.ok && command.method === "finalizeTabs") surface.sessionEnded = true;
  observation.meta = {
    "knorvia/browserUse": true,
    "knorvia/toolSurface": surface,
    browser_use: facts.currentUrl ? { url: facts.currentUrl } : {},
  };
  if (response.ok && facts.tabId && !nonVisualCommands.has(command.method)) {
    observation.meta["knorvia/browserTurnScreenshot"] = {
      browserGeneration: facts.browserGeneration,
      browserId: facts.browserId,
      tabId: facts.tabId,
    };
  }
  return observation;
}
