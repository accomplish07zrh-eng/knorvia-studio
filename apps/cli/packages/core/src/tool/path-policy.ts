// SPDX-License-Identifier: Apache-2.0
// 工具路径策略：把工具入参解析成绝对路径，并把配置错误与空路径错误分开报。
//
// 唯一状态是入参本身；两个导出函数都只做校验与拼接，不读写文件系统。
// 当前版本**刻意不**拦截 workspaceRoot 之外的路径（子代理需要查看用户点名的兄弟仓库或外部文件，
// 由文件系统权限适配器承担 ask/deny）；这条是行为契约的一部分，不是遗漏。

import { isAbsolute, normalize, resolve } from "node:path";
import { CoreErrorType, createCoreError } from "@knorvia/contracts";

type PathOperation = "read" | "write" | "execute";

interface WorkspacePathRequest {
  readonly inputPath: string;
  readonly workingDirectory: string;
  readonly workspaceRoot: string;
  readonly operation: PathOperation;
}

export function resolveWorkspacePath(options: WorkspacePathRequest): string {
  const workingDirectory = requireAbsoluteDirectory(options.workingDirectory, "workingDirectory");
  requireAbsoluteDirectory(options.workspaceRoot, "workspaceRoot");
  if (options.inputPath.length === 0) throw emptyToolPathError(options.operation);
  return resolveAgainstWorkingDirectory(options.inputPath, workingDirectory);
}

export function resolveToolWorkingDirectory(
  inputCwd: string | undefined,
  options: Omit<WorkspacePathRequest, "inputPath">,
): string {
  if (inputCwd) return resolveWorkspacePath({ ...options, inputPath: inputCwd });
  const resolvedWorkingDirectory = requireAbsoluteDirectory(
    options.workingDirectory,
    "workingDirectory",
  );
  requireAbsoluteDirectory(options.workspaceRoot, "workspaceRoot");
  return resolvedWorkingDirectory;
}

// 绝对路径直接归一，相对路径挂到已校验的 workingDirectory 下。
function resolveAgainstWorkingDirectory(inputPath: string, workingDirectory: string): string {
  return isAbsolute(inputPath) ? normalize(inputPath) : resolve(workingDirectory, inputPath);
}

// 两个目录参数都必须已归一且绝对；否则是配置错误（不可恢复）。
function requireAbsoluteDirectory(value: string, label: string): string {
  const candidate = normalize(value);
  if (isAbsolute(candidate)) return candidate;
  throw configurationError(label, value);
}

function configurationError(label: string, value: string) {
  return createCoreError(
    CoreErrorType.ConfigurationError,
    `${label} must be an absolute path for tool execution`,
    { context: { [label]: value }, recoverable: false },
  );
}

// 空输入路径是调用方错误（可恢复），与配置错误分开报，便于调用点决定是否重试。
function emptyToolPathError(operation: PathOperation) {
  return createCoreError(CoreErrorType.ToolExecutionFailed, "Tool path must not be empty", {
    context: { operation },
    recoverable: true,
  });
}
