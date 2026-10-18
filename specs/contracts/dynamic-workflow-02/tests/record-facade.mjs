// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 facade 声明面录制器：把两份 facade `.d.ts` 的**去注释声明文本**录进
// fixtures/facade/。契约测试逐字节比对的正是这份文本——脚本作者能看见的 API 面由此钉死，
// 而注释文字不在锁内（重写时注释必须是 Knorvia 自写的，理由见 README「facade 资产的锁定口径」
// 与 known-differences.md K9）。
//
// 为什么用打印器而不是原始文本：`ts.createPrinter({ removeComments: true })` 输出的就是
// 声明本身（成员顺序、修饰符、可选性、类型表达式都在），注释 trivia 被整体剥掉，同一输入
// 两次打印逐字节相同。原始文本里 19 KB 有约 16 KB 是散文注释，逐字节锁原文等于把旧实现的
// 文字搬进合同，重写时只能照抄。
//
// 用法（仓库根目录，Node 24）：
//   node --import tsx specs/contracts/dynamic-workflow-02/tests/record-facade.mjs
// 之后 `facade.test.mjs` 立刻能回放；改了 facade 声明就要重录 + 升合同版本，只改注释不用。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { declarationsOnly } from "./facade-text.mjs";

const dw = await import(
  new URL("../../../../apps/cli/packages/dynamic-workflow/src/index.ts", import.meta.url)
);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../fixtures/facade");
mkdirSync(outDir, { recursive: true });

for (const [name, text] of [
  ["production", dw.FACADE_DTS],
  ["snippet", dw.SNIPPET_FACADE_DTS],
]) {
  const stripped = declarationsOnly(text);
  if (/\/\*|\/\/|^\s*\*/m.test(stripped)) {
    throw new Error(`${name}：打印器没有把注释剥干净，锁里会混进散文`);
  }
  writeFileSync(join(outDir, `${name}-declarations.txt`), stripped, "utf8");
  console.log(
    `record-facade: ${name}-declarations.txt ${stripped.split("\n").length - 1} 行 / ` +
      `${Buffer.byteLength(stripped, "utf8")} 字节（原文 ${Buffer.byteLength(text, "utf8")} 字节）`,
  );
}
