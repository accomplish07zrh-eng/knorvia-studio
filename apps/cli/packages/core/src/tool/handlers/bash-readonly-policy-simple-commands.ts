// SPDX-License-Identifier: Apache-2.0
// 兼容面：简单命令族（git 全局旗标、观察类工具、单命令画像表）的数据
// 已按各命令公开文档重组于 bash-rules/families/plain-commands.ts，导出面不变。
export {
  GIT_GLOBAL_DANGEROUS_FLAGS,
  GIT_GLOBAL_NO_VALUE_FLAGS,
  GIT_GLOBAL_VALUE_FLAGS,
  READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES,
  READONLY_ALLOW_ANY_ARG_COMMANDS,
  READONLY_COMMAND_POLICIES,
} from "./bash-rules/families/plain-commands.js";
