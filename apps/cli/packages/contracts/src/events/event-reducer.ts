// SPDX-License-Identifier: Apache-2.0
// 事件归约的对外适配层：把「事件序列 → 投影」与「单事件 → 新投影」两个动作暴露成端口实现。
// 真正的分派在 session-projection-transition.ts，这里只负责种子投影与遍历形态。

import type { EventReducerPort, SessionProjection } from "../interfaces/session.port.js";
import type { SessionId } from "../interfaces/shared.js";
import type { SessionEvent } from "./session.events.js";
import { initialSessionProjection } from "./event-reducer-helpers.js";
import { applySessionProjectionEvent } from "./session-projection-transition.js";

const UNKNOWN_SESSION_ID = "unknown" as SessionId;

/** 投影由调用方持有；本类没有实例字段，所以每次 reduce/apply 都不携带隐藏状态。 */
export class EventReducer implements EventReducerPort {
  /** 单事件转换：投影是入参，返回值是新的投影对象。 */
  apply(projection: SessionProjection, event: SessionEvent): SessionProjection {
    return applySessionProjectionEvent(projection, event);
  }

  /** 顺序归约：种子取模块初值，再把 id 换成首个事件的 sessionId，空数组时用 unknown。 */
  reduce(events: SessionEvent[]): SessionProjection {
    const seed = {
      ...initialSessionProjection,
      id: events[0]?.sessionId ?? UNKNOWN_SESSION_ID,
    } as SessionProjection;
    // 沿用原生 reduce：保持稀疏数组与初始长度的既有语义，也保留子类对 this.apply 的覆盖点。
    return events.reduce((projection, event) => this.apply(projection, event), seed);
  }
}

/** 事件序列 → 投影（每次新建 reducer，调用方之间不共享实例）。 */
export function reduce(events: SessionEvent[]): SessionProjection {
  return new EventReducer().reduce(events);
}

/** 单事件推进投影。 */
export function apply(projection: SessionProjection, event: SessionEvent): SessionProjection {
  return new EventReducer().apply(projection, event);
}
