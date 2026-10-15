// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// Execution Port —— 子进程执行的边界契约
// ════════════════════════════════════════════════════════════
// 这里只回答边界问题：调用方交出去什么、实现交回来什么。进程创建、沙箱落地、输出落盘都在实现侧，
// 所以本文件没有可执行逻辑，也不把内部辅助类型放到导出面上。

// 所有权：shell 的解析结论（dialect / source / display）由运行时解析器产生，调用方只读；内嵌搜索前奏
// 与成功后的 cwd 捕获是 Bash 工具的内部动作，hook 与通用命令执行都不得设置。

// 章节：一 端口本体 · 二 命令形态与 shell 语境 · 三 环境与限额 · 四 调用入参
//       五 内嵌搜索前奏 · 六 结算语汇 · 七 过程事件 · 八 后台任务

import type { BackgroundBashOutputResult } from "@knorvia/shared";
import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";

// ── 一、端口本体：边界上有什么 ───────────────────────────────────────

/** 子进程执行的唯一入口。 只有 run 是必备能力，其余带 `?` 的方法都是可选扩展：缺席即表示该实现不支持对应场景，调用方要按 「先探测再使用」对待，不能假定平台一定提供后台任务能力。 */
export interface ExecutionPort {
  run(request: ExecutionRequest, options?: ExecutionRunOptions): Promise<ExecutionResult>;
  start?(
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ): Promise<BackgroundExecutionStartResult>;
  getBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  /** 按 taskId 取已登记后台 Bash 的输出，尾部窗口固定为 8 KiB。 */
  readBackgroundBashOutput?(taskId: string, sessionId: string): Promise<BackgroundBashOutputResult>;
  cancelBackgroundTask?(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  close?(): Promise<void>;
}

// ── 二、命令形态：一次执行怎么递交、用哪个 shell ──────────────────────

/** 递交命令的两种形态：`argv` 直接给出可执行文件与参数数组、不经过 shell；`shell` 交出命令行文本， 由实现选定的 shell 负责解析。只有确实需要管道、重定向或 shell 内建能力时才该走后者。 */
export type ExecutionCommand =
  | {
      mode: "argv";
      file: string;
      args?: string[];
    }
  | {
      mode: "shell";
      command: string;
      shell?: true | string;
      /** Bash 工具专用的 shell 选择档位；hook、用户配置与通用 shell 执行都不得设置它。 */
      shellProfile?: "posix-bash";
      /** 运行时解析出的 Bash shell 选择结果；只有 shellProfile 为 "posix-bash" 的消费者可以读。 */
      shellOverride?: ExecutionShellSelection;
    };

/** shell 的语法族：既决定命令文本怎么写，也决定实现怎么把 cwd 捕获回来。 */
export type ExecutionShellDialect = "cmd" | "posix" | "git-bash";

/** 这次 shell 选择从哪来：自动探测、用户配置，还是旧式兜底。 */
export type ExecutionShellSource = "auto-detected" | "user-config" | "legacy-fallback";

/** 允许透给 provider 的 shell 名称：只有稳定标识，不含机器相关的绝对路径。 */
export interface ExecutionShellDisplay {
  /** 稳定的展示名，例如 "bash"、"zsh"、"Git Bash"、"CMD"、"system shell"；不得写入绝对路径。 */
  name: string;
}

/** 运行时对「这一次用哪个 shell」的完整交代，由解析器拥有，调用方只读。 */
export interface ExecutionShellSelection {
  /** UI / 设置侧给出的稳定 id；由解析器自动判定出来的选择则使用它自铸的 id。 */
  id?: string;
  /** 面向诊断的标签，可以比 display.name 详细。 */
  label?: string;
  /** 已经解析到具体可执行文件时才有；走旧式 shell 兜底时留空。 */
  path?: string;
  /** 语法族，以及 cwd 捕获包装用哪一套。 */
  dialect: ExecutionShellDialect | "legacy-shell";
  /** 这次选择存在的原因。 */
  source: ExecutionShellSource;
  /** 透给 provider 的稳定名称。 */
  display: ExecutionShellDisplay;
}

/** 强调「这是被覆盖进去的选择、而非探测结论」时使用的别名。 */
export type ExecutionShellOverride = ExecutionShellSelection;

// ── 三、环境与限额：子进程能看到什么 ─────────────────────────────────

/** 子进程环境变量的起点：沿用当前进程，还是从空环境重新拼。 */
export type ExecutionEnvBase = "inherit" | "empty";

/** 在环境起点之上做增删：`base` 决定底子，`set` 给出要盖上或覆盖的键值，`unset` 给出最终要摘掉的键。 */
export interface ExecutionEnvOverlay {
  base?: ExecutionEnvBase;
  set?: Record<string, string>;
  unset?: string[];
}

/** 这次执行是否要套沙箱，以及沙箱档位与附带元数据。它表达调用方的意愿与参数，怎么落地由实现侧决定。 */
export interface ExecutionSandboxPolicy {
  enabled: boolean;
  profile?: string;
  dangerouslyDisableSandbox?: boolean;
  metadata?: Record<string, unknown>;
}

/** 输出的体积与落盘策略：内联上限决定交回调用方手里的正文有多长，落盘上限决定磁盘上留下什么。 通用 collector 与 Bash 直写两条路径对字段的解读并不相同，见各字段说明。 */
export interface ExecutionOutputLimit {
  maxInlineBytes?: number;
  maxBufferBytes?: number;
  /** 是否把 stdout / stderr 落到执行输出文件。通用执行走 on_truncate：先做内联截断，之后才开始写盘； Bash 从进程启动起就直写，因此这个取值只影响结算后保留哪些文件。 */
  persistOutput?: "none" | "on_truncate" | "always";
  /** 落盘硬线：通用执行按每路分别计算；Bash 把它当成合并文件的软阈值，每 5 秒核对，越线即终止。 */
  maxPersistedBytes?: number;
  /** 通用管道执行的 artifact 上限；Bash 直写会保留完整文件，因此不读这个字段。 */
  maxArtifactBytes?: number;
  /** 落盘量触顶后是否连进程树一起停掉。它只作用于通用 collector 路径；Bash 的文件软阈值在前台与后台 都会生效，与该开关无关。 */
  killProcessOnPersistedLimit?: boolean;
}

// ── 四、调用入参：把上面这些汇成一条请求 ─────────────────────────────

/** 一次执行请求的完整入参。实现应把它当作不可变输入：请求里的每个字段都由调用方拥有，实现只读不改。 */
export interface ExecutionRequest {
  command: ExecutionCommand;
  /** 归一化后的绝对 cwd；Bash 路径上缺席或只给相对路径时，由实现从会话 cwd 推出来。 */
  cwd?: string;
  /** Bash 工具独有的前置注入，务必只由该工具设置：用户 hook 与通用命令执行都不接受这个字段。 */
  bashPrelude?: ExecutionEmbeddedSearchPrelude;
  /** 执行成功后是否回读内部状态。默认关闭，且只允许 Bash 工具的前台执行打开；它不属于 provider 可见 输出，hook 与通用 shell 命令都不得使用。 */
  captureCwdAfterSuccess?: boolean;
  env?: ExecutionEnvOverlay;
  stdin?: string | Uint8Array;
  timeoutMs?: number;
  outputLimit?: ExecutionOutputLimit;
  sandbox?: ExecutionSandboxPolicy;
  trace?: TraceContext;
}

// ── 五、内嵌搜索前奏：Bash 层的 find / grep / rg 由谁提供 ─────────────

/** 内嵌搜索后端共有的启动描述，仅在本文件内使用。它刻意落在 provider 可见策略之下：运行时以后可以 换掉后端实现，而调用方手里的执行契约不变。 */
interface EmbeddedSearchLaunchSpec {
  /** 真正要拉起的命令及其参数。 */
  command: string;
  args?: string[];
  /** 调用该后端所需的环境变量。桌面端让 Electron Helper 去跑 knorvia.cjs 时，环境里必须带 ELECTRON_RUN_AS_NODE=1，否则拉起来的会是 Electron 语义而不是 Node 语义。 */
  env?: Record<string, string>;
}

/** 后端是随 Knorvia 一起发布的内部 CLI。 */
export interface EmbeddedSearchInternalCliBackend extends EmbeddedSearchLaunchSpec {
  kind: "internal-cli";
}

/** 后端复用当前进程的 argv[0]，按调用名分派到对应实现。 */
export interface EmbeddedSearchArgv0DispatchBackend extends EmbeddedSearchLaunchSpec {
  kind: "argv0-dispatch";
}

/** 后端直接用随包分发的原生可执行文件，每个工具各自一条命令。 */
export interface EmbeddedSearchNativeBinariesBackend {
  kind: "native-binaries";
  findCommand: string;
  grepCommand: string;
  rgCommand: string;
}

/** 三种内嵌搜索后端的可辨识联合。 */
export type EmbeddedSearchBackend =
  | EmbeddedSearchInternalCliBackend
  | EmbeddedSearchArgv0DispatchBackend
  | EmbeddedSearchNativeBinariesBackend;

/** 拼进 Shell 命令行的一段搜索前奏，由 Bash 工具独占使用。 */
export interface ExecutionEmbeddedSearchPrelude {
  kind: "embedded-search";
  backend: EmbeddedSearchBackend;
  /** 置为 false 时只铺 rg 这条兜底路径、不定义 find 与 grep，行为与既有约定保持一致。 */
  findAndGrepEnabled?: boolean;
}

// ── 六、结算语汇：这次执行怎么结束、为什么结束 ───────────────────────

/** 一次执行的终态。 */
export type ExecutionStatus = "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error";

/** 失败的归类，与终态分开表达：终态说明「怎么结束」，这里说明「为什么失败」——沙箱拦截与输出超限 都属于执行结束但结果失败的情形。 */
export type ExecutionFailureType =
  | "spawn_error"
  | "timeout"
  | "cancelled"
  | "sandbox_violation"
  | "output_limit"
  | "unknown";

/** 失败详情；cause 用来留住底层原始错误对象，调用方不应拿 message 文本当流程判据。 */
export interface ExecutionFailure {
  type: ExecutionFailureType;
  message: string;
  cause?: unknown;
}

/** stdout 或 stderr 其中一路的读数。truncated 为真只说明交给调用方的 text 被截断，完整内容可能已经 落在 artifactPath 指向的文件里，也可能根本没有保留，取决于执行时的输出上限设置。 */
export interface ExecutionStreamResult {
  text: string;
  bytes: number;
  truncated: boolean;
  artifactPath?: string;
  artifactBytes?: number;
  artifactTruncated?: boolean;
}

/** 一次执行的结算结果，由实现产出，调用方只读。 */
export interface ExecutionResult {
  status: ExecutionStatus;
  exitCode?: number;
  signal?: string;
  stdout: ExecutionStreamResult;
  stderr: ExecutionStreamResult;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  startedAt: Date;
  completedAt: Date;
  pid?: number;
  error?: ExecutionFailure;
  /** 成功执行后捕获到的内部状态，供运行时串联后续动作，不属于 provider 可见输出。 */
  resolvedCwd?: string;
}

// ── 七、过程事件：执行途中向外播报什么 ───────────────────────────────

/** 一份 Bash 进度读数，按有界尾读算出：它只装得住窗口内那一段，不会把整份命令输出留在手里。 */
export interface ExecutionOutputPreview {
  text: string;
  fullText: string;
  totalLines: number;
  totalBytes: number;
  linesEstimated: boolean;
}

/** 执行过程中向外播报的事件。两条链路的粒度不同：Bash 只发 started / progress / completed / failed 这几个粗节点，逐 chunk 的 stdout / stderr 事件只出现在管道执行路径上。 */
export type ExecutionEvent =
  | {
      type: "started";
      pid?: number;
      timestamp: Date;
    }
  | {
      type: "stdout" | "stderr";
      chunk: Uint8Array;
      text: string;
      timestamp: Date;
    }
  | {
      type: "progress";
      elapsedMs: number;
      pid?: number;
      stdoutBytes: number;
      stderrBytes: number;
      outputPreview?: ExecutionOutputPreview;
      stdoutTail?: string;
      stderrTail?: string;
      timestamp: Date;
    }
  | {
      type: "completed";
      result: ExecutionResult;
      timestamp: Date;
    }
  | {
      type: "failed";
      error: ExecutionFailure;
      timestamp: Date;
    };

/** 调用侧的运行时开关：取消信号、事件回调与 trace 上下文，不参与执行本身的语义。 */
export interface ExecutionRunOptions {
  signal?: AbortSignal;
  onEvent?: (event: ExecutionEvent) => void | Promise<void>;
  context?: ExecutionContext;
}

// ── 八、后台任务：start 之后怎么追踪 ─────────────────────────────────

/** 后台任务状态：running 是后台独有的进行态，其余取值复用前台终态。 */
export type BackgroundExecutionStatus = "running" | ExecutionStatus;

/** 后台启动成功后的立即回执。它只保证任务已经登记，不代表命令已开始产出；后续进展要拿 taskId 查快照。 */
export interface BackgroundExecutionStartResult {
  taskId: string;
  status: "running";
  startedAt: Date;
  pid?: number;
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
}

/** 以 taskId 为线索的一次快照，字段随任务所处阶段逐步补齐：运行中主要看 stdout / stderr 的字节数与 尾部文本，只有结束后才可能有 result 与 error。 */
export interface BackgroundExecutionSnapshot {
  taskId: string;
  status: BackgroundExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  pid?: number;
  stderrBytes?: number;
  stderrTail?: string;
  stdoutBytes?: number;
  stdoutTail?: string;
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
  result?: ExecutionResult;
  error?: ExecutionFailure;
}
