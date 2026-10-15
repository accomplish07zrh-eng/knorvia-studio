// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// stdio 输出与错误文本的脱敏：捕获子进程 stderr 的尾部，并在写日志前脱敏。
// 脱敏规则（按顺序应用，逐条独立可测）：
// 一、Bearer 令牌：保留 "bearer " 前缀，替换其后的令牌主体。
// 二、authorization 头/赋值：保留前缀与 Bearer 标记，替换值。
// 三、查询串里的密钥参数（key/token/password 等名称，见 SECRET_NAME）。
// 四、JSON 里带引号的密钥字段：保留引号风格。
// 五、不带引号的键值对：按分隔符截断取值。
// 六、URL 里的用户名与密码：保留协议与主机，替换凭据段。
// 顺序不可调整：先处理 Bearer，后续规则才能正确识别 "Bearer " 前缀。
// 捕获约定：
// 七、只保留最近 4000 字符；日志与 read() 都在脱敏后再截断。
// 八、read() 在无内容时返回 undefined（而不是空串），调用方据此决定是否写字段。

import type { Logger } from "@knorvia/contracts";
import type { ProtocolTransport } from "./client-state.js";

const STDERR_LIMIT = 4_000;
const HIDDEN = "[Redacted]";
const SECRET_NAME =
  "(?:(?:api|access|private)[_-]?key|secret(?:[_-]?key)?|token|password|passwd|pass|mysql_pass|mysql_password)";

const BEARER_PATTERN = /(bearer\s+)[^\s'"]+/gi;
const AUTHORIZATION_PATTERN = /(\bauthorization\s*[:=]\s*)([^\r\n]+)/gi;
const BEARER_VALUE_PATTERN = /^bearer\s+/i;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z\d+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const QUERY_SECRET_PATTERN = new RegExp(`([?&]${SECRET_NAME}=)[^&\\s]+`, "gi");
const QUOTED_SECRET_PATTERN = new RegExp(
  `(["']${SECRET_NAME}["']\\s*:\\s*)(["'])([^\\r\\n]*?)\\2`,
  "gi",
);
const BARE_SECRET_PATTERN = new RegExp(`(\\b${SECRET_NAME}\\s*[:=]\\s*["']?)[^\\s"',;)}]+`, "gi");

/** 单条脱敏步骤：输入文本、输出文本，可按任意顺序组合与单测。 */
type RedactionStep = (source: string) => string;

const REDACTION_STEPS: readonly RedactionStep[] = [
  (source) => source.replace(BEARER_PATTERN, `$1${HIDDEN}`),
  (source) =>
    source.replace(
      AUTHORIZATION_PATTERN,
      (_match, prefix: string, value: string) =>
        `${prefix}${BEARER_VALUE_PATTERN.test(value) ? "Bearer " : ""}${HIDDEN}`,
    ),
  (source) => source.replace(QUERY_SECRET_PATTERN, `$1${HIDDEN}`),
  (source) =>
    source.replace(
      QUOTED_SECRET_PATTERN,
      (_match, prefix: string, quote: string) => `${prefix}${quote}${HIDDEN}${quote}`,
    ),
  (source) => source.replace(BARE_SECRET_PATTERN, `$1${HIDDEN}`),
  (source) => source.replace(URL_CREDENTIAL_PATTERN, `$1${HIDDEN}@`),
];

function redact(raw: string): string {
  return REDACTION_STEPS.reduce((current, step) => step(current), raw);
}

interface StderrSource {
  stderr?: {
    on(event: "data", callback: (chunk: { toString(encoding: string): string }) => void): unknown;
  } | null;
}

export class StderrCapture {
  private tail = "";

  attach(transport: ProtocolTransport, name: string, logger: Logger | undefined): void {
    (transport as ProtocolTransport & StderrSource).stderr?.on("data", (chunk) => {
      const piece = chunk.toString("utf8");
      this.tail = (this.tail + piece).slice(-STDERR_LIMIT);
      logger?.debug("MCP stdio stderr", {
        event: "mcp.stdio.stderr",
        mcpServerName: name,
        stderr: redact(piece).slice(0, STDERR_LIMIT),
      });
    });
  }

  read(): string | undefined {
    return this.tail ? redact(this.tail).slice(-STDERR_LIMIT) : undefined;
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}
