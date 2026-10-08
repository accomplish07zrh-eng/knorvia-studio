// 修复 0.11.0 发布包启动即崩（Dynamic require of "util" is not supported）：
// services 的图片对比编解码依赖 CommonJS 包 pngjs 7，内联进 ESM 产物后，esbuild 的
// require 垫片在 ESM 作用域里找不到 require 而抛错。不能像 undici 那样外置：仓库根目录
// 提升的是 @fiahfy/icns 带来的 pngjs 6，外置后运行时会解析到错误版本。因此给每个 ESM
// 产物文件注入真实的 require，让内联的 CommonJS 代码按 Node 原生方式加载内置模块。
export const ESM_REQUIRE_BANNER = Object.freeze({
  js: 'import { createRequire as __knorviaCreateRequire } from "node:module"; const require = __knorviaCreateRequire(import.meta.url);',
});
