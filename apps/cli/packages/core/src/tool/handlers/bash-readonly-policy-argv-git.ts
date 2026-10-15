// SPDX-License-Identifier: Apache-2.0
// 兼容面：git 全局旗标消毒与只读子命令族匹配的实现已按 git 公开文档重组于
// bash-rules/git-subcommand-gates.ts，本模块路径的两个导出保持签名不变。
export {
  hasDangerousGitGlobalOption,
  isGitReadOnlyCommand,
} from "./bash-rules/git-subcommand-gates.js";
