// SPDX-License-Identifier: Apache-2.0
// 入口文件落盘。payload 不能走命令行（Windows 限 32,767 字符），于是渲染成一份 ESM 写到磁盘，
// argv 里只留路径。写入位置按「先项目内、再系统临时目录」的两级计划推进：
// 第一级失败只报告一次告警，第二级仍失败才把错误抛给调用方。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ChildEntryFile,
  HarnessWarning,
  WriteChildEntryFileInput,
} from "./entry-file-types.js";

export type {
  ChildEntryFile,
  HarnessWarning,
  WriteChildEntryFileInput,
} from "./entry-file-types.js";

/** 项目内的运行目录：与 saved workflow 的 `.knorvia-studio/workflows/` 平级、互不混放。 */
const PROJECT_DIR_PARTS = [".knorvia-studio", "workflow-runs"];
/** 系统临时目录下的共享回落目录；跨项目共用，靠 runId 区分。 */
const SHARED_FALLBACK_NAME = "knorvia-workflow-runs";
/** 目录自带的忽略文件：让整个运行目录不进版本库，内容只有一行通配。 */
const IGNORE_FILE_NAME = ".gitignore";
const IGNORE_FILE_BODY = "*\n";
/** 文件名里允许保留的字符；其余（含路径分隔符）逐个替换。 */
const FILE_NAME_ALLOWED = /[^A-Za-z0-9._-]/g;
const RUN_FILE_SUFFIX = ".mjs";

/** 一个落点：目录 + 它在结果里自称的位置。 */
interface LandingSpot {
  dir: string;
  location: ChildEntryFile["location"];
}

/** 落盘尝试的结果：要么拿到路径，要么拿到原因。 */
interface Placement {
  path?: string;
  error?: string;
}

/** 项目内的入口文件目录。 */
export function workflowRunsDir(cwd: string): string {
  return join(cwd, ...PROJECT_DIR_PARTS);
}

/** 回落目录（OS 临时目录下，跨项目共用）。 */
export function fallbackWorkflowRunsDir(): string {
  return join(tmpdir(), SHARED_FALLBACK_NAME);
}

/** runId 里不属于安全字符集的部分一律换下划线，再接扩展名。 */
export function childEntryFileName(runId: string): string {
  return `${runId.replace(FILE_NAME_ALLOWED, "_")}${RUN_FILE_SUFFIX}`;
}

/**
 * 落盘。两级落点按顺序尝试：项目目录成功就地返回；项目目录失败先发一次
 * `entry_file_fallback` 告警再试回落目录；回落也失败则抛出回落那次的错误。
 */
export function writeChildEntryFile(input: WriteChildEntryFileInput): ChildEntryFile {
  const fileName = childEntryFileName(input.runId);
  const { project, fallback } = landingSpots(input.cwd);

  const inProject = placeRunFile(project, fileName, input.source);
  if (inProject.path !== undefined) return { path: inProject.path, location: project.location };

  input.onWarning?.(warningFor(project, fallback, inProject.error));
  const inFallback = placeRunFile(fallback, fileName, input.source);
  if (inFallback.path !== undefined) return { path: inFallback.path, location: fallback.location };
  throw new Error(inFallback.error);
}

/** 两级落点的唯一构造处：顺序即优先级，告警与抛错都按它说话。 */
function landingSpots(cwd: string): { project: LandingSpot; fallback: LandingSpot } {
  return {
    project: { dir: workflowRunsDir(cwd), location: "project" },
    fallback: { dir: fallbackWorkflowRunsDir(), location: "tmpdir" },
  };
}

/**
 * 一次落盘：备好目录与忽略文件后写入。入口文件允许原位覆写——同 runId 的再次运行会覆盖
 * 上一次的执行体，目录因此也兼作每次 run 的执行体存档。
 */
function placeRunFile(spot: LandingSpot, fileName: string, source: string): Placement {
  const failure = prepareRunsDir(spot.dir);
  if (failure !== undefined) return { error: failure };
  const target = join(spot.dir, fileName);
  const writeFailure = attempt(() => writeFileSync(target, source, "utf8"));
  return writeFailure === undefined ? { path: target } : { error: writeFailure };
}

/** 建目录并补齐忽略文件。忽略文件已存在时保持原样（用户可能改过它）。 */
function prepareRunsDir(dir: string): string | undefined {
  const dirFailure = attempt(() => mkdirSync(dir, { recursive: true }));
  if (dirFailure !== undefined) return dirFailure;
  const ignorePath = join(dir, IGNORE_FILE_NAME);
  if (existsSync(ignorePath)) return undefined;
  return attempt(() =>
    writeFileSync(ignorePath, IGNORE_FILE_BODY, { encoding: "utf8", flag: "wx" }),
  );
}

/** 把可能抛错的动作收成一个返回值：成功给 undefined，失败给错误文本。 */
function attempt(action: () => void): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** 告警形状由 interface.md 锁定（`kind` 字面量固定），这里只做组装。 */
function warningFor(
  project: LandingSpot,
  fallback: LandingSpot,
  error: string | undefined,
): HarnessWarning {
  return {
    kind: "entry_file_fallback",
    projectDir: project.dir,
    fallbackDir: fallback.dir,
    error: error ?? "unknown write failure",
  };
}
