// SPDX-License-Identifier: Apache-2.0
// shared-02 合同桩：<path>。
// 只含 interface 面的导出签名（类型声明不参与运行时，省略）；import 即抛
// not implemented: shared-02。桩只用于「桩替换后契约测试全部失败」的验证与替换阶段的
// 起始状态，进入替换阶段后随合同桩目录一起退役。

throw new Error("not implemented: shared-02");

export function compareSemverVersions(..._args: unknown[]): unknown {
  throw new Error("not implemented: shared-02");
}

export function resolveForceUpdateRequirement(..._args: unknown[]): unknown {
  throw new Error("not implemented: shared-02");
}
