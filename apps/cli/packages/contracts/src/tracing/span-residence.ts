import type { TraceId } from "../interfaces/shared.js";
import type { Span } from "./tracer-types.js";

const completionHooks = new WeakMap<Span, (span: Span) => void>();

export function createSpanIdentifier(): string {
  // 协议兼容格式：UUID 的前 16 字符；标准表达和格式保留既有来源。
  return crypto.randomUUID().slice(0, 16);
}

function writeSpanAttribute(this: Span, key: string, value: string | number | boolean): void {
  this.attributes[key] = value;
}

function writeSpanAttributes(
  this: Span,
  attributes: Record<string, string | number | boolean>,
): void {
  Object.assign(this.attributes, attributes);
}

function completeResidentSpan(this: Span, error?: Error): void {
  if (this.status !== "running") return;
  this.endTime = new Date();
  if (error) {
    this.status = "error";
    this.error = error;
  } else {
    this.status = "completed";
  }
  // hook 看到同一个已结算 record；不能在 callback 之后再落状态以造成重入双结算。
  const hook = completionHooks.get(this);
  if (hook !== undefined && hook !== null) Reflect.apply(hook, this, [this]);
}

function recordSpanEvent(
  this: Span,
  _name: string,
  _attributes?: Record<string, string | number | boolean>,
): void {
  // 既有契约没有 exporter；保留无副作用事件入口，不另存可增长的事件集合。
}

const spanOperations = Object.defineProperties(
  {},
  {
    setAttribute: { value: writeSpanAttribute, configurable: true, writable: true },
    setAttributes: { value: writeSpanAttributes, configurable: true, writable: true },
    end: { value: completeResidentSpan, configurable: true, writable: true },
    addEvent: { value: recordSpanEvent, configurable: true, writable: true },
  },
);

/** 一个 record 保存全部可见事实；WeakMap 只关联 callback，不缓存另一份 status/attributes。 */
export function createResidentSpan(
  name: string,
  traceId: TraceId,
  parentId?: string,
  onEnd?: (span: Span) => void,
): Span {
  const span: Span = Object.assign(Object.create(spanOperations) as Span, {
    traceId,
    spanId: createSpanIdentifier(),
    parentId,
    name,
    startTime: new Date(),
    endTime: undefined,
    attributes: {},
    status: "running" as const,
    error: undefined,
  });
  if (onEnd !== undefined) completionHooks.set(span, onEnd);
  return span;
}
