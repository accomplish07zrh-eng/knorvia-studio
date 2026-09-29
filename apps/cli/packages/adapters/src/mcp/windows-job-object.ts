// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

type WindowsJobHandle = object;

export interface WindowsJobObjectController {
  terminate(): void;
  close(): void;
}

interface WindowsJobObjectApi {
  create(): WindowsJobHandle | undefined;
  assign(job: WindowsJobHandle, pid: number): boolean;
  terminate(job: WindowsJobHandle): void;
  close(job: WindowsJobHandle): void;
}

interface AttachOptions {
  api?: WindowsJobObjectApi;
  platform?: NodeJS.Platform;
}

const KILL_ON_JOB_CLOSE = 0x2000;
const EXTENDED_LIMIT_INFORMATION_CLASS = 9;
const PROCESS_SET_QUOTA = 0x0100;
const PROCESS_TERMINATE = 0x0001;
const TERMINATION_EXIT_CODE = 1;
let nativeApiPromise: Promise<WindowsJobObjectApi | undefined> | undefined;

async function loadNativeApi(): Promise<WindowsJobObjectApi | undefined> {
  try {
    const imported = await import("koffi");
    const koffi = ("default" in imported ? imported.default : imported) as typeof import("koffi");
    const kernel = koffi.load("kernel32.dll");
    const handleType = koffi.pointer("HANDLE", koffi.opaque());
    const basicType = koffi.struct("JOBOBJECT_BASIC_LIMIT_INFORMATION", {
      PerProcessUserTimeLimit: "int64",
      PerJobUserTimeLimit: "int64",
      LimitFlags: "uint32",
      MinimumWorkingSetSize: "size_t",
      MaximumWorkingSetSize: "size_t",
      ActiveProcessLimit: "uint32",
      Affinity: "uintptr_t",
      PriorityClass: "uint32",
      SchedulingClass: "uint32",
    });
    const ioType = koffi.struct("IO_COUNTERS", {
      ReadOperationCount: "uint64",
      WriteOperationCount: "uint64",
      OtherOperationCount: "uint64",
      ReadTransferCount: "uint64",
      WriteTransferCount: "uint64",
      OtherTransferCount: "uint64",
    });
    const extendedType = koffi.struct("JOBOBJECT_EXTENDED_LIMIT_INFORMATION", {
      BasicLimitInformation: basicType,
      IoInfo: ioType,
      ProcessMemoryLimit: "size_t",
      JobMemoryLimit: "size_t",
      PeakProcessMemoryUsed: "size_t",
      PeakJobMemoryUsed: "size_t",
    });
    const createJob = kernel.func("__stdcall", "CreateJobObjectW", handleType, ["void *", "str16"]);
    const setInformation = kernel.func("__stdcall", "SetInformationJobObject", "bool", [
      handleType,
      "uint32",
      koffi.pointer(extendedType),
      "uint32",
    ]);
    const openProcess = kernel.func("__stdcall", "OpenProcess", handleType, [
      "uint32",
      "bool",
      "uint32",
    ]);
    const assignProcess = kernel.func("__stdcall", "AssignProcessToJobObject", "bool", [
      handleType,
      handleType,
    ]);
    const terminateJob = kernel.func("__stdcall", "TerminateJobObject", "bool", [
      handleType,
      "uint32",
    ]);
    const closeHandle = kernel.func("__stdcall", "CloseHandle", "bool", [handleType]);
    return {
      create() {
        const job = createJob(null, null);
        if (!job) return undefined;
        const limits = {
          BasicLimitInformation: {
            PerProcessUserTimeLimit: 0,
            PerJobUserTimeLimit: 0,
            LimitFlags: KILL_ON_JOB_CLOSE,
            MinimumWorkingSetSize: 0,
            MaximumWorkingSetSize: 0,
            ActiveProcessLimit: 0,
            Affinity: 0,
            PriorityClass: 0,
            SchedulingClass: 0,
          },
          IoInfo: {
            ReadOperationCount: 0,
            WriteOperationCount: 0,
            OtherOperationCount: 0,
            ReadTransferCount: 0,
            WriteTransferCount: 0,
            OtherTransferCount: 0,
          },
          ProcessMemoryLimit: 0,
          JobMemoryLimit: 0,
          PeakProcessMemoryUsed: 0,
          PeakJobMemoryUsed: 0,
        };
        if (
          !setInformation(job, EXTENDED_LIMIT_INFORMATION_CLASS, limits, koffi.sizeof(extendedType))
        ) {
          closeHandle(job);
          return undefined;
        }
        return job;
      },
      assign(job, pid) {
        const processHandle = openProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
        if (!processHandle) return false;
        try {
          return Boolean(assignProcess(job, processHandle));
        } finally {
          closeHandle(processHandle);
        }
      },
      terminate(job) {
        terminateJob(job, TERMINATION_EXIT_CODE);
      },
      close(job) {
        closeHandle(job);
      },
    };
  } catch {
    return undefined;
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
    if (!api.assign(job, pid)) {
      api.close(job);
      return undefined;
    }
    const attachedJob = job;
    let closed = false;
    return {
      terminate() {
        if (!closed) api.terminate(attachedJob);
      },
      close() {
        if (closed) return;
        closed = true;
        api.close(attachedJob);
      },
    };
  } catch {
    if (job) {
      try {
        api.close(job);
      } catch {
        // 只补偿已经返回到 attach 的句柄；create 内尚未交出的资源不在这里接管。
      }
    }
    return undefined;
  }
}
