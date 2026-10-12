// SPDX-License-Identifier: Apache-2.0
// 兼容外壳：文件读写原语的公开导出，读在 read-primitives、写在 write-publish。
export { bounded, prefix } from "./read-primitives.js";
export { publish } from "./write-publish.js";
