// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// Dynamic Workflow Snippet Port —— 临时脚本的编译与执行边界
// ════════════════════════════════════════════════════════════
// 它与 {@link import("./dynamic-workflow-run.port.js").DynamicWorkflowRunPort} 是并列关系，既不合并
// 也不嵌套：run 端口要立得住，前提是持久 journal（没有落盘就谈不上「一个 run」），而 snippet 全程
// 瞬态，两条执行端口就够了。把 snippet 塞进 run 端口，等于让这条实验通道替 durability 陪跑。

import type { TraceContext } from "../tracing/tracer.js";

// 输入侧：调用方递进来的一次求值

/** 一次 snippet 求值请求。给出的值就是执行时用的值：端口不做钳制、不做推导，超时上限的收口留在工具层。 */
export interface DynamicWorkflowSnippetEvalRequest {
  /** snippet 源码，词汇表是 scratch facade：files.* / git.* / log，外加纯 TS。 */
  code: string;
  /** 执行时的工作目录——沙箱子进程的 cwd，也是 world-read 的根。 */
  cwd: string;
  /** 整段 snippet 允许占用的墙钟毫秒数。 */
  timeoutMs: number;
  trace: TraceContext;
}

/** 求值的取消面：调用方拿它中途收手。 */
export interface DynamicWorkflowSnippetEvalOptions {
  signal?: AbortSignal;
}

// 输出侧：编译诊断与结算结果

/** 编译诊断在端口上的 JSON 形状，与 CreateWorkflow 那份保持一致；这里不 import zod schema。 */
export interface DynamicWorkflowSnippetDiagnostic {
  code: number;
  column: number;
  line: number;
  message: string;
}

/** 求值的结构化结果，三种形态两两互斥： - 编译没过：`diagnostics` 非空，什么都没执行； - 执行到底：`artifact` 就是脚本的顶层返回值（返回 undefined 时字段缺席）； - 执行失败：`error` 带稳定错误码（超时、脚本抛错、cap 拒绝都算这一形态）。 后两种形态都会带上 `logs`——失败之前那一段叙事同样有价值。 */
export type DynamicWorkflowSnippetEvalResult =
  | { kind: "diagnostics"; diagnostics: DynamicWorkflowSnippetDiagnostic[] }
  | { kind: "completed"; artifact?: unknown; logs: string[]; logsTruncated: boolean }
  | {
      kind: "failed";
      error: { code: string; message: string };
      logs: string[];
      logsTruncated: boolean;
    };

// 边界：实现方要替掉的那一层

/** snippet 的编译执行边界，由伺候这条瞬时通道的执行器实现；调用方只拿到一个 Promise。 */
export interface DynamicWorkflowSnippetPort {
  /** 编译一趟并同步跑到结算（全程瞬态：不写 dwf_* 行，也不留后台任务）。 */
  evalSnippet(
    request: DynamicWorkflowSnippetEvalRequest,
    options?: DynamicWorkflowSnippetEvalOptions,
  ): Promise<DynamicWorkflowSnippetEvalResult>;
}
