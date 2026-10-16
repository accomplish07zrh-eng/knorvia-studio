// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

// Bash 界面展示文本上限与路径长度限制常量
const BASH_OUTPUT_DISPLAY_MAX_CHARS = 150_000;
const BASH_OUTPUT_PATH_MAX_CHARS = 32_768;

// Bash 原始文件不会进入协议，协议仅传递有界头部与真实截断/文件保留事实
export const bashOutputDisplaySchema = z.strictObject({
  outputPath: /* 可选输出文件绝对路径 */ z.string().min(1).max(BASH_OUTPUT_PATH_MAX_CHARS).optional(),
  truncated: /* 是否发生超长截断 */ z.boolean(),
  output: /* 截取的前端展示文本内容 */ z.string().max(BASH_OUTPUT_DISPLAY_MAX_CHARS),
  kind: /* 协议判别标识字面量 */ z.literal("bash_output"),
});
