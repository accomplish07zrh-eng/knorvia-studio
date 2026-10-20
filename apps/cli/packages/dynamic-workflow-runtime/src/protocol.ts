// SPDX-License-Identifier: Apache-2.0
// 线协议（NDJSON over stdio）。本文件是消息形状的唯一真源；子进程侧的一份手写镜像在
// child-runtime.ts 的内嵌源码里，两处必须一起改。
//
// 方向：子进程 → 父进程 的 create-actor / request / event / complete，
// 以及父进程 → 子进程 的 response。字段名与判别值都是兼容面，不得改名或合并。
import type { ArtifactContentOp, ArtifactPresetOp, WorldReadOp } from "@knorvia/dynamic-workflow";

/** 跨边界的结构化错误：让沙箱里的脚本能按 code/violations/finalText 处理拒绝。 */
export interface WireError {
  name: string;
  message: string;
  code?: string;
  violations?: unknown[];
  finalText?: string;
  stack?: string;
}

/**
 * 同步创建 actor 的通知。走即发即忘而不是 request/response：`createActor` 必须同步返回句柄，
 * 而子进程无法为一次同步返回等待一个 round-trip，于是它先造一个 child-local 句柄（`local#N`）
 * 并把本条消息塞进同一条 FIFO；父进程处理 create-actor 是同步的，所以任何引用该句柄的 ask
 * 到达时，local → engine ActorId 的映射已经就绪。
 */
export interface CreateActorMessage {
  kind: "create-actor";
  localId: string;
  siteId: string;
  name?: string;
  persona?: unknown;
}

/**
 * 需要应答的宿主调用：ask、world-read，或内容产物的发布。
 * 内容产物是效应（脚本 await 它、要 catch 它的拒绝），所以走 request/response；
 * 预置产物是声明（返回 void），走下面的事件通道。
 */
export interface RequestMessage {
  kind: "request";
  id: string;
  type: "ask" | "world-read" | "publish-artifact";
  siteId: string;
  /** ask 专属：child-local actor 句柄。 */
  actor?: string;
  /** ask 专属：指令正文。 */
  instructions?: string;
  /** world-read 专属：op（词汇表由 world-read 注册表推导）。 */
  op?: WorldReadOp;
  /**
   * publish-artifact 专属的内容 op。刻意与 `op` 分成两个字段：把两者并成一个联合类型后，
   * 父进程分派时还得靠 `type` 再窄化一次，而两个字段各自就说明了属于哪张注册表。
   */
  artifactOp?: ArtifactContentOp;
  /**
   * world-read 的位置实参数组。lowering 原样打包调用点实参，本层原样透传；
   * 单实参的字符串字段撑不住多参与无参的 op（`files.grep(pattern, glob?)`、`git.status()`）。
   */
  args?: unknown[];
}

/**
 * 即发即忘的事件，按 `type` 判别。三者都无需应答，但耐久性不同：`log` 丢了只是少一行闲话，
 * `report` 丢了是少一条发现（父进程要落 journal），所以通道的 FIFO 顺序对 report 是承重的。
 *
 * `declare-artifact` 必须与 report 同在这条通道上：一条带标签的 report 只能在它的预置声明
 * 已到达父进程之后才合法。脚本里声明在前、report 在后，同一条 FIFO 保证父进程也按此顺序看到。
 */
export type EventMessage =
  | LogEventMessage
  | ReportEventMessage
  | DeclareArtifactEventMessage
  | PhaseEnteredEventMessage;

/** 控制流经过 `phase("…")` 标记：无站点、不落 journal，只让引擎发一条 phase-entered。 */
export interface PhaseEnteredEventMessage {
  kind: "event";
  type: "phase-entered";
  /** 作者的原词，lowering 已去两端空白。 */
  name: string;
}

/** 进度消息：无站点、不落 journal。 */
export interface LogEventMessage {
  kind: "event";
  type: "log";
  message: string;
}

/** 一条中间结果：脚本从不 await 它，但父进程会按 siteId × ordinal 落一行 dwf_node。 */
export interface ReportEventMessage {
  kind: "event";
  type: "report";
  siteId: string;
  item: unknown;
  /**
   * 产物标签（`report(item, "perf")`）：这条 item 同时喂给哪个预置产物。
   * 缺席即无标签——JSON.stringify 会把 undefined 整个键丢掉，线上就是「没有这个键」。
   */
  artifactId?: string;
}

/** 一次预置产物的声明；facade 成员同步返回 void，因此走事件通道。 */
export interface DeclareArtifactEventMessage {
  kind: "event";
  type: "declare-artifact";
  siteId: string;
  op: ArtifactPresetOp;
  /** 位置实参数组（`[id, spec]`），lowering 原样打包、本层原样透传。 */
  args: unknown[];
}

/** 脚本执行终结：拿到顶层返回值，或抛了错。 */
export interface CompleteMessage {
  kind: "complete";
  ok: boolean;
  value?: unknown;
  error?: WireError;
}

/** 子进程 → 父进程的全部消息。 */
export type ChildMessage = CreateActorMessage | RequestMessage | EventMessage | CompleteMessage;

/** 对一次 request 的应答。 */
export interface ResponseMessage {
  kind: "response";
  id: string;
  ok: boolean;
  value?: unknown;
  error?: WireError;
}

/** 父进程 → 子进程的全部消息。 */
export type ParentMessage = ResponseMessage;

/**
 * 子进程的初始 payload，作为 JSON 字面量内嵌在入口文件里（不经 argv / base64，
 * 因为 Windows 的命令行上限是 32,767 字符）。
 */
export interface ChildPayload {
  /** lowered 脚本的 async 函数体（自由标识符仅 `__host`）。 */
  lowered: string;
  /**
   * 本次 run 的实参，注入沙箱成为**冻结**的 `args` 全局。
   * 只在启动时过界一次，此后不再更新；缺席解读为 `{}`，于是脚本里的 `args.x` 永远是
   * 一次合法的属性读而不是崩溃。
   */
  args?: Record<string, unknown>;
  /**
   * 堆上限（MB）。**只在 argsPrefix（SEA 自 re-exec）路径生效**：那条路传不了
   * `--max-old-space-size`，入口文件在 execArgv 里看不到旗标时自己 best-effort 设置。
   * 缺省路径由真正的 Node 旗标生效，入口文件看到旗标就跳过。效果不保证，记为 SEA 限制。
   */
  maxOldSpaceSizeMb?: number;
}
