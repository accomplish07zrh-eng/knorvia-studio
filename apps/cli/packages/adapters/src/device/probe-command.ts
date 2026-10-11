// SPDX-License-Identifier: Apache-2.0
// 探针命令执行：固定缓冲/超时，失败归一成 ProcessProbeFailure。
import {
  execFile as nodeExecFile,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process";
import { promisify } from "node:util";
import {
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  ProcessProbeFailure,
  type ProcessProbeCommandResult,
  type ProcessProbeExecFile,
} from "./probe-types.js";

type SpawnOptions = ExecFileOptionsWithStringEncoding;

const OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
const ENCODING = "utf8";

/** 探针命令的固定执行参数；调用方可用 `extra` 追加（如 windowsHide）。 */
function commandOptions(extra?: Partial<SpawnOptions>): SpawnOptions {
  const options = { encoding: ENCODING } as SpawnOptions;
  options.maxBuffer = OUTPUT_LIMIT_BYTES;
  options.timeout = PROCESS_PROBE_SAMPLE_TIMEOUT_MS;
  if (extra !== undefined) Object.assign(options, extra);
  return options;
}

function failureDetail(response: ProcessProbeCommandResult): string {
  const stderr = response.stderr.trim();
  return stderr.length > 0 ? stderr : String(response.status);
}

export async function runProbeCommand(
  probe: ProcessProbeExecFile,
  binary: string,
  argv: readonly string[],
  extra?: Partial<SpawnOptions>,
): Promise<string> {
  const response = await probe(binary, argv, commandOptions(extra));
  if (response.status === 0 && response.error === undefined) return response.stdout;
  throw new ProcessProbeFailure(`${binary} 采样失败: ${failureDetail(response)}`);
}

/** 默认执行器：把 child_process 的失败也转成结果对象，永不 reject。 */
export async function defaultProbeExecFile(
  binary: string,
  argv: readonly string[],
  spawnOptions: SpawnOptions,
): Promise<ProcessProbeCommandResult> {
  const run = promisify(nodeExecFile);
  try {
    const outcome = await run(binary, argv, spawnOptions);
    return { status: 0, stderr: outcome.stderr, stdout: outcome.stdout };
  } catch (error) {
    return failureResult(error);
  }
}

/** 失败结果：退出码与输出能从错误对象上取到就取，取不到则给安全默认值。 */
function failureResult(error: unknown): ProcessProbeCommandResult {
  const thrown = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
  const entry = { error } as ProcessProbeCommandResult;
  entry.status = typeof thrown.code === "number" ? thrown.code : null;
  entry.stderr = typeof thrown.stderr === "string" ? thrown.stderr : "";
  entry.stdout = typeof thrown.stdout === "string" ? thrown.stdout : "";
  return entry;
}
