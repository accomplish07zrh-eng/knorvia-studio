// SPDX-License-Identifier: Apache-2.0
// core-tool-01 旧门的 dist 入口：契约测试只有一份，用解析钩子把对
// apps/cli/packages/core/src/tool/** 的引用重定向到构建产物 dist/tool/**，
// 这样源码入口与 dist 入口跑的是同一套用例，不复制测试代码。
//
// 用法（在仓库根目录，先跑 pnpm build:cli-packages）：
//   node --import tsx --import specs/contracts/core-tool-01/dist-entry-loader.mjs \
//     --test specs/contracts/core-tool-01/tests/*.test.ts
import { registerHooks } from "node:module";

const SOURCE_SEGMENT = "/apps/cli/packages/core/src/tool/";
const DIST_SEGMENT = "/apps/cli/packages/core/dist/tool/";
// 测试按 TypeScript 习惯写 .js 说明符，tsx 会先解析到 .ts 源文件；
// 重定向到构建产物时必须把扩展名换回编译后的产物扩展名。
const DIST_EXTENSIONS = [
  [/\.tsx$/u, ".js"],
  [/\.ts$/u, ".js"],
  [/\.mts$/u, ".mjs"],
  [/\.cts$/u, ".cjs"],
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (typeof resolved.url !== "string" || !resolved.url.includes(SOURCE_SEGMENT)) return resolved;
    let url = resolved.url.replace(SOURCE_SEGMENT, DIST_SEGMENT);
    for (const [pattern, replacement] of DIST_EXTENSIONS) {
      if (pattern.test(url)) {
        url = url.replace(pattern, replacement);
        break;
      }
    }
    return { ...resolved, url, shortCircuit: true };
  },
});
