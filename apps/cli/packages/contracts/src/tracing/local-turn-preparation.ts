// SPDX-License-Identifier: Apache-2.0
// 本地首输出（TTFT）观测入口：只保存观察回调，不保存业务输入或阶段事实。
// 职责边界（替换阶段的自主决定，公开签名见 contracts-02 的 interface.md）：本模块是事实的
// 投递口而不是存储，事实对象由 CLI recorder 拥有；订阅表按 queryId 索引，容量上限与同 id
// 去重在这里裁决；观测回调失败不得影响业务；首输出解绑后不再补采工具循环，因此投递前要
// 重新确认订阅仍然是当前那一个。
// 结算的幂等性用一个小状态对象记录，而不是散落的布尔变量，便于以后扩展更多终态。
import { LOCAL_TTFT_MAX_PENDING, localTtftNow, type LocalTtftDetail } from "@knorvia/shared";

// 本入口只观测这些阶段；attempt/retry_wait/user_confirmation 由别的入口负责。
type PreparationStage =
  | Exclude<LocalTtftDetail["stage"], "attempt" | "retry_wait" | "user_confirmation">
  | "execution";

export interface LocalTurnPreparationFact {
  sessionId: string;
  turnId: string;
  id: string;
  stage: PreparationStage;
  start: number;
  end?: number;
  outcome?: "completed" | "failed" | "cancelled";
}

type PublishFact = (fact: LocalTurnPreparationFact) => void;

interface Subscription {
  publish: PublishFact;
  sequence: number;
}

// 退订与缺省结算共用一个空函数，避免每个调用点各写一份闭包。
function noop(): void {}

// 投递口：订阅仍有效才调用回调，回调自身抛错一律吞掉（遥测不参与业务裁决）。
function deliverSafely(subscription: Subscription, fact: LocalTurnPreparationFact): void {
  try {
    subscription.publish(fact);
  } catch {
    // 观测回调失败不得改变 Core 的返回值或异常。
  }
}

// 订阅注册表：容量上限、同 id 去重、当前性判断三件事集中在这里，
// 让 beginLocalTurnPreparation 只关心事实的组装与投递。
class PreparationSubscriptions {
  readonly #entries = new Map<string, Subscription>();

  get size(): number {
    return this.#entries.size;
  }

  // 超过上限或同 id 已存在时返回 undefined（调用方退化为 noop 退订）。
  add(inputId: string, publish: PublishFact): (() => void) | undefined {
    if (this.#entries.size >= LOCAL_TTFT_MAX_PENDING || this.#entries.has(inputId)) {
      return undefined;
    }
    const subscription: Subscription = { publish, sequence: 0 };
    this.#entries.set(inputId, subscription);
    const unsubscribe = (): void => {
      const registered = this.#entries.get(inputId);
      if (registered === subscription) this.#entries.delete(inputId);
    };
    return unsubscribe;
  }

  find(inputId: string | undefined): Subscription | undefined {
    return inputId === undefined ? undefined : this.#entries.get(inputId);
  }

  // 订阅仍有效才投递：首输出解绑后不再补采工具循环。
  isCurrent(inputId: string, subscription: Subscription): boolean {
    const registered = this.#entries.get(inputId);
    return registered === subscription;
  }
}

const subscriptions = new PreparationSubscriptions();

// 注册观察回调：返回退订函数。inputId 通常是 queryId；
// 容量已满或同 id 重复注册时返回 noop，调用方无需判断。
export function observeLocalTurnPreparation(inputId: string, publish: PublishFact): () => void {
  const unsubscribe = subscriptions.add(inputId, publish);
  return unsubscribe ?? noop;
}

// 开始一次准备阶段观测：投递 start 事实，返回结算函数（缺省 outcome=completed）。
// 没有订阅、缺少 queryId/sessionId/turnId 时返回 noop，不产生任何事实；
// 结算函数幂等，重复调用只投递一次 end。
export function beginLocalTurnPreparation(
  trace: { queryId?: string; sessionId?: string; turnId?: string },
  stage: PreparationStage,
): (outcome?: LocalTurnPreparationFact["outcome"]) => void {
  const queryId = trace.queryId;
  const sessionId = trace.sessionId;
  const turnId = trace.turnId;
  const subscription = subscriptions.find(queryId);
  const usable = subscription !== undefined && queryId !== undefined && sessionId && turnId;
  if (!usable) return noop;

  const sequence = subscription.sequence++;
  const startedAt = localTtftNow();
  const fact: LocalTurnPreparationFact = {
    sessionId: sessionId as string,
    turnId: turnId as string,
    id: `prepare:${sequence}`,
    stage,
    start: startedAt,
  };

  const publish = (value: LocalTurnPreparationFact): void => {
    const stillCurrent = subscriptions.isCurrent(queryId as string, subscription);
    if (!stillCurrent) return;
    deliverSafely(subscription, value);
  };

  publish(fact);
  const completion = { delivered: false };
  return (outcome = "completed") => {
    if (completion.delivered) return;
    completion.delivered = true;
    const completed: LocalTurnPreparationFact = {
      sessionId: fact.sessionId,
      turnId: fact.turnId,
      id: fact.id,
      stage: fact.stage,
      start: fact.start,
      end: localTtftNow(),
      outcome,
    };
    publish(completed);
  };
}
