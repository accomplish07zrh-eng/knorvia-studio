// SPDX-License-Identifier: Apache-2.0
// 兼容外壳：自定义命令入口的公开导出，实现在同目录的 adapter.ts。
export {
  NodeCustomCommandAdapter,
  createNodeCustomCommandAdapter,
  type NodeCustomCommandAdapterOptions,
} from "./adapter.js";
