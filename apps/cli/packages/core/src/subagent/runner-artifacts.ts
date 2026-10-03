import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentCompletedOutput } from "@knorvia/contracts";
import type { RuntimeTaskSnapshot } from "../runtime-task/registry.js";
import type { Execution } from "./runner-state.js";
export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}
export async function writeMetadata(
  execution: Execution,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const {
    request,
    profile,
    agentId,
    childSessionId,
    startedMs,
    metadataFile,
    outputFile,
    taskOutputFile,
  } = execution;
  await writeText(
    metadataFile,
    `${JSON.stringify({ agentId, childSessionId, createdAt: new Date(startedMs).toISOString(), cwd: request.workingDirectory, description: request.description, metadataFile, outputFile, parentSessionId: request.sessionId, parentToolUseId: request.parentToolCallId, profileId: request.agentType, profileSnapshot: profile, prompt: request.prompt, status, taskOutputFile, updatedAt: new Date().toISOString(), workspaceRoot: request.workspaceRoot, ...extra }, null, 2)}\n`,
  );
}
async function writeOutputPair(execution: Execution, text: string): Promise<void> {
  await writeText(execution.outputFile, text);
  await writeText(execution.taskOutputFile, text);
}
export async function writeCompleted(
  execution: Execution,
  output: AgentCompletedOutput,
): Promise<void> {
  const text = output.content.map((block) => block.text).join("\n\n");
  await writeOutputPair(execution, text);
  await writeMetadata(execution, "completed", {
    completedAt: new Date().toISOString(),
    totalDurationMs: output.totalDurationMs,
    totalTokens: output.totalTokens,
    totalToolUseCount: output.totalToolUseCount,
    usage: output.usage,
  });
}
export async function writeFailed(execution: Execution, error: string): Promise<void> {
  await writeOutputPair(execution, error);
  await writeMetadata(execution, "failed", { completedAt: new Date().toISOString(), error });
}
export async function writeStopped(task: RuntimeTaskSnapshot, message: string): Promise<void> {
  if (!task.outputFile) return;
  const taskOutputFile = join(dirname(task.outputFile), "task.output");
  await writeText(task.outputFile, `${message}\n`);
  await writeText(taskOutputFile, `${message}\n`);
  await writeText(
    join(dirname(task.outputFile), "metadata.json"),
    `${JSON.stringify({ agentId: task.agentId, childSessionId: task.childSessionId, completedAt: new Date().toISOString(), description: task.description, outputFile: task.outputFile, parentSessionId: task.parentSessionId, parentToolUseId: task.parentToolCallId, profileId: task.agentType, prompt: task.prompt, status: "stopped", taskOutputFile, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}
