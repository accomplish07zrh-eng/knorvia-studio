// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 的错误码；message 不得携带凭据与环境变量值。

export type KernelErrorCode =
  | "KERNEL_ALREADY_BOOTED"
  | "KERNEL_INVALID_CWD"
  | "KERNEL_CONFIG_FAILED"
  | "KERNEL_BOOT_FAILED"
  | "KERNEL_DISPOSE_FAILED";

export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(code: KernelErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
}

export class KernelAlreadyBootedError extends KernelError {
  constructor() {
    super("KERNEL_ALREADY_BOOTED", "Kernel is already booted; dispose the active host first.");
  }
}

export class KernelInvalidCwdError extends KernelError {
  constructor(cwd: string) {
    super("KERNEL_INVALID_CWD", `Kernel cwd must be an absolute path: ${cwd}`);
  }
}

export class KernelConfigError extends KernelError {
  constructor(message: string, options?: ErrorOptions) {
    super("KERNEL_CONFIG_FAILED", message, options);
  }
}

export class KernelBootError extends KernelError {
  constructor(message: string, options?: ErrorOptions) {
    super("KERNEL_BOOT_FAILED", message, options);
  }
}

export class KernelDisposeError extends KernelError {
  constructor(message: string, options?: ErrorOptions) {
    super("KERNEL_DISPOSE_FAILED", message, options);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
