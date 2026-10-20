// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 权限响应竞速：Hook 与 Broker 同时发问，谁先给答复就采信谁，并立刻取消另一方。
//
// 三条不变量：
//   1. Broker 必须**同步**先建立通道 —— 阻塞的 Hook 不能独占启动阶段；
//   2. 采纳答复后先交付、再取消败者，且不等待败者收尾（它的中止过程不能拖延已定的回复）；
//   3. 只有一次采纳机会；Hook 失败不改变竞速，只在无人采纳时上报。
import type { PermissionBrokerResult } from "@knorvia/contracts";
import { linkAbortSignal } from "./timeout.js";
import { ResponderChoice, type ResponderSource } from "./approval/responder-choice.js";

/** 竞速的参与者：Hook 与 Broker 各有一份取消信号。 */
export interface PermissionResponderRaceInput {
  onHookFailure?: (error: unknown) => void;
  requestBroker: (
    signal: AbortSignal,
    claimResponse: () => boolean,
  ) => Promise<PermissionBrokerResult>;
  runHooks: (signal: AbortSignal) => Promise<PermissionBrokerResult | undefined>;
  signal?: AbortSignal;
}

/** 竞速结果：答复本体 + 它来自哪一方。 */
export interface PermissionResponderRaceOutcome {
  result: PermissionBrokerResult;
  source: ResponderSource;
}

/**
 * 一场竞速的状态。
 * 两个参与者的取消信号在这里成对创建、成对释放；采纳权交给 `ResponderChoice`，
 * 本类只负责「采纳后取消另一侧」与「最终释放」。
 */
class ResponderRace {
  readonly hook = new AbortController();
  readonly broker = new AbortController();
  readonly choice = new ResponderChoice();
  readonly #unlinkHook: () => void;
  readonly #unlinkBroker: () => void;

  constructor(parent?: AbortSignal) {
    // 两侧都跟随同一个上游信号：父被取消时两边一起停，不需要各自监听。
    this.#unlinkHook = linkAbortSignal(parent, this.hook);
    this.#unlinkBroker = linkAbortSignal(parent, this.broker);
  }

  /** 采纳某一方的答复：先交付，再中止另一方。 */
  publish(source: ResponderSource, deliver: () => void): void {
    if (!this.choice.accept(source)) return;
    deliver();
    this.other(source).abort();
  }

  /** 与给定来源相对的另一侧。 */
  other(source: ResponderSource): AbortController {
    return source === "hook" ? this.broker : this.hook;
  }

  /** 释放两个上游监听。 */
  dispose(): void {
    this.#unlinkHook();
    this.#unlinkBroker();
  }

  /** Broker 侧：同步发起，答复到达即尝试采纳。 */
  startBroker(
    input: PermissionResponderRaceInput,
    settle: {
      fail: (error: unknown) => void;
      succeed: (outcome: PermissionResponderRaceOutcome) => void;
    },
  ): void {
    const claim = (): boolean => {
      if (this.choice.settled || this.broker.signal.aborted) return false;
      this.choice.claimBroker();
      this.hook.abort();
      return true;
    };
    input.requestBroker(this.broker.signal, claim).then(
      (result) => this.publish("broker", () => settle.succeed({ result, source: "broker" })),
      (error) => this.publish("broker", () => settle.fail(error)),
    );
  }

  /** Hook 侧：可以「不答复」（返回 undefined 表示放弃），失败不改竞速。 */
  startHook(
    input: PermissionResponderRaceInput,
    settle: { succeed: (outcome: PermissionResponderRaceOutcome) => void },
  ): void {
    input.runHooks(this.hook.signal).then(
      (result) => {
        if (result !== undefined)
          this.publish("hook", () => settle.succeed({ result, source: "hook" }));
      },
      (error) => {
        if (!this.choice.settled) input.onHookFailure?.(error);
      },
    );
  }
}

export async function racePermissionResponders(
  input: PermissionResponderRaceInput,
): Promise<PermissionResponderRaceOutcome> {
  const race = new ResponderRace(input.signal);
  try {
    return await new Promise<PermissionResponderRaceOutcome>((resolve, reject) => {
      // Broker 先发起：它是同步建立通道的一方，必须先于 Hook 启动。
      race.startBroker(input, { fail: reject, succeed: resolve });
      race.startHook(input, { succeed: resolve });
    });
  } finally {
    race.dispose();
  }
}
