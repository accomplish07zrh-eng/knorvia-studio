// SPDX-License-Identifier: Apache-2.0
// bash 工作目录决策：命令成功后，把会话工作目录跟随到命令实际落点——
// 工作区内保留物理路径，逃逸出工作区则重置回会话根并把重置文案写进 stderr。
// 只有「主作用域 + 完成 + 退出码 0 + 捕获到 cwd」四条件齐备才产生决策。
import { realpathSync } from "node:fs";
import { platform as currentPlatform } from "node:process";
import type { ExecutionResult } from "@knorvia/contracts";
import {
  getToolPathApi,
  normalizeToolPathForComparison,
  type ToolPathApi,
  type ToolPathPlatform,
} from "../path-normalization.js";
import type { ToolRuntimeScope } from "../types.js";

interface BashCwdPolicyInput {
  status: ExecutionResult["status"];
  exitCode: number | undefined;
  runtimeScope?: ToolRuntimeScope;
  resolvedCwd: string | undefined;
  workspaceRoot: string;
  platform?: ToolPathPlatform;
}

interface BashCwdPolicyDecision {
  nextWorkingDirectory?: string;
  stderrSuffix?: string;
}

interface BoundaryView {
  pathTool: ToolPathApi;
  /** 归一化后的落点与工作区根。 */
  landingForm: string;
  rootForm: string;
  /** 等价形态组：逻辑路径与物理路径都参与包含判断。 */
  comparableForms: Array<{ landing: string; root: string }>;
}

// macOS 上 /private 前缀是同一目录的别名，比较前先统一。
const MACOS_ALIAS_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/private\/var\//u, "/var/"],
  [/^\/private\/tmp(\/|$)/u, "/tmp$1"],
];

export function decideBashCwdPolicy(request: BashCwdPolicyInput): BashCwdPolicyDecision {
  if (!qualifyingForegroundRun(request)) return {};

  const boundary = describeBoundary(request);
  if (landingStaysWithin(boundary)) {
    return { nextWorkingDirectory: boundary.landingForm };
  }
  const resetNotice = `Shell cwd was reset to ${boundary.rootForm}`;
  return {
    nextWorkingDirectory: boundary.rootForm,
    stderrSuffix: resetNotice,
  };
}

export function appendBashCwdStderrSuffix(text: string, note: string | undefined): string {
  if (!note) return text;
  const trimmedStderr = text.replace(/[\r\n]+$/, "");
  if (!trimmedStderr) return note;
  return `${trimmedStderr}\n${note}`;
}

// 四条件：主作用域、正常完成、退出码 0、确实捕获到了落点目录。
function qualifyingForegroundRun(request: BashCwdPolicyInput): boolean {
  if (request.status !== "completed") return false;
  if (request.exitCode !== 0) return false;
  if (!request.resolvedCwd) return false;
  return (request.runtimeScope ?? "main") === "main";
}

// 命令捕获到的落点是物理路径（pwd -P），而会话根可能是逻辑路径（symlink 入口）。
// 两种形态都收进等价组再判断包含，避免把项目内的物理路径误判成离开项目。
function describeBoundary(request: BashCwdPolicyInput): BoundaryView {
  const platform = request.platform ?? currentPlatform;
  const windowsStyle = platform === "win32";
  const landingForm = stripPlatformAliases(request.resolvedCwd ?? "", windowsStyle);
  const rootForm = stripPlatformAliases(request.workspaceRoot, windowsStyle);
  const comparableForms: Array<{ landing: string; root: string }> = [
    { landing: landingForm, root: rootForm },
  ];

  const physicalLanding = physicalForm(request.resolvedCwd ?? "", windowsStyle);
  const physicalRoot = physicalForm(request.workspaceRoot, windowsStyle);
  if (physicalLanding !== undefined && physicalRoot !== undefined) {
    comparableForms.push({ landing: physicalLanding, root: physicalRoot });
  }
  const view: BoundaryView = {
    pathTool: getToolPathApi(platform),
    landingForm,
    rootForm,
    comparableForms,
  };
  return view;
}

function landingStaysWithin(boundary: BoundaryView): boolean {
  return boundary.comparableForms.some((pair) =>
    relativeGapStaysInside(pair.landing, pair.root, boundary.pathTool),
  );
}

function relativeGapStaysInside(child: string, root: string, pathApi: ToolPathApi): boolean {
  const gap = pathApi.relative(root, child);
  const sameDirectory = gap === "";
  return sameDirectory || !gapLeavesRoot(gap, pathApi);
}

function gapLeavesRoot(relativeGap: string, pathApi: ToolPathApi): boolean {
  const climbsParent = relativeGap === ".." || relativeGap.startsWith(`..${pathApi.sep}`);
  return climbsParent || pathApi.isAbsolute(relativeGap);
}

function stripPlatformAliases(value: string, windowsStyle: boolean): string {
  let form = normalizeToolPathForComparison(value, windowsStyle ? "win32" : "linux");
  if (!windowsStyle) {
    for (const [aliasPattern, canonicalPrefix] of MACOS_ALIAS_RULES) {
      form = form.replace(aliasPattern, canonicalPrefix);
    }
  }
  return form;
}

function physicalForm(value: string, windowsStyle: boolean): string | undefined {
  const resolved = tryRealpath(value);
  if (resolved === undefined) return undefined;
  return stripPlatformAliases(resolved, windowsStyle);
}

function tryRealpath(value: string): string | undefined {
  try {
    return realpathSync.native(value);
  } catch {
    return undefined;
  }
}
