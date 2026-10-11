// SPDX-License-Identifier: Apache-2.0
// 只读 git 探针的唯一执行入口：固定超时与缓冲上限，失败时丢弃不可信输出。
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_BINARY = "git";
const PROBE_TIMEOUT_MS = 3_000;
const PROBE_BUFFER_BYTES = 1024 * 1024;

/** 探针统一使用的进程参数：编码、缓冲上限、超时与隐藏窗口。 */
const PROBE_PROCESS_OPTIONS = {
  encoding: "utf8",
  maxBuffer: PROBE_BUFFER_BYTES,
  timeout: PROBE_TIMEOUT_MS,
  windowsHide: true,
} as const;

/** 探针请求：只有工作目录与参数，探针本身没有可变状态。 */
export interface GitProbeRequest {
  args: readonly string[];
  cwd: string;
}

export interface GitProbeOutcome {
  ok: boolean;
  text: string;
}

/** 探针失败时的固定结果：stdout/stderr 都不可信，整块丢弃，避免污染 provider 可见的 git 上下文。 */
const UNREADABLE_OUTPUT: GitProbeOutcome = { ok: false, text: "" };

function textOf(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  return value?.toString("utf8") ?? "";
}

export async function runGitProbe(request: GitProbeRequest): Promise<GitProbeOutcome> {
  const processOptions = { ...PROBE_PROCESS_OPTIONS, cwd: request.cwd };
  try {
    const outcome = await execFileAsync(GIT_BINARY, [...request.args], processOptions);
    return { ok: true, text: textOf(outcome.stdout) };
  } catch {
    return UNREADABLE_OUTPUT;
  }
}

/** 取原始输出（不 trim）；调用方自行决定是否去掉首尾空白。 */
export async function readGitText(request: GitProbeRequest): Promise<string> {
  return (await runGitProbe(request)).text;
}

/** 取 trim 后的单值；空输出归一成 undefined，省掉调用方的空串判断。 */
export async function readGitScalar(request: GitProbeRequest): Promise<string | undefined> {
  const trimmed = (await readGitText(request)).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 只关心命令是否成功（例如 `show-ref --verify --quiet`）。 */
export async function gitCommandSucceeds(request: GitProbeRequest): Promise<boolean> {
  return (await runGitProbe(request)).ok;
}
