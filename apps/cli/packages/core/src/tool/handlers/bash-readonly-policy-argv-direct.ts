// SPDX-License-Identifier: Apache-2.0
// 兼容面：直接判定闸门（find 动作、printf 格式串、定长参数命令）的实现
// 已按各命令公开文档重组于 bash-rules/direct-shape-gates.ts，导出面不变。
export { evaluateDirectReadonlyArgv, isFindWriteOption } from "./bash-rules/direct-shape-gates.js";
