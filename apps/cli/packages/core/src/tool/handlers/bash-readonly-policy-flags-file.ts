// SPDX-License-Identifier: Apache-2.0
// 兼容面：文件检查与系统信息族旗标画像（fd/sort/base64/摘要和/date/hostname）
// 已按各命令公开手册重组于 bash-rules/families/file-flags.ts，导出面不变。
export {
  BASE64_SAFE_FLAGS,
  DATE_SAFE_FLAGS,
  FD_SAFE_FLAGS,
  HOSTNAME_SAFE_FLAGS,
  SHA_SUM_SAFE_FLAGS,
  SORT_SAFE_FLAGS,
} from "./bash-rules/families/file-flags.js";
