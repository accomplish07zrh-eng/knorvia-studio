// SPDX-License-Identifier: Apache-2.0
// span 记录：一条 record 保存全部可见事实，状态机只允许 running → completed | error。
// 实现要点（替换阶段的自主决定）：记录用 class 表达，方法挂在原型上，避免每个 span 复制
// 一遍闭包；结算钩子放在 WeakMap 里按 record 关联，不额外保存第二份 status/attributes；
// 结算顺序固定为「先写状态与 endTime，再回调钩子」，重入被状态判断挡住；addEvent 保留签名
// 但不落数据——既有契约没有 exporter，不能引入可增长的事件集合。
// 时间戳统一走 currentTimestamp()：一是让起点与终点用同一种取值方式，二是替换实现里
// 不再散落 new Date() 调用点，便于以后换成可注入的时钟。
import type { TraceId } from "../interfaces/shared.js";
import type { Span, SpanAttributes } from "./tracer-types.js";

// 协议兼容格式：UUID 的前 16 个字符。
const SPAN_ID_LENGTH = 16;

// 完成钩子按 span 记录关联；record 被回收后钩子一并消失。
const completionHooks = new WeakMap<Span, (span: Span) => void>();

// 统一的时钟入口：目前直接取系统时间，不做缓存也不做单调化处理。
function currentTimestamp(): Date {
  return new Date();
}

export function createSpanIdentifier(): string {
  const identifier = crypto.randomUUID();
  return identifier.slice(0, SPAN_ID_LENGTH);
}

// 单个 span 的可见状态与状态机。
export class ResidentSpan implements Span {
  readonly traceId: TraceId;
  readonly spanId: string;
  readonly parentId?: string;
  readonly name: string;
  readonly startTime: Date;
  endTime?: Date;
  attributes: SpanAttributes = {};
  status: "running" | "completed" | "error" = "running";
  error?: Error;

  constructor(name: string, traceId: TraceId, parentId?: string, onEnd?: (span: Span) => void) {
    this.name = name;
    this.traceId = traceId;
    this.spanId = createSpanIdentifier();
    this.parentId = parentId;
    this.startTime = currentTimestamp();
    if (onEnd !== undefined) completionHooks.set(this, onEnd);
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setAttributes(attributes: SpanAttributes): void {
    Object.assign(this.attributes, attributes);
  }

  // 无副作用事件入口：参数为签名兼容保留，不读取、不存储。
  addEvent(_name: string, _attributes?: SpanAttributes): void {}

  end(error?: Error): void {
    const settled = this.settle(error);
    if (!settled) return;
    this.notifyCompletion();
  }

  // 状态机：只有 running 能被结算；返回是否发生了本次结算。
  private settle(error: Error | undefined): boolean {
    if (this.status !== "running") return false;
    this.endTime = currentTimestamp();
    if (error === undefined) {
      this.status = "completed";
      return true;
    }
    this.status = "error";
    this.error = error;
    return true;
  }

  // 钩子看到的是同一个已结算 record；钩子自身抛错不回滚结算结果。
  private notifyCompletion(): void {
    const hook = completionHooks.get(this);
    if (hook === undefined) return;
    completionHooks.delete(this);
    hook(this);
  }
}
