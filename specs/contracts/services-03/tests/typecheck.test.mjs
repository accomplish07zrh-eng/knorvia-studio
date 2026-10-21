// SPDX-License-Identifier: Apache-2.0
// 类型检查：domain 层 31 个文件必须通过 tsc --noEmit。
//
// 这是「签名兼容」的最强证据 —— 比任何 AST 断言都直接：
// 若替换后某个模块的导出签名变了，引用它的 app/ 与 adapters/（176 处）就会编译失败。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { importModule, isDist, pkgRoot, repoRoot } from "./entry.mjs";
import { runtimeExportNames } from "./exports-ast.mjs";
import { FROZEN, scope, sourcePathOf } from "./scope.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

describe(`typecheck（${isDist ? "dist" : "source"} 入口）`, () => {
  test("C0 桩检测：31 个模块必须是真实实现，不能是 import-and-throw 桩", async () => {
    // 关键（见 known-differences.md K1 / services-02 的同名教训）：
    // tsc 检查在桩下也会通过 —— 桩是合法的 TS 类型声明（`export type X = unknown`、
    // `export const X: unknown = undefined`）。所以 typecheck 套件对「置桩」没有防线。
    //
    // 这里用**行为特征**判定是否为桩，不依赖桩的错误文案
    // （依赖文案会把测试耦合到桩生成器上，文案一改检测就失效而测试仍绿）：
    //   ① 模块导入时直接抛错                  → 桩（真实模块不会）
    //   ② 有运行时导出但全部为 undefined      → 桩（真实实现有值）
    const stubbed = [];
    for (const row of scope) {
      let loaded;
      try {
        loaded = await importModule(row);
      } catch (error) {
        stubbed.push(`${row.modulePath}: 导入即抛（${String(error.message).split("\n")[0]}）`);
        continue;
      }
      const runtimeNames = runtimeExportNames(repoRoot, sourcePathOf(row));
      if (runtimeNames.length === 0) continue; // 纯类型模块，无可观测运行期值
      const undefinedOnes = runtimeNames.filter((name) => loaded[name] === undefined);
      if (undefinedOnes.length === runtimeNames.length) {
        stubbed.push(`${row.modulePath}: ${runtimeNames.length} 个运行时导出全为 undefined`);
      }
    }
    assert.deepEqual(stubbed, [], `检测到桩实现：\n${stubbed.join("\n")}`);
  });

  test("C1 tsc 可执行文件存在", async () => {
    await ensureLoadable();
    assert(existsSync(tscBin), `找不到 tsc：${tscBin}`);
  });

  test("C2 domain 层 31 个文件通过 tsc（项目引用构建）", async () => {
    await ensureLoadable();
    // 用根级项目引用构建（与 package.json 的 typecheck 同一条命令的 tsc 部分）：
    // `tsc -b packages/rpc ... packages/services ...`
    // 单跑 `tsc --noEmit -p packages/services` 会因项目引用未构建而报 TS6305（与签名无关）。
    const projects = [
      "packages/rpc",
      "packages/provider",
      "packages/provider-node",
      "packages/shared",
      "packages/services",
    ];

    let output = "";
    try {
      output = execFileSync(process.execPath, [tscBin, "-b", ...projects, "--pretty", "false"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      assert.fail(`tsc -b 失败：\n${output.slice(0, 4000)}`);
    }

    // 关键：domain 层本身不得有类型错误
    const domainErrors = output
      .split("\n")
      .filter((line) => /studio-runtime\/domain\//u.test(line) && /error TS\d+/u.test(line));
    assert.deepEqual(domainErrors, [], `domain 层类型错误：\n${domainErrors.join("\n")}`);
  });

  test("C3 domain 层 31 个文件都有编译产物（.d.ts）", async () => {
    await ensureLoadable();
    // tsc -b 已在上一条跑过；这里核对每个模块确实产出了声明文件，
    // 证明「签名可编译」而不是「被跳过」。
    const distDir = join(pkgRoot, "dist/studio-runtime/domain");
    const missing = [];
    for (const row of scope) {
      const name = row.modulePath.replace(/^domain\//u, "");
      const declaration = join(distDir, `${name}.d.ts`);
      if (!existsSync(declaration)) missing.push(name);
    }
    assert.deepEqual(missing, [], `以下模块缺少 .d.ts：${missing.join(", ")}`);
  });

  test("C4 冻结统计自洽（行数/字节/导出）", async () => {
    await ensureLoadable();
    const lines = scope.reduce((sum, row) => sum + row.lines, 0);
    const bytes = scope.reduce((sum, row) => sum + row.bytes, 0);
    const exports = scope.reduce((sum, row) => sum + row.exportCount, 0);
    const runtime = scope.reduce((sum, row) => sum + row.runtimeExports, 0);

    assert.equal(scope.length, FROZEN.count);
    assert.equal(lines, FROZEN.lines);
    assert.equal(bytes, FROZEN.bytes);
    assert.equal(exports, FROZEN.exports);
    assert.equal(runtime, FROZEN.runtimeExports);
  });
});
