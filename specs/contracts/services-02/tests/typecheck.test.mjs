// SPDX-License-Identifier: Apache-2.0
// B14：契约类型自洽。
//
// `contract.example.ts` 用契约类型构造了一组示例值（review 草稿 → 命令、kernel 事件、
// 工作区请求、工作流定义、Agent 工具集合等）。它被 tsc 编译，因此：
//   **任何契约类型之间的不兼容改动都会让这个文件报错** —— 这是一个免费的
//   「契约自洽」编译期检查，也是本包保留该文件的主要理由。
//
// 实现方式：用**工程自己的 tsconfig**（`packages/services/tsconfig.json`）建立 Program，
// 保证与 `pnpm typecheck` 完全同一套 compilerOptions（lib/types/paths 一致），
// 然后只筛出与示例文件及其依赖相关的诊断。不重复发明选项，避免产生
// 「测试自造环境 → 报一堆与契约无关的节点类型错误」的假红。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import pkg from "typescript";

import { entryLabel, repoRoot } from "./entry.mjs";
import { examples, SR_DIR, srcPrefix } from "./scope.mjs";

const ts = pkg;

/** 读工程 tsconfig（含 extends 链），得到与 `pnpm typecheck` 相同的选项。 */
function loadProjectOptions() {
  const configPath = join(repoRoot, "packages/services/tsconfig.json");
  const read = ts.readConfigFile(configPath, (path) => readFileSync(path, "utf8"));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, " "));
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    join(repoRoot, "packages/services"),
  );
  return { options: parsed.options, fileNames: parsed.fileNames };
}

function checkExample() {
  const exampleRow = examples[0];
  assert.ok(exampleRow !== undefined);
  const filePath = join(repoRoot, srcPrefix, SR_DIR, `${exampleRow.modulePath}.ts`).replaceAll(
    "\\",
    "/",
  );

  const { options, fileNames } = loadProjectOptions();
  const normalized = fileNames.map((name) => name.replaceAll("\\", "/"));
  const rootNames = normalized.includes(filePath) ? normalized : [filePath, ...normalized];

  const program = ts.createProgram({ rootNames, options });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  return diagnostics
    .filter((diagnostic) => diagnostic.file !== undefined)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      const name = (diagnostic.file?.fileName ?? "<unknown>").replaceAll("\\", "/");
      const position =
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          : null;
      const where = position ? `${name}:${position.line + 1}:${position.character + 1}` : name;
      return { file: name, text: `${where} ${message}` };
    });
}

describe(`B14 契约类型自洽（${entryLabel}）`, () => {
  it("示例文件存在、非空，且能作为模块真实加载（非桩）", async () => {
    const exampleRow = examples[0];
    assert.ok(exampleRow !== undefined);
    // 桩替换后示例模块顶层会 throw —— 这一步保证 B14 对实现有约束力
    const loaded = await import(
      pathToFileURL(join(repoRoot, srcPrefix, SR_DIR, `${exampleRow.modulePath}.ts`)).href
    );
    assert.equal(typeof loaded, "object");
    const content = readFileSync(
      join(repoRoot, srcPrefix, SR_DIR, `${exampleRow.modulePath}.ts`),
      "utf8",
    );
    assert.ok(content.length > 1000, "示例文件应有实质内容");
  });

  it("示例文件在工程 tsconfig 下无类型错误（契约类型互相兼容）", async () => {
    const exampleRow = examples[0];
    assert.ok(exampleRow !== undefined);

    // 桩是「合法的 TS 类型声明」，所以单看 tsc 诊断无法区分真实实现与桩。
    // 因此先验证示例的导出**是真实值**（桩文件顶层 throw，且导出为 undefined），
    // 再做类型检查 —— 这样这条断言才对实现有约束力（旧门的 allFail 要求）。
    const loaded = await import(
      pathToFileURL(join(repoRoot, srcPrefix, SR_DIR, `${exampleRow.modulePath}.ts`)).href
    );
    const stubShadowed = /not implemented: services-02/u.test(
      readFileSync(join(repoRoot, srcPrefix, SR_DIR, `${exampleRow.modulePath}.ts`), "utf8"),
    );
    assert.equal(stubShadowed, false, "示例文件不应是桩");
    assert.ok(Object.keys(loaded).length > 0, "示例文件应有运行时导出");
    for (const [name, value] of Object.entries(loaded)) {
      assert.notEqual(value, undefined, `示例导出 ${name} 不应为 undefined`);
    }

    const exampleMarker = `${srcPrefix}${SR_DIR}${examples[0].modulePath}.ts`;
    const errors = checkExample().filter((diagnostic) => diagnostic.file.includes(exampleMarker));
    assert.deepEqual(
      errors.map((diagnostic) => diagnostic.text),
      [],
      `示例文件存在类型错误：\n${errors.map((diagnostic) => diagnostic.text).join("\n")}`,
    );
  });
});
