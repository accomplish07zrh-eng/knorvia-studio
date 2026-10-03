// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract-authored comparison engine; rights and validation pending.
type Fields = Record<string, unknown>;
type Pair = { kind: "pair"; left: unknown; right: unknown };
type Frame = Pair
  | { kind: "array"; left: unknown[]; right: unknown[]; index: number; length: number }
  | { kind: "fields"; left: Fields; right: Fields; keys: string[]; index: number }
  | { kind: "exit"; left: object; right: object };

/** Depth-first, short-circuit comparison without making metadata depth a JS stack limit. */
export function areStabilizedValuesEquivalent(left: unknown, right: unknown): boolean {
  const frames: Frame[] = [{ kind: "pair", left, right }];
  const active = new WeakMap<object, WeakSet<object>>();
  while (frames.length > 0) {
    const frame = frames.pop()!;
    if (frame.kind === "exit") {
      active.get(frame.left)?.delete(frame.right);
      continue;
    }
    if (frame.kind === "array") {
      while (frame.index < frame.length && !(frame.index in frame.left)) frame.index += 1;
      if (frame.index < frame.length) {
        const index = frame.index++;
        frames.push(frame, { kind: "pair", left: frame.left[index], right: frame.right[index] });
      }
      continue;
    }
    if (frame.kind === "fields") {
      if (frame.index < frame.keys.length) {
        const key = frame.keys[frame.index++]!;
        frames.push(frame, { kind: "pair", left: frame.left[key], right: frame.right[key] });
      }
      continue;
    }
    const a = frame.left, b = frame.right;
    if (a === b) continue;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    let children: Frame;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      children = { kind: "array", left: a, right: b, index: 0, length: a.length };
    } else {
      const leftFields = a as Fields, rightFields = b as Fields;
      const keys = Object.keys(leftFields).filter((key) => leftFields[key] !== undefined);
      const rightKeys = Object.keys(rightFields).filter((key) => rightFields[key] !== undefined);
      if (keys.length !== rightKeys.length) return false;
      children = { kind: "fields", left: leftFields, right: rightFields, keys, index: 0 };
    }
    let ancestors = active.get(a);
    if (!ancestors) {
      ancestors = new WeakSet<object>();
      active.set(a, ancestors);
    }
    // 原递归会拒绝独立环形对象；显式 frame 不能因此在 UI 线程中无限循环。
    if (ancestors.has(b)) throw new RangeError("Maximum call stack size exceeded");
    ancestors.add(b);
    frames.push({ kind: "exit", left: a, right: b }, children);
  }
  return true;
}
