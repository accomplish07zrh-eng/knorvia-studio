// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// 进程树 stdio 传输：在 SDK 传输之上补三件事——请求 _meta 注入、首退出信息、
// Windows job object 绑定；并重写 _dispose 以便先终止整棵进程树再走 SDK 回收。
// 边界约定：
// 一、_meta 注入只在消息带 method 且确有元数据时发生；已有 _meta 字段被浅合并保留。
// 二、首次退出信息只记录一次（exitCode/signal/时间戳），后续退出事件不再覆盖。
// 三、start 时进程已退出（exitCode/signalCode 非空）就立即记录，不再挂 exit 监听。
// 四、job object 只在 win32 且已有 pid 时绑定；绑定失败不抛出，按「无 job」继续。
// 五、_dispose 顺序固定：先结束 job，再终止进程树，最后交给 SDK 的 _dispose 或 close。
// 六、SDK 私有 _dispose 可能不存在（版本差异）：此时回退到 close()。

import type { ChildProcess } from "node:child_process";
import type { JSONRPCMessage } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/client/stdio";
import { terminateMcpStdioProcessTree } from "./process-tree.js";
import {
  attachProcessToWindowsJobObject,
  type WindowsJobObjectController,
} from "./windows-job-object.js";

type Meta = Record<string, unknown>;
type MetaProvider = () => Promise<Meta | undefined>;
type JobFactory = (pid: number) => Promise<WindowsJobObjectController | undefined>;
type StdioParams = StdioServerParameters & { requestMetaProvider?: MetaProvider };

import type {
  ProcessTreeStdioClientTransportOptions,
  StdioProcessExitInfo,
} from "./stdio-transport-types.js";

const sdkDisposeRef = Object.getOwnPropertyDescriptor(StdioClientTransport.prototype, "_dispose")
  ?.value as ((this: StdioClientTransport) => Promise<void>) | undefined;

function plainRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

/** 注入 _meta：无 method 或无元数据时原样返回，已有 _meta 浅合并保留。 */
function withInjectedMeta(frame: JSONRPCMessage, metaFields: Meta): JSONRPCMessage {
  if (!("method" in frame) || Object.keys(metaFields).length === 0) return frame;
  const rawParams = frame.params;
  const callParams = plainRecord(rawParams) ? rawParams : {};
  const priorMeta = callParams._meta;
  const existingMeta = plainRecord(priorMeta) ? priorMeta : {};
  return { ...frame, params: { ...callParams, _meta: { ...existingMeta, ...metaFields } } };
}

/** 记录首次退出：已有记录不覆盖；进程已退出则立即记录，否则挂一次性监听。 */
function observeFirstExit(
  proc: ChildProcess,
  startedAt: number,
  isRecorded: () => boolean,
  remember: (info: StdioProcessExitInfo) => void,
): void {
  const record = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
    // 已有记录时直接忽略：既不覆盖，也不再读时钟。
    if (isRecorded()) return;
    remember({ exitCode, exitedAt: Date.now(), signal, startedAt });
  };
  if (proc.exitCode !== null || proc.signalCode !== null) {
    record(proc.exitCode, proc.signalCode);
    return;
  }
  proc.once("exit", (exitCode, signal) => record(exitCode, signal));
}

/** 结束 job：terminate 与 close 各自兜错，引用已由调用方先清空。 */
function closeJob(job: WindowsJobObjectController | undefined): void {
  if (!job) return;
  try {
    job.terminate();
  } catch {
    // 终止失败仍进入 close；不等待声明外的 Promise 返回值。
  }
  try {
    job.close();
  } catch {
    // 引用已清空，失败不恢复它或新增重试。
  }
}

// 与 SDK 的关系（便于接手）:
// 一、super.send 负责真正的写管道；本类只在必要时改写 _meta 后再调用它。
// 二、super.start 完成后才能拿到底层进程；未完成前 processAlive 恒为 false。
// 三、_dispose 是原型级改写（非子类方法）：SDK 内部若直接调用它，也会走本类的回收顺序。
// 四、processExit 供上层记录退出码与耗时；processAlive 供清理路径判断是否需要终止进程树。
// 五、本类不抛错给上层：job 与进程树失败都只记录边界，由日志与遥测暴露。
// 观测字段说明（processExit 被 client-lifecycle 读取，字段名不可改）：
// exitCode / signal：进程退出码与终止信号，正常退出时 signal 为 null。
// startedAt / exitedAt：启动与退出时刻（毫秒），用于计算存活时长。
// processAlive：进程句柄存在且未退出；句柄缺失（未 start）时返回 false。
// 说明：首次退出信息只记录一次，后续 exit 事件不会改写它。
// 说明：本类不收集 stdout/stderr，输出由 SDK 传输按原样处理。
// 对外使用顺序（调用方视角）：
// 一、构造传入 StdioServerParameters 与可选的 job 工厂；工厂缺省用 Windows job object 绑定。
// 二、start() 之后 processAlive 才有意义；未 start 时它是 false。
// 三、send() 会按需注入 _meta，调用方无需自己拼 meta。
// 四、close() 或 SDK 内部 _dispose 都会走本类的回收顺序（job → 进程树 → SDK）。
// 五、terminateWindowsJobObject() 可单独调用，用于在关闭前先解除 job 绑定。
// 六、processExit 只在进程已退出时有值，字段语义见 stdio-transport-types.ts。
export class ProcessTreeStdioClientTransport extends StdioClientTransport {
  readonly #metaProvider: MetaProvider | undefined;
  readonly #jobFactory: JobFactory;
  #child: ChildProcess | undefined;
  #firstExit: StdioProcessExitInfo | undefined;
  #job: WindowsJobObjectController | undefined;

  constructor(params: StdioParams, settings: ProcessTreeStdioClientTransportOptions = {}) {
    super(params);
    this.#metaProvider = params.requestMetaProvider;
    this.#jobFactory = settings.windowsJobObjectFactory ?? attachProcessToWindowsJobObject;
  }

  /** 结束 job object：先清引用再释放，失败不恢复。 */
  async terminateWindowsJobObject(): Promise<void> {
    const job = this.#job;
    this.#job = undefined;
    closeJob(job);
  }

  override async send(frame: JSONRPCMessage): Promise<void> {
    const metaFields = await this.#metaProvider?.();
    await super.send(metaFields ? withInjectedMeta(frame, metaFields) : frame);
  }

  override async start(): Promise<void> {
    const launchStartedAt = Date.now();
    await super.start();
    const proc = (this as unknown as { _process?: ChildProcess | null })._process;
    if (!proc) return;
    this.#child = proc;
    observeFirstExit(
      proc,
      launchStartedAt,
      () => this.#firstExit !== undefined,
      (info) => {
        this.#firstExit = info;
      },
    );
    // 进程在 start 期间就已退出：不再挂 exit 监听，也不再绑定 job object。
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    if (process.platform !== "win32" || this.pid == null) return;
    try {
      this.#job = await this.#jobFactory(this.pid);
    } catch {
      this.#job = undefined;
    }
  }
  get processExit(): StdioProcessExitInfo | undefined {
    return this.#firstExit;
  }

  get processAlive(): boolean {
    return Boolean(this.#child && this.#child.exitCode === null && this.#child.signalCode === null);
  }
}

/** 进程树传输的回收：先结束 job 与进程树，再交给 SDK 的 _dispose（缺失时回退 close）。 */
async function recycleProcessTree(this: ProcessTreeStdioClientTransport): Promise<void> {
  const pid = this.pid;
  await this.terminateWindowsJobObject();
  if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
    try {
      await terminateMcpStdioProcessTree(pid);
    } catch {
      // 树终止失败不阻断 SDK 回收；更早的 pid/job 错误仍按原边界传播。
    }
  }
  if (sdkDisposeRef) {
    await sdkDisposeRef.call(this);
    return;
  }
  await this.close();
}

Object.defineProperty(ProcessTreeStdioClientTransport.prototype, "_dispose", {
  configurable: true,
  enumerable: false,
  value: recycleProcessTree,
  writable: false,
});
// 运行期注意（接手排障）：
// 一、win32 之外的平台不绑定 job object，进程树终止依赖 terminateMcpStdioProcessTree。
// 二、job 绑定失败会被吞掉（this.#job = undefined），因此 processAlive 仍可正常判断。
// 三、send 在元数据为空时完全走 SDK 原路径，不额外构造对象，避免无谓分配。
// 四、_meta 合并是浅合并：同名字段以新元数据为准，其余字段原样保留。
// 五、退出信息记录后即固定，即便后续再次收到 exit 事件也不会改写。
// 六、dispose 路径不等待进程真正消失：终止发起后即交给 SDK 回收。
// 七、本类不持有 stderr 缓冲，日志与错误文本由 SDK 传输按既有方式暴露。
// 八、若 SDK 版本移除了私有 _dispose，本类自动回退到 close()，行为保持可用。
