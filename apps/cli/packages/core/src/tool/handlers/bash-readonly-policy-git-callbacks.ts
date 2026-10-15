// SPDX-License-Identifier: Apache-2.0
// 兼容面：git 命令族危险性复核（format 签名占位、reflog 修剪、remote show 连接、
// tag/branch 列举判定）的实现已重组于 bash-rules/git-danger-checks.ts，导出面不变。
export {
  gitBranchCommandIsDangerous,
  gitLsRemoteCommandIsDangerous,
  gitReflogCommandIsDangerous,
  gitRemoteShowCommandIsDangerous,
  gitRevisionFormatCommandIsDangerous,
  gitTagCommandIsDangerous,
} from "./bash-rules/git-danger-checks.js";
