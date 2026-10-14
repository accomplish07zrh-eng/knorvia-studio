// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试夹具：只提供注入端口（文件系统、产物库、会话存储、日志器、
// 运行时事件面）。夹具里没有真实用户数据、凭据与内部地址；所有记录都是内存数组，便于测试按
// 「事件序列 + 持久化记录」断言。
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 端口错误必须是被测代码同源的 FileSystemPortError 实例：isFileSystemPortError 只沿原型链比对，
// 夹具若用另一个副本 instanceof 必然失败。这里按 contracts 包自己的 exports 入口解析，与 core
// 运行时加载的是同一个模块实例。
const repoRootForFixtures = fileURLToPath(new URL("../../../../", import.meta.url));
const contractsManifest = resolve(repoRootForFixtures, "apps/cli/packages/contracts/package.json");
const contractsPkg = JSON.parse(readFileSync(contractsManifest, "utf8")) as {
  exports: Record<string, { import: string }>;
};
const contractsEntry = resolve(dirname(contractsManifest), contractsPkg.exports["."].import);
const { createFileSystemError } = (await import(pathToFileURL(contractsEntry).href)) as {
  createFileSystemError: (details: {
    code: string;
    message: string;
    path?: string;
    cause?: unknown;
  }) => Error & { code: string };
};

type LogRecord = {
  context?: unknown;
  level: "debug" | "error" | "info" | "warn";
  message: string;
};

type Logger = {
  records: LogRecord[];
} & Record<string, (...args: unknown[]) => void>;

/** 收集全部日志调用，按调用顺序返回。 */
export function createLogger(): Logger {
  const records: LogRecord[] = [];
  const logger = { records } as Logger;
  for (const level of ["debug", "info", "warn", "error"] as const) {
    logger[level] = (message: string, ...rest: unknown[]) => {
      records.push({ context: rest, level, message: String(message) });
    };
  }
  return logger;
}

type FileSystemFault = {
  op: "readBinaryFile" | "readTextFile" | "stat" | "writeTextFile";
  path?: string;
  reason?: unknown;
};

type FakeFileSystem = {
  files: Map<string, string>;
  writes: { content: string; path: string }[];
  port: Record<string, (...args: never[]) => unknown>;
  faults: FileSystemFault[];
  binaryFiles: Map<string, Uint8Array>;
  directories: Set<string>;
  /** 每次端口调用记 `op:path`，用于断言串行解析的事件序列。 */
  ops: string[];
  failNext(op: FileSystemFault["op"], path?: string, reason?: unknown): void;
};

function faultFor(
  faults: FileSystemFault[],
  op: FileSystemFault["op"],
  path: string,
): FileSystemFault | undefined {
  const index = faults.findIndex(
    (fault) => fault.op === op && (fault.path === undefined || fault.path === path),
  );
  if (index < 0) return undefined;
  const [fault] = faults.splice(index, 1);
  return fault;
}

function portError(code: string, message: string, path?: string): Error & { code: string } {
  return createFileSystemError({ code, message, path }) as Error & { code: string };
}

/**
 * 内存文件系统端口。`files` 的键是**绝对路径**（按当前平台分隔符拼），文本文件存字符串、
 * 二进制文件存 `binaryFiles`。注入的故障按操作 + 路径只消费一次。
 */
export function createFileSystem(seed: Record<string, string> = {}): FakeFileSystem {
  const files = new Map(Object.entries(seed));
  const binaryFiles = new Map<string, Uint8Array>();
  const writes: { content: string; path: string }[] = [];
  const faults: FileSystemFault[] = [];
  const directories = new Set<string>();
  const ops: string[] = [];

  const sizeOf = (path: string): number => {
    const text = files.get(path);
    if (text !== undefined) return Buffer.byteLength(text, "utf8");
    const binary = binaryFiles.get(path);
    if (binary) return binary.byteLength;
    throw portError("not_found", `not found: ${path}`);
  };

  const fs = {
    binaryFiles,
    directories,
    failNext(op: FileSystemFault["op"], path?: string, reason?: unknown) {
      faults.push({ op, path, reason });
    },
    files,
    ops,
    port: {
      async readBinaryFile(input: { path: string; maxBytes?: number }, _options?: unknown) {
        ops.push(`readBinaryFile:${input.path}`);
        const fault = faultFor(faults, "readBinaryFile", input.path);
        if (fault) throw fault.reason ?? portError("io_error", "read failed");
        const bytes = binaryFiles.get(input.path);
        if (!bytes) throw portError("not_found", `not found: ${input.path}`);
        if (input.maxBytes !== undefined && bytes.byteLength > input.maxBytes) {
          throw portError("too_large", `too large: ${input.path}`);
        }
        return { bytesRead: bytes.byteLength, content: bytes, sizeBytes: bytes.byteLength };
      },
      async readTextFile(
        input: { encoding?: string; maxBytes?: number; path: string },
        _options?: unknown,
      ) {
        ops.push(`readTextFile:${input.path}`);
        const fault = faultFor(faults, "readTextFile", input.path);
        if (fault) throw fault.reason ?? portError("io_error", "read failed");
        if (input.encoding === "base64") {
          const bytes = binaryFiles.get(input.path);
          const text = files.get(input.path);
          if (!bytes && text === undefined) {
            throw portError("not_found", `not found: ${input.path}`);
          }
          const buffer = bytes ?? Buffer.from(text ?? "", "utf8");
          return {
            content: buffer.toString("base64"),
            sizeBytes: buffer.byteLength,
            truncated: false,
          };
        }
        const content = files.get(input.path);
        if (content === undefined) {
          const bytes = binaryFiles.get(input.path);
          if (!bytes) throw portError("not_found", `not found: ${input.path}`);
          return {
            content: Buffer.from(bytes).toString("utf8"),
            sizeBytes: bytes.byteLength,
            truncated: false,
          };
        }
        const bytes = Buffer.byteLength(content, "utf8");
        const limit = input.maxBytes;
        if (limit !== undefined && bytes > limit) {
          return { content: content.slice(0, limit), sizeBytes: bytes, truncated: true };
        }
        return { content, sizeBytes: bytes, truncated: false };
      },
      async readTextFileRange(
        input: { limitLines?: number; maxBytes?: number; offsetLine?: number; path: string },
        _options?: unknown,
      ) {
        ops.push(`readTextFileRange:${input.path}`);
        const fault = faultFor(faults, "readTextFileRange", input.path);
        if (fault) throw fault.reason ?? portError("io_error", "read failed");
        const full = files.get(input.path);
        if (full === undefined) throw portError("not_found", `not found: ${input.path}`);
        const offset = input.offsetLine ?? 0;
        const allLines = full.split(/\r?\n/u);
        const window = allLines.slice(offset);
        const limited = input.limitLines === undefined ? window : window.slice(0, input.limitLines);
        let content = limited.join("\n");
        let truncated = input.limitLines !== undefined || offset > 0;
        if (input.maxBytes !== undefined && Buffer.byteLength(content, "utf8") > input.maxBytes) {
          content = content.slice(0, input.maxBytes);
          truncated = true;
        }
        return {
          bytesRead: Buffer.byteLength(content, "utf8"),
          content,
          lineCount: limited.length,
          sizeBytes: Buffer.byteLength(full, "utf8"),
          startLine: offset + 1,
          totalLines: allLines.length,
          truncated,
        };
      },
      async stat(input: { path: string }, _options?: unknown) {
        ops.push(`stat:${input.path}`);
        const fault = faultFor(faults, "stat", input.path);
        if (fault) throw fault.reason ?? portError("io_error", "stat failed");
        if (directories.has(input.path)) {
          return { kind: "directory" as const, sizeBytes: 0 };
        }
        if (files.has(input.path) || binaryFiles.has(input.path)) {
          return { kind: "file" as const, sizeBytes: sizeOf(input.path) };
        }
        throw portError("not_found", `not found: ${input.path}`);
      },
      async writeTextFile(input: { content: string; path: string }, _options?: unknown) {
        ops.push(`writeTextFile:${input.path}`);
        const fault = faultFor(faults, "writeTextFile", input.path);
        if (fault) throw fault.reason ?? portError("io_error", "write failed");
        files.set(input.path, input.content);
        writes.push({ content: input.content, path: input.path });
        return undefined;
      },
    },
    writes,
  };
  return fs as unknown as FakeFileSystem;
}

type FakeArtifactStore = {
  ensurePath?: { path: string; status?: string };
  port: Record<string, (...args: never[]) => unknown>;
  reads: { uri: string }[];
  writes: { content: string; toolCallId: string; toolName: string }[];
};

/** 内存附件产物库：`artifact://` 由测试指定，写入顺序记进 `writes`。 */
export function createArtifactStore(): FakeArtifactStore {
  const blobs = new Map<string, string>();
  const writes: { content: string; toolCallId: string; toolName: string }[] = [];
  const reads: { uri: string }[] = [];
  const store = {
    ensurePath: undefined as { path: string; status?: string } | undefined,
    port: {
      async ensureMediaAttachmentPath(input: { uri: string }) {
        if (store.ensurePath === undefined) return { status: "unsupported" as const };
        if (store.ensurePath.status === "unsupported") return { status: "unsupported" as const };
        return { path: store.ensurePath.path, status: "ok" as const };
      },
      async readToolResultArtifact(input: { uri: string }) {
        reads.push({ uri: input.uri });
        const content = blobs.get(input.uri);
        if (content === undefined) throw portError("not_found", `artifact not found: ${input.uri}`);
        return { content };
      },
      async writeToolResultArtifact(
        input: { content: string; toolCallId: string },
        _options?: unknown,
      ) {
        const uri = `knorvia-artifact://session-contract/${writes.length + 1}`;
        blobs.set(uri, input.content);
        writes.push({
          content: input.content,
          toolCallId: input.toolCallId,
          toolName: (input as { toolName?: string }).toolName ?? "",
        });
        return { uri };
      },
    },
    reads,
    writes,
  };
  return store as unknown as FakeArtifactStore;
}

type FakeSessionStore = {
  calls: { method: string; payload?: unknown }[];
  entries: { data: unknown; id: string }[];
  messages: unknown[];
  port: Record<string, (...args: never[]) => unknown>;
  repairMode: "match" | "missing" | "unsupported";
  repairResult: boolean;
  session?: unknown;
};

/**
 * 内存会话存储：授权条目、消息列表、会话记录与「窄化路径修复」CAS 行为都由测试设置，
 * 所有调用记入 `calls` 供事件序列断言。
 */
export function createSessionStore(): FakeSessionStore {
  const calls: { method: string; payload?: unknown }[] = [];
  const store = {
    calls,
    entries: [] as { data: unknown; id: string }[],
    messages: [] as unknown[],
    repairMode: "match" as "match" | "missing" | "unsupported",
    repairResult: true,
    session: undefined as unknown,
    port: {
      async getSession(id: string) {
        calls.push({ method: "getSession", payload: id });
        return store.session;
      },
      async messages(input: unknown) {
        calls.push({ method: "messages", payload: input });
        return store.messages;
      },
      async repairRemoteSessionPaths(input: unknown) {
        calls.push({ method: "repairRemoteSessionPaths", payload: input });
        if (store.repairMode === "unsupported") return false;
        return store.repairResult;
      },
      async sessionEntries(input: unknown) {
        calls.push({ method: "sessionEntries", payload: input });
        return store.entries;
      },
    },
  };
  return store as unknown as FakeSessionStore;
}

type RuntimeEventEntry = { at: number; label: string; phase: string };

type FakeRuntime = {
  appended: { payload: unknown; type: string }[];
  events: RuntimeEventEntry[];
  logger: Logger;
  registryEntries: Map<string, unknown>;
  runtime: Record<string, (...args: never[]) => unknown>;
  /** 让某一次 appendEvent 挂起，用于观察并发完成顺序。 */
  gateNext(): { close(): void };
  tick: { n: number };
};

/**
 * 最小运行时事件面：`createEvent` 只做包装，`appendEvent` 同步记「进入顺序」并在返回后记
 * 「完成顺序」。`gateNext()` 让下一次 appendEvent 等待显式放行——这样并发断言靠握手而非计时。
 */
export function createFakeRuntime(logger = createLogger()): FakeRuntime {
  const appended: { payload: unknown; type: string }[] = [];
  const events: RuntimeEventEntry[] = [];
  const tick = { n: 0 };
  let gate: { promise: Promise<void>; close(): void } | undefined;
  const registryEntries = new Map<string, unknown>();

  const runtime = {
    appendEvent(event: { payload: Record<string, unknown>; type: string }) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const suffix =
        payload.toolCallId !== undefined
          ? `#${String(payload.toolCallId)}`
          : payload.anchorId !== undefined
            ? `#${String(payload.anchorId)}`
            : payload.resultType !== undefined
              ? `#${String(payload.resultType)}`
              : payload.error !== undefined
                ? `#${String((payload.error as { type?: string }).type ?? "error")}`
                : "";
      const label = `${String(event.type)}${suffix}`;
      events.push({ at: tick.n++, label: `enter:${label}`, phase: "enter" });
      const pending = gate;
      gate = undefined;
      const finish = () => {
        appended.push(event);
        events.push({ at: tick.n++, label: `exit:${label}`, phase: "exit" });
        return event;
      };
      if (!pending) return Promise.resolve(finish());
      return pending.promise.then(finish);
    },
    createEvent(type: string, payload: unknown, _trace: unknown) {
      return { payload, type };
    },
    gateNext() {
      let close = () => undefined;
      const promise = new Promise<void>((resolvePromise) => {
        close = () => resolvePromise();
      });
      gate = { close, promise };
      return { close };
    },
    logger,
    registry: {
      get(name: string) {
        return registryEntries.get(name);
      },
    },
    registryEntries,
    tick,
  };
  const handle = {
    gateNext: runtime.gateNext,
    appended,
    events,
    logger,
    registryEntries,
    runtime,
    tick,
  };
  return handle as unknown as FakeRuntime;
}

/** 把事件类型名序列压成可读序列（事件序列断言用）。 */
export function eventSequence(runtime: FakeRuntime, phase: "enter" | "exit" | "both" = "enter") {
  return runtime.events
    .filter((entry) => phase === "both" || entry.phase === phase)
    .map((entry) => entry.label.replace(/^(enter|exit):/, ""));
}
