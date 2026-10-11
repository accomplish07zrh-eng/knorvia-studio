// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();
