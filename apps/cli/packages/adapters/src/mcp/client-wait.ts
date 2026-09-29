// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { McpConnectOptions, McpServerStatus } from "@knorvia/contracts";
import type { McpClientState, ServerRecord } from "./client-state.js";

export async function waitForRecord(
  state: McpClientState,
  name: string,
  record: ServerRecord,
  options: McpConnectOptions,
): Promise<McpServerStatus> {
  if (!record.pending) return record.status;
  const timeout = options.oauthAuthorizationTimeoutMs;
  const signal = options.signal;
  if (timeout === undefined && !signal) return record.pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listener: (() => void) | undefined;
  const snapshot = () => state.snapshot(name, record.status);
  const race: Promise<McpServerStatus>[] = [record.pending];
  if (timeout !== undefined) {
    race.push(
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(snapshot()), timeout);
      }),
    );
  }
  if (signal) {
    race.push(
      new Promise((resolve) => {
        listener = () => resolve(snapshot());
        if (signal.aborted) listener();
        else signal.addEventListener("abort", listener, { once: true });
      }),
    );
  }
  try {
    return await Promise.race(race);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && listener) signal.removeEventListener("abort", listener);
  }
}
