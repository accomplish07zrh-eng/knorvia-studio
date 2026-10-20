// SPDX-License-Identifier: Apache-2.0
// 桩身份检测（不依赖桩的错误消息格式）。
//
// B14 需要区分「当前加载的是真实实现还是合同桩」。最初用 `not implemented: services-02`
// 字符串匹配，但那**耦合了桩生成器的错误文案**：将来文案一改，检测就失效而测试仍绿。
//
// 改用**行为特征**判定，三层信号，任一命中即认定为桩：
//   1. 模块导入时直接抛错（桩在顶层 `throw`）—— 真实模块不会；
//   2. 导出值全部为 `undefined`（桩生成的 `export const X: unknown = undefined`）——
//      真实模块的示例导出是对象/函数/字符串等具体值；
//   3. 导出个数为 0 而声明面非 0（极端退化形态）。
//
// 这三条都是**实现行为**，与桩的文案无关。

/** 尝试导入；返回 { loaded } 或 { threw }。 */
export async function probeModule(importModule, row) {
  try {
    const loaded = await importModule(row);
    return { loaded: loaded ?? {}, threw: null };
  } catch (error) {
    return { loaded: null, threw: error };
  }
}

/**
 * 判定一次探测结果是否「像桩」。
 *
 * @param {{loaded: object|null, threw: Error|null}} probe
 * @param {number} declaredCount 该模块在源码中声明的导出个数
 * @returns {{isStub: boolean, reason: string}}
 */
export function classifyStub(probe, declaredCount) {
  if (probe.threw !== null) {
    return { isStub: true, reason: `导入即抛（桩的顶层 throw）：${probe.threw.message}` };
  }
  const names = Object.keys(probe.loaded ?? {});
  if (declaredCount > 0 && names.length === 0) {
    // 纯类型模块本身运行期为空，这条**不能**单独作为桩判据；
    // 只有「声明面非 0 且全部是运行时值」时才可疑，交由调用方结合 role 判断。
    return { isStub: false, reason: "运行期为空对象（可能是纯类型模块）" };
  }
  const allUndefined = names.length > 0 && names.every((name) => probe.loaded[name] === undefined);
  if (allUndefined) {
    return { isStub: true, reason: "全部导出为 undefined（桩的常量占位）" };
  }
  return { isStub: false, reason: "存在具体导出值" };
}
