// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserMouseButton,
  BrowserPlaywrightModifier,
} from "@knorvia/contracts/browser-control";
import type { PlaywrightLocator } from "./playwright-locator.js";

export type Run = (command: BrowserCommand) => Promise<BrowserCommandResult>;
export type ObjectWrapper = <T extends object>(value: T, objectName: string) => T;
export type TextMatcher = string | RegExp;
export type LoadState = "load" | "domcontentloaded" | "networkidle";
export type WaitUntil = LoadState | "commit";
export type WaitForState = "attached" | "detached" | "visible" | "hidden";
export type KeyboardModifier = BrowserPlaywrightModifier;
export type SelectOptionInput = string | { value?: string; label?: string; index?: number };
export interface LocatorClickOptions {
  button?: BrowserMouseButton;
  force?: boolean;
  modifiers?: KeyboardModifier[];
  timeoutMs?: number;
}
export interface LocatorCheckOptions {
  force?: boolean;
  timeoutMs?: number;
}
export interface LocatorFilterOptions {
  has?: PlaywrightLocator;
  hasNot?: PlaywrightLocator;
  hasText?: TextMatcher;
  hasNotText?: TextMatcher;
  visible?: boolean;
}
export interface ElementInfo {
  nodeId?: number | null;
  tagName: string;
  role?: string | null;
  visibleText?: string | null;
  ariaName?: string | null;
  testId?: string | null;
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
  preview: string;
  selector: { primary?: string | null; candidates: string[]; frameSelectors?: string[] };
}
