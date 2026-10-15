// SPDX-License-Identifier: Apache-2.0
// 兼容面：环境变量/重定向闸门与包装剥离的实现按命令公开文档重组于 bash-rules/，
// 本模块路径的四个导出保持签名不变。
export {
  areEnvAssignmentsAllowed,
  areRedirectsAllowed,
  isUnsafeWindowsUncPath,
} from "./bash-rules/env-gates.js";
export { stripSafeCommandWrappers } from "./bash-rules/wrapper-peeling.js";
