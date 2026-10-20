// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
//
// Windows 作业对象（Job Object）绑定与流程。
//
// 用途：把进程挂进一个「句柄一关就杀」的作业，主进程退出时子进程树由系统清理。
//
// 三条不可动的 ABI 约束：
// 一、结构体字段顺序即内存布局顺序，重排会让原生调用读到错的偏移；
// 二、每个原生函数都用 __stdcall 与「名字 + 返回类型 + 参数表」声明；
// 三、kill-on-close 通过 LimitFlags 表达，因此 close 时不需要再显式 terminate。
//
// 三条生命周期约束：
// 四、create 成功但设置限值失败 → 必须释放句柄；
// 五、assign 无论成败 → 必须释放进程句柄；
// 六、attach 返回的控制器里 close 幂等，且 close 之后不再 terminate。
//
// 注意：本文件**不能拆成多个模块**。覆盖它的夹具（mcp-process-boundary.fixture.ts）
// 有一套依赖白名单：它把源码取出、在受控 require 下重新执行，任何未登记的本地模块
// 都会被 `unapproved dependency` 断言拒绝。所有逻辑必须留在这一个文件里。

type WindowsJobHandle = object; // koffi 的不透明指针

/**
 * 本文件用到的 koffi 面。刻意不写 `typeof import("koffi")`：
 * 本仓库里 koffi 有两个大版本共存（DSH 系要 3.x、adapters 声明 2.15.6），
 * pnpm 重装时的 hoist 结果会变，整模块断言会跟着漂移并在 3.x 上报 TS2352。
 * 只声明真正调用到的成员，类型检查就与顶层解析到哪个版本无关。
 */
interface KoffiApi {
  load(path: string): KoffiLibrary;
  pointer(name: string, type: unknown): unknown;
  pointer(type: unknown): unknown;
  opaque(name?: string): unknown;
  struct(name: string, fields: Record<string, unknown>): unknown;
  sizeof(type: unknown): number;
}

/** 已加载动态库上的函数声明入口。 */
interface KoffiLibrary {
  func(convention: string, name: string, result: unknown, args: unknown[]): KoffiBoundFunction;
}

/** 绑定后的原生函数：参数与返回值都由声明决定。 */
type KoffiBoundFunction = (...args: unknown[]) => unknown;

/** 对外控制器：只暴露两个动作（属性函数类型，调用方式与之前一致）。 */
export interface WindowsJobObjectController {
  terminate: () => void;
  close: () => void;
}

/** 原生动作表：本文件真正会调用的四件事。 */
type NativeActions = {
  create: () => WindowsJobHandle | undefined;
  assign: (job: WindowsJobHandle, pid: number) => boolean;
  terminate: (job: WindowsJobHandle) => void;
  close: (job: WindowsJobHandle) => void;
};

/** 挂载入参：可注入替身 API，也可覆盖平台判定。 */
type AttachOptions = {
  api?: NativeActions;
  platform?: NodeJS.Platform;
};

/** Win32 常量（数值是 ABI 契约，不要改）。 */
const KILL_ON_JOB_CLOSE = 0x2000;
const EXTENDED_LIMIT_INFORMATION_CLASS = 9;
const ACCESS_SET_QUOTA = 0x0100;
const ACCESS_TERMINATE = 0x0001;
const TERMINATION_EXIT_CODE = 1;

/**
 * 三个结构体的布局。键是结构体名，值是「字段名 → 字段类型」的有序表；
 * 顺序即内存布局 —— 只增不改顺序。`null` 表示该字段本身是嵌套结构（由外层填入）。
 */
const STRUCT_LAYOUTS: Record<string, readonly (readonly [string, string | null])[]> = {
  JOBOBJECT_BASIC_LIMIT_INFORMATION: [
    ["PerProcessUserTimeLimit", "int64"],
    ["PerJobUserTimeLimit", "int64"],
    ["LimitFlags", "uint32"],
    ["MinimumWorkingSetSize", "size_t"],
    ["MaximumWorkingSetSize", "size_t"],
    ["ActiveProcessLimit", "uint32"],
    ["Affinity", "uintptr_t"],
    ["PriorityClass", "uint32"],
    ["SchedulingClass", "uint32"],
  ],
  IO_COUNTERS: [
    ["ReadOperationCount", "uint64"],
    ["WriteOperationCount", "uint64"],
    ["OtherOperationCount", "uint64"],
    ["ReadTransferCount", "uint64"],
    ["WriteTransferCount", "uint64"],
    ["OtherTransferCount", "uint64"],
  ],
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION: [
    ["BasicLimitInformation", null],
    ["IoInfo", null],
    ["ProcessMemoryLimit", "size_t"],
    ["JobMemoryLimit", "size_t"],
    ["PeakProcessMemoryUsed", "size_t"],
    ["PeakJobMemoryUsed", "size_t"],
  ],
};

/** 需要清零的字段：按结构体分开列，顺序与布局一致。 */
const ZERO_FIELD_GROUPS = {
  basic: [
    "PerProcessUserTimeLimit",
    "PerJobUserTimeLimit",
    "MinimumWorkingSetSize",
    "MaximumWorkingSetSize",
    "ActiveProcessLimit",
    "Affinity",
    "PriorityClass",
    "SchedulingClass",
  ],
  io: [
    "ReadOperationCount",
    "WriteOperationCount",
    "OtherOperationCount",
    "ReadTransferCount",
    "WriteTransferCount",
    "OtherTransferCount",
  ],
  memory: ["ProcessMemoryLimit", "JobMemoryLimit", "PeakProcessMemoryUsed", "PeakJobMemoryUsed"],
} as const;

/** 原生 API 的懒加载缓存：一次进程只绑一次。 */
let nativeApiPromise: Promise<NativeActions | undefined> | undefined;

/** 把一组字段名折成全零对象。 */
function zeroes(names: readonly string[]): Record<string, number> {
  const zeros: Record<string, number> = {};
  for (const name of names) zeros[name] = 0;
  return zeros;
}

/** 组装 JOBOBJECT_EXTENDED_LIMIT_INFORMATION 的取值（两段嵌套 + 四个内存限制）。 */
function extendedLimitValues(): Record<string, unknown> {
  const basic = zeroes(ZERO_FIELD_GROUPS.basic);
  basic.LimitFlags = KILL_ON_JOB_CLOSE;
  const values: Record<string, unknown> = {};
  values.BasicLimitInformation = basic;
  values.IoInfo = zeroes(ZERO_FIELD_GROUPS.io);
  for (const [key, value] of Object.entries(zeroes(ZERO_FIELD_GROUPS.memory))) values[key] = value;
  return values;
}

/** 按布局表建一个结构体类型；嵌套字段的类型由调用方在 built 里预先放好。 */
function buildStruct(koffi: KoffiApi, name: string, built: Record<string, unknown>): unknown {
  const fields: Record<string, unknown> = {};
  for (const [field, type] of STRUCT_LAYOUTS[name] ?? []) {
    fields[field] = type === null ? built[field] : type;
  }
  // fromEntries 的返回类型对 koffi 重载不友好；字段值本身已由 koffi 校验。
  return koffi.struct(name, fields as Record<string, never>);
}

/** 用已绑定的原生函数组装动作表。 */
function makeActions(
  koffi: KoffiApi,
  kernel: KoffiLibrary,
  handleType: unknown,
  extendedType: unknown,
  sizeOfExtended: number,
): NativeActions {
  const declOf = (name: string, returns: unknown, params: readonly unknown[]) =>
    kernel.func("__stdcall", name, returns as never, params as never);

  const createJob = declOf("CreateJobObjectW", handleType, ["void *", "str16"]);
  // SetInformationJobObject 的四段参数：作业句柄、信息类、指向限值结构体的指针、结构体字节宽度。
  const setInfoArgs = [handleType, "uint32", koffi.pointer(extendedType), "uint32"];
  const setInformation = declOf("SetInformationJobObject", "bool", setInfoArgs);
  const openProcess = declOf("OpenProcess", handleType, ["uint32", "bool", "uint32"]);
  const assignProcess = declOf("AssignProcessToJobObject", "bool", [handleType, handleType]);
  const terminateJob = declOf("TerminateJobObject", "bool", [handleType, "uint32"]);
  const closeHandle = declOf("CloseHandle", "bool", [handleType]);

  /** 建作业并写入限值；任一步失败都释放句柄。 */
  function createWithLimits(): WindowsJobHandle | undefined {
    const job = createJob(null, null);
    if (!job) return undefined;
    const applied = setInformation(
      job,
      EXTENDED_LIMIT_INFORMATION_CLASS,
      extendedLimitValues(),
      sizeOfExtended,
    );
    if (applied) return job;
    closeHandle(job);
    return undefined;
  }

  /** 挂进程进作业；进程句柄必须释放。 */
  function attachProcess(job: WindowsJobHandle, pid: number): boolean {
    const processHandle = openProcess(ACCESS_SET_QUOTA | ACCESS_TERMINATE, false, pid);
    if (!processHandle) return false;
    try {
      return Boolean(assignProcess(job, processHandle));
    } finally {
      closeHandle(processHandle);
    }
  }

  const actions = {} as NativeActions;
  actions.create = createWithLimits;
  actions.assign = attachProcess;
  actions.terminate = (job) => void terminateJob(job, TERMINATION_EXIT_CODE);
  actions.close = (job) => void closeHandle(job);
  return actions;
}

/**
 * 加载并绑定原生 API。加载阶段任何失败（koffi 不可用、kernel32 打不开、符号缺失）
 * 都折成 undefined —— 由调用方判定「本平台没有可用实现」。
 */
async function loadNativeApi(): Promise<NativeActions | undefined> {
  try {
    const imported = await import("koffi");
    const koffi = ("default" in imported ? imported.default : imported) as unknown as KoffiApi;
    const kernel = koffi.load("kernel32.dll");
    const handleType = koffi.pointer("HANDLE", koffi.opaque());
    const basicType = buildStruct(koffi, "JOBOBJECT_BASIC_LIMIT_INFORMATION", {});
    const ioType = buildStruct(koffi, "IO_COUNTERS", {});
    const extendedType = buildStruct(koffi, "JOBOBJECT_EXTENDED_LIMIT_INFORMATION", {
      BasicLimitInformation: basicType,
      IoInfo: ioType,
    });
    return makeActions(koffi, kernel, handleType, extendedType, koffi.sizeof(extendedType));
  } catch {
    return undefined;
  }
}

/**
 * 作业已建好、进程已挂入之后才返回控制器。
 * 用一个共享的 closed 标记保证：close 幂等，且 close 之后 terminate 不再落到原生。
 */
function controllerFor(api: NativeActions, job: WindowsJobHandle): WindowsJobObjectController {
  const state = { closed: false };
  const controller = {} as WindowsJobObjectController;
  controller.terminate = () => {
    if (state.closed) return;
    api.terminate(job);
  };
  controller.close = () => {
    if (state.closed) return;
    state.closed = true;
    api.close(job);
  };
  return controller;
}

/** 补偿：释放可能已交回本函数的句柄；补偿自身的失败不再抛出。 */
function releaseQuietly(api: NativeActions, job: WindowsJobHandle | undefined): void {
  if (!job) return;
  try {
    api.close(job);
  } catch {
    // 原始失败更重要，补偿失败只吞掉。
  }
}

export async function attachProcessToWindowsJobObject(
  pid: number,
  options: AttachOptions = {},
): Promise<WindowsJobObjectController | undefined> {
  if ((options.platform ?? process.platform) !== "win32") return undefined;
  if (!Number.isInteger(pid) || pid <= 0) return undefined;

  const api = options.api ?? (await (nativeApiPromise ??= loadNativeApi()));
  if (!api) return undefined;

  let job: WindowsJobHandle | undefined;
  try {
    job = api.create();
    if (!job) return undefined;
    if (api.assign(job, pid)) return controllerFor(api, job);
    api.close(job);
    return undefined;
  } catch {
    // 只补偿已经交回本函数的句柄；create 内部尚未交出的资源不在这里接管。
    releaseQuietly(api, job);
    return undefined;
  }
}
