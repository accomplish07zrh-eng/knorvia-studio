// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type {
  BrowserBackendDescriptor,
  BrowserCommand,
  BrowserCommandResult,
} from "@knorvia/shared/browser-use";
import type { TraceContext } from "../tracing/tracer.js";

// Payload types have one owner. Type-only imports do not mix CLI Zod v3 with wire Zod v4.
export type {
  BrowserBackendType,
  BrowserCapabilityDescriptor,
  BrowserBackendDescriptor,
  BrowserBackendListResult,
  BrowserClientMode,
  BrowserSessionContextKind,
  BrowserViewportSize,
  BrowserDiscoveryContext,
  BrowserSessionContext,
  BrowserCommandMethod,
  BrowserMouseButton,
  BrowserKeyModifier,
  BrowserPlaywrightModifier,
  BrowserPlaywrightLocatorOperation,
  BrowserPlaywrightAction,
  BrowserPoint,
  BrowserRecordingAction,
  BrowserRecordingOptions,
  BrowserCommand,
  BrowserErrorCode,
  BrowserPageState,
  BrowserSnapshotElement,
  BrowserSnapshotDomNode,
  BrowserSnapshot,
  BrowserTabSummary,
  BrowserUserTabInfo,
  BrowserResponseMeta,
  BrowserDialog,
  BrowserRecordingArtifact,
  BrowserRecordingJob,
  BrowserCommandResult,
} from "@knorvia/shared/browser-use";
export { BROWSER_VIEWPORT_LIMITS } from "@knorvia/shared/browser-use/viewport-limits";

export interface BrowserControlListInput {
  sessionId: string;
  turnId?: string;
  traceContext?: TraceContext;
  signal?: AbortSignal;
}
export interface BrowserControlExecuteInput extends BrowserControlListInput {
  browserId: string;
  browserGeneration: number;
  command: BrowserCommand;
}
/** Caller supplies session identity; the adapter resolves workspace and reachable connections. */
export interface BrowserControlPort {
  list(input: BrowserControlListInput): Promise<BrowserBackendDescriptor[]>;
  execute(input: BrowserControlExecuteInput): Promise<BrowserCommandResult>;
  turnEnded?(input: BrowserControlListInput): Promise<void>;
  closeSession?(input: BrowserControlListInput): Promise<void>;
}
