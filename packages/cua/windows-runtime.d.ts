import type { ComputerUseRuntimeContext } from "./index.d.ts";

export interface WindowsComputerContext extends ComputerUseRuntimeContext {
  turnId: string;
}
export interface WindowsDriverRequest {
  method: "list_windows" | "observe" | "check_window" | "act";
  params: Record<string, unknown>;
}
export type WindowsComputerDriver = ((
  request: WindowsDriverRequest,
  options: { signal: AbortSignal; timeoutMs: number; scopeId?: string },
) => Promise<unknown>) & { closeScope?(scopeId: string): Promise<void>; dispose?(): Promise<void> };
export interface WindowsComputerRuntimeOptions {
  driverPath?: string;
  driver?: WindowsComputerDriver;
  platform?: string;
  now?: () => number;
  observationTtlMs?: number;
  scopeTtlMs?: number;
  requestTtlMs?: number;
  driverTimeoutMs?: number;
  maxOutputBytes?: number;
  maxScopes?: number;
  maxRequests?: number;
}
export interface WindowsComputerTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface WindowsComputerResult {
  content: Array<
    { type: "text"; text: string } | { type: "image"; mimeType: string; data: string }
  >;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}
export interface WindowsComputerRuntime {
  listTools(): WindowsComputerTool[];
  execute(input: {
    toolName: string;
    arguments?: unknown;
    context: ComputerUseRuntimeContext;
    signal?: AbortSignal;
  }): Promise<WindowsComputerResult>;
  closeSession(context: ComputerUseRuntimeContext): Promise<void>;
  dispose(): Promise<void>;
}
export declare const WINDOWS_COMPUTER_TOOLS: readonly WindowsComputerTool[];
export declare class WindowsComputerUseError extends Error {
  code: string;
  dispatched: boolean;
  outcome: string;
  constructor(code: string, message: string, options?: { dispatched?: boolean; outcome?: string });
}
export declare function createWindowsComputerDriver(
  options?: WindowsComputerRuntimeOptions & {
    spawn?: typeof import("node:child_process").spawn;
  },
): WindowsComputerDriver;
export declare function createWindowsComputerUseRuntime(
  options?: WindowsComputerRuntimeOptions,
): WindowsComputerRuntime;
