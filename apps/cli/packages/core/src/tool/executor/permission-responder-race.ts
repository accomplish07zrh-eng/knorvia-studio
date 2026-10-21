// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerResult } from "@knorvia/contracts";
import { linkAbortSignal } from "./timeout.js";
import { ResponderChoice, type ResponderSource } from "./approval/responder-choice.js";

interface PermissionResponderRaceInput {
  runHooks: (signal: AbortSignal) => Promise<PermissionBrokerResult | undefined>;
  requestBroker: (
    signal: AbortSignal,
    claimResponse: () => boolean,
  ) => Promise<PermissionBrokerResult>;
  signal?: AbortSignal;
  onHookFailure?: (error: unknown) => void;
}
interface PermissionResponderRaceOutcome {
  result: PermissionBrokerResult;
  source: ResponderSource;
}

export async function racePermissionResponders(
  input: PermissionResponderRaceInput,
): Promise<PermissionResponderRaceOutcome> {
  const hook = new AbortController();
  const broker = new AbortController();
  const unlinkHook = linkAbortSignal(input.signal, hook);
  const unlinkBroker = linkAbortSignal(input.signal, broker);
  const choice = new ResponderChoice();
  try {
    return await new Promise<PermissionResponderRaceOutcome>((resolve, reject) => {
      const publish = (source: ResponderSource, deliver: () => void) => {
        if (!choice.accept(source)) return;
        // 先发布再取消，且不等待败者；其终止过程不能延误已决定的回复。
        deliver();
        (source === "hook" ? broker : hook).abort();
      };
      // Broker 必须同步先建立通道，不能让阻塞的 Hook 独占本函数的启动阶段。
      input
        .requestBroker(broker.signal, () => {
          if (choice.settled || broker.signal.aborted) return false;
          choice.claimBroker();
          hook.abort();
          return true;
        })
        .then(
          (result) => publish("broker", () => resolve({ result, source: "broker" })),
          (error) => publish("broker", () => reject(error)),
        );
      input.runHooks(hook.signal).then(
        (result) => {
          if (result !== undefined) publish("hook", () => resolve({ result, source: "hook" }));
        },
        (error) => {
          if (!choice.settled) input.onHookFailure?.(error);
        },
      );
    });
  } finally {
    unlinkHook();
    unlinkBroker();
  }
}
