// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import type { PermissionBrokerResult } from "@knorvia/contracts";
import { racePermissionResponders } from "../src/tool/executor/permission-responder-race.js";
import { gate } from "./tool-invocation-fixture.js";

export function responders() {
  const broker = gate<PermissionBrokerResult>();
  const hooks = gate<PermissionBrokerResult | undefined>();
  const parent = new AbortController();
  const timeline: string[] = [];
  const failures: unknown[] = [];
  const signals = new Map<"hook" | "broker", AbortSignal>();
  let claim = () => false;
  const input: Parameters<typeof racePermissionResponders>[0] = {
    signal: parent.signal,
    requestBroker(signal, claimResponse) {
      assert.equal(this, input);
      timeline.push("broker-start");
      signals.set("broker", signal);
      signal.addEventListener("abort", () => timeline.push("broker-abort"), { once: true });
      claim = claimResponse;
      return broker.promise;
    },
    runHooks(signal) {
      assert.equal(this, input);
      timeline.push("hook-start");
      signals.set("hook", signal);
      signal.addEventListener("abort", () => timeline.push("hook-abort"), { once: true });
      return hooks.promise;
    },
    onHookFailure(error) {
      assert.equal(this, input);
      failures.push(error);
    },
  };
  return {
    broker,
    hooks,
    parent,
    timeline,
    failures,
    input,
    start: () => racePermissionResponders(input),
    claim: () => claim(),
    listeners: () => getEventListeners(parent.signal, "abort").length,
    signal(name: "hook" | "broker") {
      const value = signals.get(name);
      assert.ok(value);
      return value;
    },
  };
}

export async function reactions() {
  await Promise.resolve();
  await Promise.resolve();
}
