// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 让「v4 交互」与「旧版请求」共用一次已准备的结果：谁先到就用谁，只结算一次。
//
// 三条时序约定：
// 一、**提交失败要先唤醒等待者再抛出** —— 否则等待方会一直挂着等一个已失败的提交；
// 二、**每次失败单独唤醒**：若用户已开始重试，必须继续等新那次的提交，不能用旧通知放行；
// 三、**注册失败要先把结果置为拒绝再抛**，避免 owner 永久悬挂。

import { PermissionPreparation } from "@knorvia/permission-core";
import type {
  V4InteractionAnswer,
  V4InteractionRegistrationOptions,
  V4InteractionRegistry,
} from "../protocol-v4/interaction-registry.js";
import { ProtocolRequestError, type KnorviaProtocolAgentServerContext } from "./server-types.js";

/** 一次准备请求的全部入参。 */
type PrepareAsk<T> = {
  context: KnorviaProtocolAgentServerContext;
  interactionId: string;
  outerSignal: AbortSignal | undefined;
  startRequest: (signal: AbortSignal) => Promise<T>;
  mapAnswer: (answer: V4InteractionAnswer) => T;
  registrationOptions?: V4InteractionRegistrationOptions;
  requestMethod?: string;
};

/** 提交失败的通知：每次失败换一个新的 Promise，等待方按「最新那次」继续等。 */
type CommitGate = { current: Promise<void> | undefined };

/** 未完成状态下的两个可变引用。 */
type PrepareState = {
  registration: ReturnType<V4InteractionRegistry["prepare"]> | undefined;
  gate: CommitGate;
};

/** 造取消错误：带上请求方法名便于区分是哪个请求被取消。 */
function cancelledError(requestMethod: string | undefined): ProtocolRequestError {
  const detail = requestMethod
    ? `Client request cancelled: ${requestMethod}`
    : "Client request cancelled";
  return new ProtocolRequestError(-32021, detail);
}

/** 等所有在途提交结束；owner 已结算时立即返回。 */
async function waitForCommit(
  owner: PermissionPreparation<unknown>,
  gate: CommitGate,
): Promise<void> {
  const settle = owner.result.then(
    () => {},
    () => {},
  );
  while (gate.current && !owner.settled) {
    await Promise.race([gate.current, closedOf(settle)]);
  }
}

/** 把「已结算」信号包一层，避免重复创建。 */
function closedOf(settle: Promise<void>): Promise<void> {
  return settle;
}

/**
 * 包一层 fullAccess：调用期间登记一个提交门，失败时先唤醒等待者再抛出。
 * 成功路径直接返回（不唤醒），因为成功不需要唤醒等待方。
 */
function wrapFullAccess(
  original: NonNullable<V4InteractionRegistrationOptions["fullAccess"]>,
  gate: CommitGate,
): () => Promise<void> {
  return async () => {
    let release!: () => void;
    const failure = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate.current = failure;
    try {
      await original();
    } catch (error) {
      if (gate.current === failure) gate.current = undefined;
      release();
      throw error;
    }
  };
}

/** 装配注册策略：有 fullAccess 就包一层，没有就原样传。 */
function buildPolicy(
  options: V4InteractionRegistrationOptions | undefined,
  gate: CommitGate,
): V4InteractionRegistrationOptions | undefined {
  if (options?.fullAccess === undefined) return options;
  const policy = {} as V4InteractionRegistrationOptions;
  Object.assign(policy, options);
  policy.fullAccess = wrapFullAccess(options.fullAccess, gate);
  return policy;
}

export function prepareClientRequestWithV4Interaction<T>(
  context: KnorviaProtocolAgentServerContext,
  interactionId: string,
  outerSignal: AbortSignal | undefined,
  startRequest: (signal: AbortSignal) => Promise<T>,
  mapAnswer: (answer: V4InteractionAnswer) => T,
  registrationOptions?: V4InteractionRegistrationOptions,
  requestMethod?: string,
): PermissionPreparation<T> {
  const ask: PrepareAsk<T> = {
    context,
    interactionId,
    outerSignal,
    startRequest,
    mapAnswer,
    registrationOptions,
    requestMethod,
  };
  const controller = new AbortController();
  const gate: CommitGate = { current: undefined };
  const state: PrepareState = { registration: undefined, gate };

  const owner = new PermissionPreparation<T>({
    signal: ask.outerSignal,
    cancelled: () => cancelledError(ask.requestMethod),
    dispose: () => {
      state.registration?.dispose();
      controller.abort();
    },
    activate: async () => {
      if (!state.registration!.activate()) {
        owner.dispose();
        return;
      }
      if (owner.settled) return;
      try {
        const value = await ask.startRequest(controller.signal);
        await waitForCommit(owner, gate);
        if (!owner.settled) owner.resolve(value);
      } catch (error) {
        await waitForCommit(owner, gate);
        if (!owner.settled) owner.reject(error);
      }
    },
  });

  try {
    state.registration = ask.context.v4Interactions.prepare(
      ask.interactionId,
      (answer) => owner.resolveFrom(() => ask.mapAnswer(answer)),
      buildPolicy(ask.registrationOptions, gate),
      () => owner.dispose(),
    );
  } catch (error) {
    owner.reject(error);
    throw error;
  }
  return owner;
}

/** 直接调用方的入口：准备、激活、等结果，最后一定 dispose。 */
export async function raceClientRequestWithV4Interaction<T>(
  ...args: Parameters<typeof prepareClientRequestWithV4Interaction<T>>
): Promise<T> {
  const handle = prepareClientRequestWithV4Interaction(...args);
  try {
    handle.activate();
    return await handle.result;
  } finally {
    handle.dispose();
  }
}
