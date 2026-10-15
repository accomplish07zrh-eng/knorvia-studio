// SPDX-License-Identifier: Apache-2.0
// 日志工厂的形状声明：入参覆盖点、排程入参的裁剪与工厂对外能力。
import type { LogLevel, LogRedactor, LoggerFactory } from "@knorvia/contracts";
import type { LogRetentionScheduleOptions, LogRetentionTimer } from "./retention.js";

/** 输出落点：默认 JSONL 文件；`console` 为真时同时写 stderr。 */
type OutputOption = { console?: boolean | { stream: NodeJS.WritableStream } };

/** 诊断明细：错误栈与脱敏器都可注入，便于宿主替换实现。 */
type DiagnosticsOption = { includeErrorStack?: boolean; redactor?: LogRedactor };

/** 位置与级别：env 用于读运行时环境，logDir/minLevel 可直接覆盖。 */
type LocationOption = { env?: NodeJS.ProcessEnv; logDir?: string; minLevel?: LogLevel };

export interface NodeLoggerFactoryOptions extends OutputOption, DiagnosticsOption, LocationOption {}

/** 排程入参：只暴露宿主需要覆盖的六项，其余由工厂补齐。 */
export type NodeLogRetentionScheduleOptions = Pick<
  LogRetentionScheduleOptions,
  "delayMs" | "logger" | "now" | "retentionDays" | "setTimeout"
>;

export interface NodeLoggerFactory extends LoggerFactory {
  getLogDir(): string;
  scheduleLogRetentionCleanup(
    options?: NodeLogRetentionScheduleOptions,
  ): LogRetentionTimer | undefined;
}
