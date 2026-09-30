// SPDX-License-Identifier: Apache-2.0
// Retained public compatibility declaration.

import { spawn } from "node:child_process";

export interface BrowserOpenResult {
  command: string;
  opened: boolean;
  reason?: string;
}

export interface BrowserOpenOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}

export declare function openUrlInBrowser(
  url: string,
  options?: BrowserOpenOptions,
): Promise<BrowserOpenResult>;
