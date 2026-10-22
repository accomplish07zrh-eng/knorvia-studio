// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BrowserBackendDescriptor,
  BrowserBackendType,
  BrowserCapabilityDescriptor,
  BrowserCommand,
  BrowserCommandResult,
  BrowserKeyModifier,
  BrowserMouseButton,
  BrowserSnapshot,
  BrowserViewportSize,
} from "@knorvia/contracts/browser-control";
export type { BrowserBackendType };
export type BrowserExecuteFn = (command: BrowserCommand) => Promise<BrowserCommandResult>;
export type BrowserAvailabilityGuard = () => void;
export type BrowserTransportExecuteFn = (
  browserId: string,
  browserGeneration: number,
  command: BrowserCommand,
) => Promise<BrowserCommandResult>;
export type BrowserCapabilityInfo = BrowserCapabilityDescriptor;
export type BrowserInfo = BrowserBackendDescriptor;
export type BrowserDescriptor = Omit<BrowserInfo, "generation">;
export interface BrowserClientTransport {
  list(): Promise<BrowserInfo[]>;
  execute: BrowserTransportExecuteFn;
}
export interface Point {
  x: number;
  y: number;
}
export interface BrowserTabInfo {
  id: string;
  active?: boolean;
  title?: string;
  url?: string;
  viewport: BrowserViewportSize;
}
export interface BrowserHistoryOptions {
  from?: string | Date;
  limit?: number;
  queries?: string[];
  to?: string | Date;
}
export interface BrowserHistoryEntry {
  dateVisited: string;
  title?: string;
  url: string;
}
export type ClickOptions = {
  button?: BrowserMouseButton;
  doubleClick?: boolean;
  modifiers?: BrowserKeyModifier[];
};
export type ClickTarget = string | (Point & ClickOptions);
export type ScreenshotOptions = {
  ref?: string;
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
};
export type SnapshotOptions = { maxElements?: number; includeHidden?: boolean };
export type ScrollOptions = { ref?: string; x?: number; y?: number };
export type Evaluation = string | ((...args: unknown[]) => unknown);
export interface CuaTab {
  click(options: Point & { button?: number; keypress?: string[] }): Promise<void>;
  double_click(options: Point & { keypress?: string[] }): Promise<void>;
  downloadMedia(options: Point & { timeoutMs?: number }): Promise<void>;
  drag(options: { keys?: string[]; path: Point[] }): Promise<void>;
  keypress(options: { keys: string[] }): Promise<void>;
  move(options: Point & { keys?: string[] }): Promise<void>;
  scroll(options: Point & { keypress?: string[]; scrollX: number; scrollY: number }): Promise<void>;
  type(options: { text: string }): Promise<void>;
}
export interface DomCuaTab {
  get_visible_dom(): Promise<BrowserSnapshot>;
  click(options: { node_id: string }): Promise<void>;
  double_click(options: { node_id: string }): Promise<void>;
  downloadMedia(options: { node_id: string; timeoutMs?: number }): Promise<void>;
  type(options: { text: string }): Promise<void>;
  scroll(options: { node_id?: string; x: number; y: number }): Promise<void>;
  keypress(options: { keys: string[] }): Promise<void>;
}
