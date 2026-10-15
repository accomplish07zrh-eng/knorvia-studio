// SPDX-License-Identifier: Apache-2.0
// 兼容面：git 族旗标画像（展示预设与 log/diff/show/grep/status 专属画像）
// 已按 git 公开手册重组于 bash-rules/families/git-flags.ts，导出面不变。
export {
  COMMON_GIT_COLOR_FLAGS,
  COMMON_GIT_COUNT_FLAGS,
  COMMON_GIT_DATE_FLAGS,
  COMMON_GIT_LOG_STYLE_FLAGS,
  COMMON_GIT_PATCH_FLAGS,
  COMMON_GIT_REF_FLAGS,
  COMMON_GIT_STAT_FLAGS,
  GIT_DIFF_SAFE_FLAGS,
  GIT_GREP_SAFE_FLAGS,
  GIT_LOG_SAFE_FLAGS,
  GIT_SHOW_SAFE_FLAGS,
  GIT_STATUS_SAFE_FLAGS,
} from "./bash-rules/families/git-flags.js";
