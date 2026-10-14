// SPDX-License-Identifier: Apache-2.0
// 草稿目录免确认判定。PermissionService 只需要一个布尔值，所以判定单独成模块：它是免确认的唯一
// 闸门，必须能脱离 service 逐例验证（Windows 语义也要跑一遍）。判定是纯函数——只比路径字符串，
// 不 realpath、不 stat；一次磁盘读失败不会把「不放行」变成「放行」。
import nodePath from "node:path";

import { WORKFLOW_DRAFTS_DIR } from "@knorvia/contracts";

// 只依赖 node:path 的这三个方法；注入 path.win32 / path.posix 才能在测试里覆盖盘符、反斜杠与
// 大小写差异。
interface DraftPathModule {
  isAbsolute: (path: string) => boolean;
  relative: (base: string, target: string) => string;
  resolve: (...segments: string[]) => string;
}

interface DraftPathCheck {
  // 写入目标：相对路径按 workingDirectory 解析，绝对路径原样保留。
  filePath: string;
  // 会话工作目录。空串表示调用方拿不到，一律不放行。
  workingDirectory: string;
  // 平台 path 实现；默认取当前平台的 node:path。
  pathModule?: DraftPathModule;
}

// 只有 Edit 与 Write 命中免确认：它们共用 edit 权限名，且都只有一个 file_path 目标。
// ApplyPatch 虽然也是 edit，但输入是补丁正文、可一次改多个文件，没有单一路径可判，故不在列。
const DRAFT_WRITE_TOOL_NAMES = new Set(["Edit", "Write"]);
const PARENT_SEGMENT = "..";
const NOT_INSIDE = false;

interface WorkflowDraftWriteInput {
  toolName: string;
  // 工具输入（尚未按具体工具的 schema 解析），只从中取 file_path。
  input: unknown;
  // 会话工作目录；调用方拿不到时可以缺席，缺席即不免确认。
  workingDirectory?: string;
  pathModule?: DraftPathModule;
}

// 判断这次工具调用是不是「往草稿目录里写」——是就可以免掉确认窗。
// 放行它是安全的：草稿目录由工具自己写、带 .gitignore 不进版本库，用户不会往里放要保护的东西；
// 而「让脚本真正跑起来」另有一道闸——CreateWorkflow 声明 alwaysAsk，确认窗审的是提交上来的
// 脚本内容。所以放行写入不等于放行执行。
// workingDirectory 缺席（调用方没传）时一律不放行：算不出目标落在哪，该弹的窗照弹。
export function isPreapprovedWorkflowDraftWrite(input: WorkflowDraftWriteInput): boolean {
  if (!DRAFT_WRITE_TOOL_NAMES.has(input.toolName)) return NOT_INSIDE;
  if (typeof input.workingDirectory !== "string") return NOT_INSIDE;
  if (!input.input || typeof input.input !== "object") return NOT_INSIDE;
  const filePath = (input.input as Record<string, unknown>).file_path;
  if (typeof filePath !== "string") return NOT_INSIDE;
  return isInsideDraftDirectory({
    filePath,
    pathModule: input.pathModule,
    workingDirectory: input.workingDirectory,
  });
}

// 目标是否严格位于 <workingDirectory>/.knorvia-studio/workflow-drafts/ 之内。
function isInsideDraftDirectory(input: DraftPathCheck): boolean {
  const path = input.pathModule ?? nodePath;
  // 没有工作目录就没有「哪个项目的草稿目录」可言，宁可不放行：免确认的前提是目标可被定位。
  if (input.workingDirectory.length === 0 || input.filePath.length === 0) return NOT_INSIDE;

  const draftsDirectory = path.resolve(input.workingDirectory, WORKFLOW_DRAFTS_DIR);
  const target = path.resolve(input.workingDirectory, input.filePath);
  return isStrictlyInside(path.relative(draftsDirectory, target), path);
}

// 三个条件缺一不可：非空（排除目标就是目录本身）、非绝对（Windows 上跨盘符时 relative 会返回
// 绝对路径而不是 ..）、不以 .. 开头（排除向上穿越）。全程只比字符串，所以前缀相近的兄弟目录
// （.knorvia-studio/workflow-drafts-other/）不会被误判成目录内。
function isStrictlyInside(relativePath: string, path: DraftPathModule): boolean {
  if (relativePath.length === 0) return NOT_INSIDE;
  if (path.isAbsolute(relativePath)) return NOT_INSIDE;
  return !relativePath.startsWith(PARENT_SEGMENT);
}
