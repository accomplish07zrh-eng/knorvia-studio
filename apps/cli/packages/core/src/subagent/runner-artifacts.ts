// SPDX-License-Identifier: Apache-2.0
// 子代理运行的产物落盘：输出文本、task.output 与 metadata.json。
// 全部经 node:fs/promises 直接写；目录不存在就先建，写入编码固定 utf8。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentCompletedOutput } from "@knorvia/contracts";
import type { RuntimeTaskSnapshot } from "../runtime-task/registry.js";
import type { Execution } from "./runner-state.js";

const UTF8 = "utf8";
const TASK_OUTPUT_FILENAME = "task.output";
const METADATA_FILENAME = "metadata.json";
const COMPLETED_STATUS = "completed";
const FAILED_STATUS = "failed";
const STOPPED_STATUS = "stopped";

export async function writeText(path: string, text: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  await writeFile(path, text, UTF8);
}

// metadata.json 的字段顺序是契约：按序构造，最后并入调用方给的 extra。
export async function writeMetadata(
  execution: Execution,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const metadata = {
    agentId: execution.agentId,
    childSessionId: execution.childSessionId,
    createdAt: new Date(execution.startedMs).toISOString(),
    cwd: execution.request.workingDirectory,
    description: execution.request.description,
    metadataFile: execution.metadataFile,
    outputFile: execution.outputFile,
    parentSessionId: execution.request.sessionId,
    parentToolUseId: execution.request.parentToolCallId,
    profileId: execution.request.agentType,
    profileSnapshot: execution.profile,
    prompt: execution.request.prompt,
    status: status,
    taskOutputFile: execution.taskOutputFile,
    updatedAt: new Date().toISOString(),
    workspaceRoot: execution.request.workspaceRoot,
    ...extra,
  };
  await writeText(execution.metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
}

// 输出文本写两份：outputFile 给调用方读，taskOutputFile 给任务卡读。
async function writeOutputPair(execution: Execution, body: string): Promise<void> {
  await writeText(execution.outputFile, body);
  await writeText(execution.taskOutputFile, body);
}

export async function writeCompleted(
  execution: Execution,
  output: AgentCompletedOutput,
): Promise<void> {
  const body = output.content.map((block) => block.text).join("\n\n");
  await writeOutputPair(execution, body);
  const extra = Object.assign(
    { completedAt: new Date().toISOString(), totalDurationMs: output.totalDurationMs },
    {
      totalTokens: output.totalTokens,
      totalToolUseCount: output.totalToolUseCount,
      usage: output.usage,
    },
  );
  await writeMetadata(execution, COMPLETED_STATUS, extra);
}

export async function writeFailed(execution: Execution, error: string): Promise<void> {
  await writeOutputPair(execution, error);
  const extra = { completedAt: new Date().toISOString(), error: error };
  await writeMetadata(execution, FAILED_STATUS, extra);
}

// 任务被停止：没有 outputFile 就没有可写的位置，直接返回。
export async function writeStopped(task: RuntimeTaskSnapshot, message: string): Promise<void> {
  const outputFile = task.outputFile;
  if (!outputFile) return;
  const directory = dirname(outputFile);
  const taskOutputFile = join(directory, TASK_OUTPUT_FILENAME);
  const payload = `${message}\n`;
  await writeText(outputFile, payload);
  await writeText(taskOutputFile, payload);
  const metadata = {
    agentId: task.agentId,
    childSessionId: task.childSessionId,
    completedAt: new Date().toISOString(),
    description: task.description,
    outputFile: outputFile,
    parentSessionId: task.parentSessionId,
    parentToolUseId: task.parentToolCallId,
    profileId: task.agentType,
    prompt: task.prompt,
    status: STOPPED_STATUS,
    taskOutputFile: taskOutputFile,
    updatedAt: new Date().toISOString(),
  };
  await writeText(join(directory, METADATA_FILENAME), `${JSON.stringify(metadata, null, 2)}\n`);
}
