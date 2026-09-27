// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export type {
  BrowserExecuteFn,
  BrowserAvailabilityGuard,
  BrowserTransportExecuteFn,
  BrowserBackendType,
  BrowserCapabilityInfo,
  BrowserInfo,
  BrowserDescriptor,
  BrowserTabInfo,
  BrowserClientTransport,
  BrowserHistoryOptions,
  BrowserHistoryEntry,
  Point,
} from "./facade-contract.js";
export { RawTab } from "./raw-tab.js";
export { Tab } from "./tab.js";
export { AlertDialog, BeforeUnloadDialog, ConfirmDialog, PromptDialog } from "./browser-dialogs.js";
export { BrowserCapabilityCollection } from "./browser-capabilities.js";
export { BrowserRecordingAPI } from "./browser-recording.js";
export { BrowserTabs, BrowserUser } from "./browser-tabs.js";
export { Browser } from "./browser-connection.js";
export { BrowsersFacade } from "./browser-registry.js";
