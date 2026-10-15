// SPDX-License-Identifier: Apache-2.0
// 兼容面：只读判定主链与已知写选项探测的实现已重组于 bash-rules/main-chain.ts，
// 本模块路径的两个导出保持签名不变。
export { evaluateBashReadonlyPolicy, hasKnownBashWriteOption } from "./bash-rules/main-chain.js";
