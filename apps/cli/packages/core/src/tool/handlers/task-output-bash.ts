import { readTaskOutputWindow } from "./task-output-file-window.js";
import type { BackgroundExecutionSnapshot, TaskOutputTask } from "@knorvia/contracts";
import type { RuntimeTaskSnapshot } from "../../runtime-task/registry.js";
import type { ToolExecutionContext } from "../types.js";

interface ProjectBashTaskOptions {
  readOutputFile: (path: string | undefined) => Promise<TaskOutputFileRead>;
  runningOutputPrefixBytes: number;
}

interface TaskOutputFileRead {
  available: boolean;
  content: string;
  truncated: boolean;
}

interface BashOutputPart {
  content: string;
  path?: string;
}

export async function projectBashTask(
  task: RuntimeTaskSnapshot,
  context: ToolExecutionContext,
  options: ProjectBashTaskOptions,
): Promise<TaskOutputTask> {
  const snapshot = await context.executionPort?.getBackgroundTask?.(task.taskId);
  const projected = snapshot
    ? await projectBashSnapshot(snapshot, task, context, options)
    : await projectFallbackTaskFile(task.outputFile, options);

  return {
    task_id: task.taskId,
    task_type: task.type,
    status: task.status,
    description: task.description,
    output: projected.output,
    exitCode: snapshot?.result?.exitCode ?? task.exitCode ?? null,
    ...(projected.outputFile ? { outputFile: projected.outputFile } : {}),
  };
}

async function projectBashSnapshot(
  snapshot: BackgroundExecutionSnapshot,
  task: RuntimeTaskSnapshot,
  context: ToolExecutionContext,
  options: ProjectBashTaskOptions,
): Promise<{ output: string; outputFile?: string }> {
  const stdoutPath =
    snapshot.outputPath ??
    task.outputFile ??
    snapshot.stdoutPersistedOutputPath ??
    snapshot.result?.stdout.artifactPath;
  const stderrPath = snapshot.stderrPersistedOutputPath ?? snapshot.result?.stderr.artifactPath;
  const readOutputFile =
    task.status === "running"
      ? (path: string | undefined) =>
          readRunningBashOutputFile(path, context, options.runningOutputPrefixBytes)
      : options.readOutputFile;

  const stdout = await readBashOutputPart(
    stdoutPath,
    snapshot.result?.stdout.text ?? snapshot.stdoutTail ?? "",
    readOutputFile,
  );
  const stderr =
    stderrPath && stderrPath === stdout.path
      ? { content: "", path: stderrPath }
      : await readBashOutputPart(
          stderrPath,
          snapshot.result?.stderr.text ?? snapshot.stderrTail ?? "",
          readOutputFile,
        );

  const output = [stdout.content, stderr.content].filter((part) => part.length > 0).join("\n");
  const outputFile =
    stdout.path && (!stderr.content || stderr.path === stdout.path)
      ? stdout.path
      : !stdout.content && stderr.path
        ? stderr.path
        : undefined;

  return {
    output,
    ...(outputFile ? { outputFile } : {}),
  };
}

async function readBashOutputPart(
  path: string | undefined,
  fallback: string,
  readOutputFile: ProjectBashTaskOptions["readOutputFile"],
): Promise<BashOutputPart> {
  const read = await readOutputFile(path);
  if (read.available) {
    return {
      content: read.content,
      ...(path ? { path } : {}),
    };
  }
  return { content: fallback };
}

async function projectFallbackTaskFile(
  outputFile: string | undefined,
  options: ProjectBashTaskOptions,
): Promise<{ output: string; outputFile?: string }> {
  const read = await options.readOutputFile(outputFile);
  return {
    output: read.content,
    ...(outputFile && read.available ? { outputFile } : {}),
  };
}

async function readRunningBashOutputFile(
  outputFile: string | undefined,
  context: ToolExecutionContext,
  maxBytes: number,
): Promise<TaskOutputFileRead> {
  return readTaskOutputWindow(outputFile, context.abortSignal, maxBytes, "head");
}
