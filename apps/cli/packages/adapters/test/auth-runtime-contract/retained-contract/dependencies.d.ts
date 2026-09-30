// SPDX-License-Identifier: Apache-2.0
// Retained public compatibility declaration.

declare namespace NodeJS {
  type Platform =
    | "aix"
    | "android"
    | "darwin"
    | "freebsd"
    | "haiku"
    | "linux"
    | "openbsd"
    | "sunos"
    | "win32"
    | "cygwin"
    | "netbsd";
}

declare module "node:child_process" {
  export interface SpawnOptions {
    detached?: boolean;
    stdio?: "ignore";
    windowsHide?: boolean;
  }

  export interface ChildProcess {
    once(event: "spawn", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    removeAllListeners(event?: string): this;
    unref(): void;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
}

declare module "@knorvia/shared/node" {
  export interface SharedFileLockOptions {
    lockRetryDelaysMs?: readonly number[];
    lockOwnerlessGraceMs?: number;
    lockMaxWaitMs?: number;
  }
  export function withFileLock<T>(
    filePath: string,
    operation: () => Promise<T>,
    options?: SharedFileLockOptions,
  ): Promise<T>;
  export function atomicWritePrivateTextFile(
    filePath: string,
    content: string,
    renameRetryDelaysMs?: readonly number[],
  ): Promise<void>;
  export function backupCorruptFile(filePath: string): Promise<string>;
}
