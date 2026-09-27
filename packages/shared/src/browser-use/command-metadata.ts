// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { field, strict } from "./wire-schema.js";
import { BROWSER_VIEWPORT_LIMITS } from "./viewport-limits.js";

export { BROWSER_VIEWPORT_LIMITS } from "./viewport-limits.js";
export const DEFAULT_AGENT_BROWSER_VIEWPORT = { width: 1280, height: 720 } as const;
export const BROWSER_VIEWPORT_ZOOM_OPTIONS = [
  "fit",
  "50",
  "75",
  "100",
  "125",
  "150",
  "200",
] as const;
export const DEFAULT_BROWSER_VIEWPORT_ZOOM: BrowserViewportZoom = "fit";

// Observed dimensions need not fit the editor's input limits.
export const browserViewportSizeSchema = strict({
  width: field.positiveInt,
  height: field.positiveInt,
});
export const browserViewportInputSchema = strict({
  width: z
    .number()
    .int()
    .min(BROWSER_VIEWPORT_LIMITS.minWidth)
    .max(BROWSER_VIEWPORT_LIMITS.maxWidth),
  height: z
    .number()
    .int()
    .min(BROWSER_VIEWPORT_LIMITS.minHeight)
    .max(BROWSER_VIEWPORT_LIMITS.maxHeight),
});
export const browserViewportZoomSchema = z.enum(BROWSER_VIEWPORT_ZOOM_OPTIONS);
export const embeddedBrowserViewportPreferenceSchema = strict({
  mode: z.enum(["normal", "responsive"]),
  viewport: browserViewportInputSchema,
  zoom: browserViewportZoomSchema,
});
export type BrowserViewportSize = z.infer<typeof browserViewportSizeSchema>;
export type BrowserViewportZoom = z.infer<typeof browserViewportZoomSchema>;
export type EmbeddedBrowserViewportPreference = z.infer<
  typeof embeddedBrowserViewportPreferenceSchema
>;
export const DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE: EmbeddedBrowserViewportPreference = {
  mode: "normal",
  viewport: { width: 393, height: 852 },
  zoom: DEFAULT_BROWSER_VIEWPORT_ZOOM,
};

// Stable enumeration order; the field directory is checked against this vocabulary.
export const browserCommandMethodSchema = z.enum([
  "navigate",
  "back",
  "forward",
  "reload",
  "snapshot",
  "click",
  "fill",
  "type",
  "press",
  "cuaKeypress",
  "scroll",
  "cuaScroll",
  "domCuaScroll",
  "hover",
  "select",
  "check",
  "drag",
  "cuaDrag",
  "screenshot",
  "getState",
  "elementInfo",
  "evaluate",
  "getDialog",
  "handleDialog",
  "waitFor",
  "playwright",
  "playwrightWaitForTimeout",
  "capabilities",
  "browserVisibilityGet",
  "browserVisibilitySet",
  "browserViewportSet",
  "browserViewportReset",
  "recordingStart",
  "recordingStatus",
  "recordingCancel",
  "activateTab",
  "newTab",
  "finalize",
  "finalizeTabs",
  "listUserTabs",
  "claimTab",
  "markDeliverable",
  "markHandoff",
  "nameSession",
  "turnEnded",
  "closeSession",
  "cancelRequest",
  "close",
  "list",
]);
export const browserClientModeSchema = z.enum(["desktop-continuous", "web-remote-replayable"]);
export const browserErrorCodeSchema = z.enum([
  "backend_unavailable",
  "capability_unsupported",
  "duplicate_request_id",
  "ref_not_found",
  "navigation_blocked",
  "timeout",
  "renderer_unreachable",
  "cancelled",
  "execution_error",
]);
export const browserCommandContextSchema = strict({
  workspaceKey: field.nonempty,
  sessionId: field.nonempty,
  tabId: field.nonempty.optional(),
  requestId: field.nonempty,
  clientMode: browserClientModeSchema,
});
export const browserPageStateSchema = strict({
  url: field.text,
  title: field.text,
  canGoBack: field.flag,
  canGoForward: field.flag,
  scrollX: field.number.optional(),
  scrollY: field.number.optional(),
  viewportWidth: field.number.optional(),
  viewportHeight: field.number.optional(),
});
export type BrowserCommandMethod = z.infer<typeof browserCommandMethodSchema>;
export type BrowserClientMode = z.infer<typeof browserClientModeSchema>;
export type BrowserErrorCode = z.infer<typeof browserErrorCodeSchema>;
export type BrowserCommandContext = z.infer<typeof browserCommandContextSchema>;
export type BrowserPageState = z.infer<typeof browserPageStateSchema>;
