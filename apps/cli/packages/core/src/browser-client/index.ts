// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export {
  BrowsersFacade,
  Browser,
  BrowserTabs,
  BrowserRecordingAPI,
  RawTab,
  Tab,
  type BrowserTabInfo,
  type BrowserBackendType,
  type BrowserAvailabilityGuard,
  type BrowserCapabilityInfo,
  type BrowserClientTransport,
  type BrowserExecuteFn,
  type BrowserTransportExecuteFn,
  type BrowserInfo,
  type BrowserDescriptor,
} from "./facade.js";
export { BrowserCommandError } from "./result.js";
export {
  PlaywrightAPI,
  PlaywrightDownload,
  PlaywrightFileChooser,
  PlaywrightFrameLocator,
  PlaywrightLocator,
  type ElementInfo,
  type KeyboardModifier,
  type LoadState,
  type TextMatcher,
  type WaitUntil,
} from "./playwright.js";
export { selectBrowserForUrl, selectDefaultBrowser } from "./selection.js";
export {
  BrowserApiPolicy,
  createBrowserApiProxy,
  loadBrowserApiManifest,
  type BrowserApiManifest,
  type BrowserApiManifestMember,
} from "./manifest.js";
export { setupBrowserRuntime } from "./runtime-installation.js";
