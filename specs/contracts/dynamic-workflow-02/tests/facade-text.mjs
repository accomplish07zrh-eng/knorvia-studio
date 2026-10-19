// SPDX-License-Identifier: Apache-2.0
// facade 声明文本的**唯一**抽取方式：录制侧（record-facade.mjs）与回放侧（facade.test.mjs）
// 共用本文件，两侧不可能分叉。
//
// `ts.createPrinter({ removeComments: true })` 打印回来的就是声明本身：成员顺序、修饰符、
// 可选性、类型表达式都在，注释 trivia 整体消失。选它而不是原始文本逐字节比对，是因为 facade
// 原文 19 KB 里约 16 KB 是散文注释——逐字节锁原文等于把旧实现的介绍文字写进合同，重写时
// 只能照抄；而脚本作者真正依赖的是声明面，注释怎么写不影响任何可观察行为。
import ts from "typescript";

/** 剥掉全部注释后的声明文本（末尾保留打印器的一个换行）。 */
export function declarationsOnly(text) {
  const sourceFile = ts.createSourceFile(
    "workflow-facade.d.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  return printer.printFile(sourceFile);
}
