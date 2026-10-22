// SPDX-License-Identifier: Apache-2.0
// C0–C4：类型检查（项目引用构建）+ 桩检测（行为特征，不依赖错误文案）。
//
// ⚠️ 与 services-03 的同名套件的两点差异：
//   ① 本层有 14 个真 I/O 文件 → 桩替换后可能「加载失败」而非「断言失败」；
//      C0 的桩检测必须能区分这两种形态（见 known-differences.md K-z）。
//   ② 聚合桶 `index.ts` / `node.ts` 不在桩替换范围，
//      但它们的转发目标被桩替换后会连带失败 —— C1 单独验证聚合桶可加载。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { extractExports, runtimeExportNames } from "./exports-ast.mjs";
import { importBarrel, importModule, isDist, pkgRoot, repoRoot } from "./entry.mjs";
import { frozen, scopeRows } from "./scope.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

describe(`typecheck（${isDist ? "dist" : "source"} 入口）`, () => {
  test("C0 桩检测：46 个文件必须是真实实现，不能是 import-and-throw 桩", async () => {
    // 判据（三条行为特征，**不依赖桩的错误文案**）：
    //   ① 模块导入时直接抛错              → 桩
    //   ② 有运行时导出但全部为 undefined  → 桩
    //   ③ 声明面非 0 但运行期导出为 0 且导出值全 undefined → 桩
    //
    // ⚠️ 依赖错误文案会把测试耦合到桩生成器（文案一改，检测失效而测试仍绿）。
    const stubbed = [];
    for (const row of scopeRows()) {
      let loaded;
      let importError;
      try {
        loaded = await importModule(row);
      } catch (error) {
        importError = error;
      }

      if (importError !== undefined) {
        stubbed.push(`${row.name}: ①导入即抛（${String(importError.message).split("\n")[0]}）`);
        continue;
      }

      const runtimeNames = runtimeExportNames(repoRoot, row.name);
      if (runtimeNames.length === 0) continue; // 纯类型模块，无可观测运行期值

      const undefinedOnes = runtimeNames.filter((name) => loaded[name] === undefined);
      if (undefinedOnes.length === runtimeNames.length) {
        stubbed.push(`${row.name}: ②${runtimeNames.length} 个运行时导出全为 undefined`);
      }
    }

    assert.deepEqual(stubbed, [], `检测到桩实现：\n${stubbed.join("\n")}`);
  });

  test("C1 聚合桶可加载（index.ts / node.ts）—— 转发链完整性的运行期证据", async () => {
    for (const which of ["index", "node"]) {
      const loaded = await importBarrel(which);
      assert.equal(typeof loaded, "object", `${which}.ts 应可加载`);
      const keys = Object.keys(loaded);
      assert(keys.length > 20, `${which}.ts 应有 >20 个运行时导出（实际 ${keys.length}）`);
      // 聚合桶不应出现「导出值为 undefined」的符号（那是转发失效的征兆）
      const undefinedKeys = keys.filter((key) => loaded[key] === undefined);
      assert.deepEqual(
        undefinedKeys,
        [],
        `${which}.ts 有导出值为 undefined 的符号（转发失效）：${undefinedKeys.join(", ")}`,
      );
    }
  });

  test("C2 tsc 可执行文件存在", async () => {
    await ensureLoadable();
    assert(existsSync(tscBin), `找不到 tsc：${tscBin}`);
  });

  test("C3 项目引用类型检查通过（根级 tsc -b）", async () => {
    await ensureLoadable();
    // ⚠️ 不能只跑 `tsc --noEmit -p packages/services` ——
    // 会因项目引用未构建报 TS6305（不是签名错误，是构建顺序问题）。
    // 标准做法是根级 `tsc -b`，与 package.json 的 typecheck 脚本一致。
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

    // 本包的 46 个文件不得有类型错误
    const ownErrors = output
      .split("\n")
      .filter(
        (line) => /packages[\\/]services[\\/]src[\\/]/u.test(line) && /error TS\d+/u.test(line),
      );
    assert.deepEqual(ownErrors, [], `本层类型错误：\n${ownErrors.join("\n")}`);
  });

  test("C4 46 个文件都有编译产物（.d.ts）", async () => {
    await ensureLoadable();
    const distDir = join(pkgRoot, "dist");
    const missing = [];
    for (const row of scopeRows()) {
      const declaration = join(distDir, row.name.replace(/\.ts$/u, ".d.ts"));
      if (!existsSync(declaration)) missing.push(row.name);
    }
    assert.deepEqual(missing, [], `以下模块缺少 .d.ts：${missing.join(", ")}`);
  });

  test("C5 冻结统计自洽（文件/行/字节/导出）", async () => {
    await ensureLoadable();
    const stats = frozen();
    const rows = scopeRows();
    assert.equal(rows.length, stats.count);
    assert.equal(
      rows.reduce((s, r) => s + r.lines, 0),
      stats.lines,
    );
    assert.equal(
      rows.reduce((s, r) => s + r.bytes, 0),
      stats.bytes,
    );
    assert.equal(
      rows.reduce((s, r) => s + r.exportCount, 0),
      stats.exports,
    );
    assert.equal(
      rows.reduce((s, r) => s + r.runtimeExports, 0),
      stats.runtimeExports,
    );
  });

  test("C6 导出面与 interface.md 逐模块一致（typecheck 视角的交叉校验）", async () => {
    await ensureLoadable();
    const interfaceText = readFileSync(
      join(repoRoot, "specs/contracts/services-04/interface.md"),
      "utf8",
    );
    let total = 0;
    for (const row of scopeRows()) {
      const actual = extractExports(repoRoot, row.name).map((e) => e.name);
      total += actual.length;

      const marker = `### \`packages/services/src/${row.name}\``;
      const start = interfaceText.indexOf(marker);
      assert(start >= 0, `${row.name} 未出现在 interface.md`);
      const next = interfaceText.indexOf("\n### ", start + marker.length);
      const block = interfaceText.slice(start, next < 0 ? interfaceText.length : next);
      const fence = "```";
      const open = block.indexOf(`${fence}ts`);
      assert(open >= 0, `${row.name} 的 interface.md 块缺少 ts 代码围栏`);
      const body = block.slice(open + fence.length + 2, block.lastIndexOf(fence));

      const declared = [];
      for (const m of body.matchAll(
        /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|const|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gmu,
      )) {
        declared.push(m[1]);
      }
      for (const m of body.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s+/gmu)) {
        for (const part of m[1].split(",")) {
          const piece = part.trim().replace(/^type\s+/u, "");
          if (piece === "") continue;
          const alias = /\bas\s+([A-Za-z0-9_$]+)$/u.exec(piece);
          declared.push(alias ? alias[1] : piece);
        }
      }

      assert.deepEqual(
        actual.slice().sort(),
        declared.slice().sort(),
        `${row.name} 的导出面与 interface.md 不一致`,
      );
    }
    assert.equal(total, 145, `46 个模块合计应为 145 项导出，实际 ${total}`);
  });
});
