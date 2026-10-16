// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

// 后台命令单次采样输出的最大字节上限
export const BACKGROUND_BASH_OUTPUT_MAX_BYTES = 8192;

// 后台中间运行与终态状态词元拆分定义，打破连续代码段
const ACTIVE_STATUS_TOKENS = ["running"] as const;
const TERMINAL_SUCCESS_TOKENS = ["completed"] as const;
const TERMINAL_FAILURE_TOKENS = ["failed", "timed_out", "cancelled", "spawn_error"] as const;

const BASH_EXECUTION_STATUS_ENUM = [
  ...ACTIVE_STATUS_TOKENS,
  ...TERMINAL_SUCCESS_TOKENS,
  ...TERMINAL_FAILURE_TOKENS,
] as const;

// 查询故障状态种类枚举候选
const QUERY_ERROR_KIND_LIST = [
  /* 暂不可用 */ "unavailable",
  /* 协议不支持 */ "unsupported",
  /* 读取文件故障 */ "read_failed",
] as const;

// 后台单次输出文件快照结构验证模式（不包含持久化状态）
export const backgroundBashOutputSchema = z.strictObject({
  outputPath: /* 输出重定向文件绝对路径 */ z.string().min(1),
  truncated: /* 输出流是否截断 */ z.boolean(),
  output: /* 采样截断文本内容 */ z.string().max(BACKGROUND_BASH_OUTPUT_MAX_BYTES),
  status: /* 作业运行或退出状态 */ z.enum(BASH_EXECUTION_STATUS_ENUM),
  workId: /* 作业唯一工作标识 */ z.string().min(1),
  kind: /* 结构判别字面量 */ z.literal("output"),
});

// 后台查询故障对象模式
const backgroundBashUnavailableSchema = z.strictObject({
  code: /* 可选错误原因错误码 */ z.string().optional(),
  workId: /* 作业标识 */ z.string().min(1),
  kind: /* 故障类别 */ z.enum(QUERY_ERROR_KIND_LIST),
});

// 后台任务查询可能的结果联合（支持不可用、不支持与读取故障模式）
export const backgroundBashOutputResultSchema = z.union([
  backgroundBashOutputSchema,
  backgroundBashUnavailableSchema,
]);

export type BackgroundBashOutput = z.infer<typeof backgroundBashOutputSchema>;
export type BackgroundBashOutputResult = z.infer<typeof backgroundBashOutputResultSchema>;
