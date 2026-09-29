// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

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

type StdioRequestMetaProvider = () => Promise<Record<string, unknown> | undefined>;
type ProcessTreeStdioServerParameters = StdioServerParameters & {
  requestMetaProvider?: StdioRequestMetaProvider;
};

interface StdioProcessExitInfo {
  exitCode: number | null;
  exitedAt: number;
  signal: NodeJS.Signals | null;
  startedAt: number;
}

interface ProcessTreeStdioClientTransportOptions {
  windowsJobObjectFactory?: (pid: number) => Promise<WindowsJobObjectController | undefined>;
}

const sdkDispose = Object.getOwnPropertyDescriptor(StdioClientTransport.prototype, "_dispose")
  ?.value as ((this: StdioClientTransport) => Promise<void>) | undefined;

function objectFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class ProcessTreeStdioClientTransport extends StdioClientTransport {
  readonly #metaProvider: StdioRequestMetaProvider | undefined;
  readonly #jobFactory: (pid: number) => Promise<WindowsJobObjectController | undefined>;
  #child: ChildProcess | undefined;
  #firstExit: StdioProcessExitInfo | undefined;
  #job: WindowsJobObjectController | undefined;

  constructor(
    server: ProcessTreeStdioServerParameters,
    options: ProcessTreeStdioClientTransportOptions = {},
  ) {
    super(server);
    this.#metaProvider = server.requestMetaProvider;
    this.#jobFactory = options.windowsJobObjectFactory ?? attachProcessToWindowsJobObject;
  }

  async terminateWindowsJobObject(): Promise<void> {
    const controller = this.#job;
    this.#job = undefined;
    if (!controller) return;
    try {
      controller.terminate();
    } catch {
      // 终止失败仍进入 close；不等待声明外的 Promise 返回值。
    } finally {
      try {
        controller.close();
      } catch {
        // 当前引用已先清空，失败不恢复它或新增重试。
      }
    }
  }

  override async send(message: JSONRPCMessage): Promise<void> {
    const meta = await this.#metaProvider?.();
    if (!("method" in message) || !meta || Object.keys(meta).length === 0) {
      await super.send(message);
      return;
    }
    const paramsValue = message.params;
    const params = objectFields(paramsValue) ? paramsValue : {};
    const oldMeta = params._meta;
    const prior = objectFields(oldMeta) ? oldMeta : {};
    await super.send({ ...message, params: { ...params, _meta: { ...prior, ...meta } } });
  }

  override async start(): Promise<void> {
    const startedAt = Date.now();
    await super.start();
    const child = (this as unknown as { _process?: ChildProcess | null })._process;
    if (!child) return;
    this.#child = child;
    const recordExit = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      this.#firstExit ??= { exitCode, exitedAt: Date.now(), signal, startedAt };
    };
    if (child.exitCode !== null || child.signalCode !== null) {
      recordExit(child.exitCode, child.signalCode);
      return;
    }
    child.once("exit", recordExit);
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

Object.defineProperty(ProcessTreeStdioClientTransport.prototype, "_dispose", {
  configurable: true,
  enumerable: false,
  writable: false,
  async value(this: ProcessTreeStdioClientTransport): Promise<void> {
    const pid = this.pid;
    await this.terminateWindowsJobObject();
    if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
      try {
        await terminateMcpStdioProcessTree(pid);
      } catch {
        // 树终止失败不阻断 SDK 回收；更早的 pid/job 错误仍按原边界传播。
      }
    }
    if (sdkDispose) {
      await sdkDispose.call(this);
      return;
    }
    await this.close();
  },
});
