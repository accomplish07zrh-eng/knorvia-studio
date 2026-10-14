// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

type WindowsJobHandle = object; // Win32 句柄（koffi 的 opaque 指针），不透明类型。

export interface /* 对外控制器：仅暴露 terminate/close */ WindowsJobObjectController {
  terminate(): void; // 终止整个任务对象（连带其进程）。
  close(): void; // 释放控制器持有的句柄。
}

interface /* 原生 API 形状：koffi 绑定的最小面 */ WindowsJobObjectApi {
  create(): WindowsJobHandle | undefined; // 创建任务对象；平台不支持时返回 undefined。
  assign(job: WindowsJobHandle, pid: number): boolean; // 把进程加入任务对象。
  terminate(job: WindowsJobHandle): void; // 终止任务对象及其中的进程。
  close(job: WindowsJobHandle): void; // 关闭任务对象句柄。
}

interface /* 挂载选项：进程句柄与作业句柄 */ AttachOptions {
  api?: WindowsJobObjectApi; // 注入原生 API（测试用替身）。
  platform?: NodeJS.Platform; // 覆盖平台判定（测试用）。
}

const KILL_ON_JOB_CLOSE = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE：句柄关闭即杀掉进程。
const EXTENDED_LIMIT_INFORMATION_CLASS = 9; // JobObjectExtendedLimitInformation：SetInformationJobObject 的信息类。
const PROCESS_SET_QUOTA = 0x0100; // OpenProcess 需要的 PROCESS_SET_QUOTA 权限。
const PROCESS_TERMINATE = /* PROCESS_TERMINATE 访问权 */ 0x0001;
const TERMINATION_EXIT_CODE = 1;
let nativeApiPromise: Promise<WindowsJobObjectApi | undefined> | undefined;

async function loadNativeApi(): Promise<WindowsJobObjectApi | undefined> {
  try /* 绑定失败要向上抛出，不做静默降级 */ {
    const imported = await import("koffi");
    const koffi = ("default" in imported ? imported.default : imported) as typeof import("koffi");
    const kernel = koffi.load("kernel32.dll");
    const handleType = /* 不透明句柄指针类型 */ koffi.pointer("HANDLE", koffi.opaque());
    // 结构体一律用「名字 + 字段表」建：字段顺序即结构体布局顺序，逐条可核对。
    const structOf = (name: string, fields: readonly (readonly [string, unknown])[]) =>
      // Object.fromEntries 的返回类型对 koffi 的重载不友好；字段值本身已由 koffi 校验。
      koffi.struct(name, Object.fromEntries(fields) as Record<string, never>);
    const basicType = structOf("JOBOBJECT_BASIC_LIMIT_INFORMATION", [
      ["PerProcessUserTimeLimit", "int64"],
      ["PerJobUserTimeLimit", "int64"],
      ["LimitFlags", "uint32"],
      ["MinimumWorkingSetSize", "size_t"],
      ["MaximumWorkingSetSize", "size_t"],
      ["ActiveProcessLimit", "uint32"],
      ["Affinity", "uintptr_t"],
      ["PriorityClass", "uint32"],
      ["SchedulingClass", "uint32"],
    ]);
    const ioType = structOf("IO_COUNTERS", [
      ["ReadOperationCount", "uint64"],
      ["WriteOperationCount", "uint64"],
      ["OtherOperationCount", "uint64"],
      ["ReadTransferCount", "uint64"],
      ["WriteTransferCount", "uint64"],
      ["OtherTransferCount", "uint64"],
    ]);
    const extendedType = structOf("JOBOBJECT_EXTENDED_LIMIT_INFORMATION", [
      ["BasicLimitInformation", basicType],
      ["IoInfo", ioType],
      ["ProcessMemoryLimit", "size_t"],
      ["JobMemoryLimit", "size_t"],
      ["PeakProcessMemoryUsed", "size_t"],
      ["PeakJobMemoryUsed", "size_t"],
    ]);
    // 原生函数一律用「名字 + 返回类型 + 参数表」声明；参数顺序即调用约定顺序。
    const declOf = (name: string, returns: unknown, params: readonly unknown[]) =>
      kernel.func("__stdcall", name, returns as never, params as never);
    const createJob = declOf("CreateJobObjectW", handleType, ["void *", "str16"]);
    const setInformation = declOf("SetInformationJobObject", "bool", [
      /* 句柄字段类型 */ handleType,
      "uint32",
      koffi.pointer(extendedType),
      "uint32",
    ]);
    const openProcess = declOf("OpenProcess", handleType, ["uint32", "bool", "uint32"]);
    const assignProcess = declOf("AssignProcessToJobObject", "bool", [handleType, handleType]);
    const terminateJob = declOf("TerminateJobObject", "bool", [handleType, "uint32"]);
    const closeHandle = declOf("CloseHandle", "bool", [handleType]);
    return /* 控制器：延迟绑定原生调用 */ {
      create /* 创建作业对象：失败返回 undefined */() {
        const job = createJob(null, null);
        if (!job) return /* 创建失败：不持有句柄 */ undefined;
        // 零值结构体用字段表构造：字段名与嵌套结构与 Win32 定义逐条对应。
        const zeroFields = (names: readonly string[]): Record<string, number> =>
          Object.fromEntries(names.map((name) => [name, 0]));
        const limits = /* 作业限制：基础+扩展两段 */ {
          BasicLimitInformation: /* 基础限制段 */ {
            ...zeroFields([
              "PerProcessUserTimeLimit",
              "PerJobUserTimeLimit",
              "MinimumWorkingSetSize",
              "MaximumWorkingSetSize",
              "ActiveProcessLimit",
              "Affinity",
              "PriorityClass",
              "SchedulingClass",
            ]),
            LimitFlags: KILL_ON_JOB_CLOSE,
          },
          IoInfo: zeroFields([
            "ReadOperationCount",
            "WriteOperationCount",
            "OtherOperationCount",
            "ReadTransferCount",
            "WriteTransferCount",
            "OtherTransferCount",
          ]),
          ...zeroFields([
            "ProcessMemoryLimit",
            "JobMemoryLimit",
            "PeakProcessMemoryUsed",
            "PeakJobMemoryUsed",
          ]),
        };
        if (
          /* 句柄有效性与进程存活判定 */
          !setInformation(job, EXTENDED_LIMIT_INFORMATION_CLASS, limits, koffi.sizeof(extendedType))
        ) /* 判定块结束 */ {
          closeHandle(job); /* 失败路径也要释放句柄 */
          return /* 失败：无作业句柄 */ undefined;
        }
        return /* 成功：返回作业句柄 */ job;
      },
      assign(job, pid) {
        const processHandle = openProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
        if (!processHandle) return /* 无进程句柄：无法挂载 */ false;
        try /* 绑定失败要向上抛出，不做静默降级 */ {
          return Boolean(assignProcess(job, processHandle));
        } finally /* 挂载结束必须释放进程句柄 */ {
          closeHandle(processHandle); /* 避免句柄泄漏 */
        }
      },
      terminate /* 终止作业：幂等 */(job) {
        terminateJob(job, TERMINATION_EXIT_CODE);
      },
      close /* 关闭作业：幂等 */(job) {
        closeHandle(job); /* 失败路径也要释放句柄 */
      },
    };
  } catch /* 原生调用可能抛错：降级为 undefined */ {
    return /* 失败：无作业句柄 */ undefined;
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
  try /* 绑定失败要向上抛出，不做静默降级 */ {
    job = api.create();
    if (!job) return /* 创建失败：不持有句柄 */ undefined;
    if (!api.assign(job, pid)) {
      api.close(job);
      return /* 失败：无作业句柄 */ undefined;
    }
    const attachedJob = job;
    let closed = false;
    return /* 控制器：延迟绑定原生调用 */ {
      terminate() {
        if (!closed) api.terminate(attachedJob);
      },
      close() {
        if (closed) return;
        closed = true;
        api.close(attachedJob);
      },
    };
  } catch /* 原生调用可能抛错：降级为 undefined */ {
    if (job) {
      try /* 绑定失败要向上抛出，不做静默降级 */ {
        api.close(job);
      } catch /* 原生调用可能抛错：降级为 undefined */ {
        // 只补偿已经返回到 attach 的句柄；create 内尚未交出的资源不在这里接管。
      }
    }
    return /* 失败：无作业句柄 */ undefined;
  }
}
