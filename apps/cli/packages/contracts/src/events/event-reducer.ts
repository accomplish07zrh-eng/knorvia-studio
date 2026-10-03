import type { EventReducerPort, SessionProjection } from "../interfaces/session.port.js";
import type { SessionId } from "../interfaces/shared.js";
import type { SessionEvent } from "./session.events.js";
import { initialSessionProjection } from "./event-reducer-helpers.js";
import { applySessionProjectionEvent } from "./session-projection-transition.js";

/** 公开 adapter 无实例业务状态；单事件转换与 ledger changes 由包内唯一 owner 提交。 */
export class EventReducer implements EventReducerPort {
  reduce(events: SessionEvent[]): SessionProjection {
    const initial = {
      ...initialSessionProjection,
      id: events[0]?.sessionId ?? ("unknown" as SessionId),
    } as SessionProjection;
    // native reduce 保留稀疏数组/初始长度语义，也保留 subclass 的 this.apply override。
    return events.reduce((projection, event) => this.apply(projection, event), initial);
  }

  apply(projection: SessionProjection, event: SessionEvent): SessionProjection {
    return applySessionProjectionEvent(projection, event);
  }
}

export function reduce(events: SessionEvent[]): SessionProjection {
  return new EventReducer().reduce(events);
}

export function apply(projection: SessionProjection, event: SessionEvent): SessionProjection {
  return new EventReducer().apply(projection, event);
}
