// SPDX-License-Identifier: Apache-2.0
// 脱敏器：显式工作栈遍历任意 JSON 形状，环引用/深度/隐藏键统一打码。
import type { LogRedactor } from "@knorvia/contracts";
import { redactDiagnosticText } from "@knorvia/shared";

const MAX_DEPTH = 8;
const HIDDEN_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;

const DEPTH_SENTINEL = "[Redacted:DepthLimit]";
const CIRCULAR_SENTINEL = "[Redacted:Circular]";
const HIDDEN_SENTINEL = "[Redacted]";

export function assignOwn(into: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(into, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

type Visit = { depth: number; read: () => unknown; write: (value: unknown) => void };
type ArrayFrame = { array: unknown[]; depth: number; index: number; result: unknown[] };
type Frame = Visit | ArrayFrame;

type Kind = "circular" | "container" | "depth" | "scalar" | "text";

function isArrayFrame(frame: Frame): frame is ArrayFrame {
  return "array" in frame;
}

/** 判定顺序即旧实现的逐条 if 顺序：深度 → 文本 → 标量 → 环 → 容器。 */
function classify(value: unknown, depth: number, seen: WeakSet<object>): Kind {
  if (depth > MAX_DEPTH) return "depth";
  if (typeof value === "string") return "text";
  if (value === null || typeof value !== "object") return "scalar";
  return seen.has(value) ? "circular" : "container";
}

/** 稀疏数组逐索引推进：不为空槽预建闭包（250000 槽曾额外占用约 192 MiB）。 */
function expandArray(frame: ArrayFrame, stack: Frame[]): void {
  const index = frame.index++;
  if (frame.index < frame.result.length) stack.push(frame);
  if (!(index in frame.array)) return;
  stack.push({
    depth: frame.depth,
    read: () => frame.array[index],
    write: (item) => assignOwn(frame.result, index, item),
  });
}

function writeArray(frame: Visit, value: unknown[], stack: Frame[]): void {
  const copy = new Array<unknown>(value.length);
  frame.write(copy);
  if (copy.length === 0) return;
  stack.push({ array: value, depth: frame.depth + 1, index: 0, result: copy });
}

/**
 * 对象：先占位全部键（保持键序），再自后向前收集待访问帧，最后统一压栈；
 * 隐藏键直接打码，不进入工作栈。
 */
function writeObject(frame: Visit, value: object, stack: Frame[]): void {
  const copy: Record<string, unknown> = {};
  const pairs = Object.entries(value);
  frame.write(copy);
  for (const [key] of pairs) assignOwn(copy, key, undefined);

  const queued: Visit[] = [];
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const [key, item] = pairs[index]!;
    if (HIDDEN_KEY.test(key)) {
      assignOwn(copy, key, HIDDEN_SENTINEL);
      continue;
    }
    queued.push({
      depth: frame.depth + 1,
      read: () => item,
      write: (next) => assignOwn(copy, key, next),
    });
  }
  for (const visit of queued) stack.push(visit);
}

export class DefaultLogRedactor implements LogRedactor {
  redact(input: unknown): unknown {
    let redacted: unknown;
    const seen = new WeakSet<object>();
    const stack: Frame[] = [
      {
        depth: 0,
        read: () => input,
        write: (value) => {
          redacted = value;
        },
      },
    ];
    while (stack.length) {
      const frame = stack.pop()!;
      if (isArrayFrame(frame)) {
        expandArray(frame, stack);
        continue;
      }
      const value = frame.read();
      const kind = classify(value, frame.depth, seen);
      if (kind === "depth") {
        frame.write(DEPTH_SENTINEL);
        continue;
      }
      if (kind === "text") {
        frame.write(redactDiagnosticText(value as string));
        continue;
      }
      if (kind === "scalar") {
        frame.write(value);
        continue;
      }
      if (kind === "circular") {
        frame.write(CIRCULAR_SENTINEL);
        continue;
      }
      const container = value as object;
      seen.add(container);
      if (Array.isArray(container)) writeArray(frame, container, stack);
      else writeObject(frame, container, stack);
    }
    return redacted;
  }
}
