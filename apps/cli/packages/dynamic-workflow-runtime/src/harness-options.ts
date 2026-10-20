// SPDX-License-Identifier: Apache-2.0
// harness 的入参形状。全部字段都是兼容面：调用方（bootstrap 的 run service）按这份形状递
// run 元数据，harness 只转交、不加工、不推断。
import type {
  AskSpec,
  Caps,
  ImportedRunCache,
  ValidateFn,
  WorkflowDriver,
  WorkflowReportSink,
} from "@knorvia/dynamic-workflow";
import type { HarnessWarning } from "./entry-file-types.js";

/** driver 工厂：harness 先建 sink（引擎的向上回报面），交给工厂造 driver，再以该 driver 建引擎。 */
export type DriverFactory = (sink: WorkflowReportSink) => WorkflowDriver;

/**
 * runWorkflowScript 的入参。执行体来自 `scriptText` 或 `lowered`（后者优先）；
 * 两者同时给出正是「编译一次」的形态——调用方自己编译得到 `lowered`，同时把作者写的
 * `scriptText` 交下来落库。
 *
 * harness 绝不校验这一对是否自洽：要判断 `lowered` 是否真由 `scriptText` 降级而来，等于把
 * 编译再跑一遍，而那正是「编译一次」要省掉的那次。递进来一份对不上的组合，落库的
 * `script_text` 就会与实际执行的代码不符、resume 的比对基准随之失真——自洽性归调用方所有。
 */
export interface RunWorkflowOptions {
  /**
   * 作者写的 workflow 脚本源码，两个用途：
   * 1. `lowered` 缺省时由 harness lower 它得到执行体；
   * 2. 始终作为 run 元数据落 `dwf_run.script_text`（resume 的比对基准是作者原文，
   *    不是 lowered 函数体）。
   */
  scriptText?: string;
  /**
   * 已 lowered 的 async 函数体（自由标识符仅 `__host`）。给出时优先于 `scriptText` 作为执行体：
   * 安全测试用它投喂手写 lowered 体，编译一次的路径用它交出自己那一次编译的产物。
   */
  lowered?: string;
  runId?: string;
  /** driver 工厂（见 DriverFactory）。driver 自带 journal 与 emit。 */
  makeDriver: DriverFactory;
  caps: Caps;
  /** 每 ask 站点的静态规格。必须覆盖脚本里的每个 ask 站点——引擎把缺席当接线错误硬失败。 */
  askSpecs: ReadonlyMap<string, AskSpec>;
  /** 注入的 schema 校验器（引擎不 import schema 实现）。 */
  validate: ValidateFn;
  /** 外部取消信号：中止在飞 ask 并 kill 子进程，run 结算 cancelled。 */
  signal?: AbortSignal;
  /** 墙钟超时（ms）：到点 kill 子进程，run 结算 failed。缺省不限。 */
  timeoutMs?: number;
  /** 子进程堆上限（MB），映射为 `--max-old-space-size`。缺省 256。 */
  maxOldSpaceSizeMb?: number;
  /**
   * 子进程 spawn 策略的替代形态：给出时 spawn `process.execPath [...argsPrefix, <entry path>]`，
   * 不带任何 Node CLI 旗标。
   *
   * 存在理由：SEA 单文件二进制不解释 Node CLI 旗标，缺省路径的 `--max-old-space-size` 会作为
   * 普通 token 落进 CLI 的严格 parseArgs 而必然报错退出（每个 workflow run 在 SEA 下都失败）。
   * SEA 下由 bootstrap 传入隐藏子命令名作为 argsPrefix，子进程自 re-exec 本二进制并在
   * parseArgs 之前 import() 入口文件、调它的 start。代价是堆上限只能由入口文件自己
   * v8.setFlagsFromString best-effort。
   */
  childSpawn?: { argsPrefix: readonly string[] };
  /**
   * 非致命状况的上报口（今日只有一种：入口文件写不进项目 `.knorvia-studio/`，回落到了 OS
   * 临时目录）。harness 是 app-free 的、没有 logger；bootstrap 把它接到自己的 warn 日志。
   */
  onWarning?: (warning: HarnessWarning) => void;
  /** 子进程工作目录，缺省 process.cwd()；同时作为 run 元数据落 dwf_run.cwd。 */
  cwd?: string;
  /**
   * run 元数据，原样转交 EngineConfig（createRun 落 dwf_run）。全可选，harness 不加工也不推断：
   * `scriptHash` 由调用方计算——harness 若哈希「它看到的文本」，在 lowered 路径上落库的就是
   * lowered 函数体的哈希，resume 校验会拿到一个静默错误的比对对象。脚本原文走 scriptText。
   */
  scriptHash?: string;
  parentSessionId?: string;
  /** run 的展示名（宿主枚举面的标签来源）。与 scriptText 同路，harness 只转交。 */
  name?: string;
  /**
   * 本次 run 的实参（saved workflow 的声明式参数，已由调用方校验并回填默认值）。
   * 两个去处：既随 EngineConfig 落 `dwf_run.args_json`（resume 从那里读回重放），也进 spawn
   * payload 注入沙箱成为冻结的 `args` 全局。harness 不校验、不加工；缺席即 `{}`。
   */
  args?: Record<string, unknown>;
  /** 发起 run 的 CreateWorkflow 工具调用 id（重启后 join/通知锚点）；verbatim 转交 EngineConfig。 */
  toolCallId?: string;
  /**
   * 修订续跑（amend-resume）的一对入参，与其余元数据同规：verbatim 转交 EngineConfig。
   * `resumedFrom` 是落 `dwf_run.resumed_from` 的 lineage 指针，`importedCache` 是注入引擎的
   * 纯数据缓存表。两者的一致性同样归调用方所有——harness 无从判断这张表是否真由那个前驱 run
   * 构建而来（那要求它自己去读 journal，而本包连存储都不认识）。
   */
  resumedFrom?: string;
  /**
   * 发起 run 那一轮的锚点；verbatim 转交 EngineConfig。`subagentModel` 与锚点、阶段表同车：
   * 本 run 子代理的规范 picker 串，harness 同样不读、不解析、不加工——它零 SQL 地活在
   * `run-launched` 事件里，解析与优先级都在宿主侧。`phaseAlongside` 与 `phaseNames` 按位置
   * 对齐（下标指向同一张表）。
   */
  launch?: {
    inputId: string;
    phaseNames?: string[];
    subagentModel?: string;
    phaseAlongside?: number[][];
  };
  importedCache?: ImportedRunCache;
  /**
   * 建 run 时的用量起点（前驱 run 的 `spentTokens`）；与其余元数据同规：verbatim 转交
   * EngineConfig，harness 不读、不加工。读前驱的行发生在 run service。
   */
  inheritedTokens?: number;
}
