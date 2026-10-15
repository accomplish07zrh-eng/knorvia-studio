// SPDX-License-Identifier: Apache-2.0
// 兼容面：文本工具族旗标画像（cat/grep/rg/sed/jq/file/tree/xargs 等）
// 已按各命令公开手册重组于 bash-rules/families/text-flags.ts，导出面不变。
export {
  CAT_SAFE_FLAGS,
  FILE_SAFE_FLAGS,
  GREP_SAFE_FLAGS,
  HEAD_TAIL_SAFE_FLAGS,
  JQ_SAFE_FLAGS,
  OPTION_PATTERN,
  RG_SAFE_FLAGS,
  SED_SAFE_FLAGS,
  TREE_SAFE_FLAGS,
  WC_SAFE_FLAGS,
  XARGS_SAFE_FLAGS,
} from "./bash-rules/families/text-flags.js";
