// SPDX-License-Identifier: Apache-2.0
// 上下文源适配器外壳：请求归一化、步骤编排与结果组装；探测逻辑在同目录内部模块。
import { resolve } from "node:path";
import { formatLocalIsoDate } from "@knorvia/contracts";
import type {
  ContextSourceDiagnostic,
  ContextSourcePort,
  ContextSourceRequest,
  ContextSourceSnapshot,
  EnvInfo,
  ResolvedUserInstructions,
} from "@knorvia/contracts";
import { describeEnvironment, resolveShellName } from "./env-info.js";
import { collectUserInstructions } from "./instructions.js";
import { detectProjectContext, findProjectRoot } from "./project.js";
import { resolveGitSnapshot } from "./git-snapshot.js";

export interface NodeContextSourceAdapterOptions {
  env?: NodeJS.ProcessEnv;
}

/** 把请求里的指令选项补齐成「工作目录 + 项目根」两级的完整选项。 */
function expandInstructionOptions(
  options: NonNullable<ContextSourceRequest["userInstructions"]>,
  workingDirectory: string,
  projectRoot: string | null,
) {
  // 请求里显式给的目录/根优先；缺省时才落回本次调用解析出的值。
  // 项目根为 null 时传 undefined，让下游重新走一遍向上查找（与请求语义一致）。
  const expanded = { ...options };
  expanded.workingDirectory = options.workingDirectory ?? workingDirectory;
  expanded.projectRoot = options.projectRoot ?? projectRoot ?? undefined;
  return expanded;
}

export class NodeContextSourceAdapter implements ContextSourcePort {
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: NodeContextSourceAdapterOptions = {}) {
    this.env = options.env ?? process.env;
  }

  async resolveContextSources(request: ContextSourceRequest): Promise<ContextSourceSnapshot> {
    // 编排顺序固定：工作目录 → 项目根 → 环境信息 → 指令 → 项目上下文。
    const cwd = resolve(request.workingDirectory);
    const diagnostics: ContextSourceDiagnostic[] = [];
    const projectRoot = await findProjectRoot(cwd);
    const envInfo =
      request.envInfo ?? (await this.detectEnvInfo(cwd, request.effectiveShellDisplayName));
    const requestedInstructions = request.userInstructions;
    const instructions: ResolvedUserInstructions | undefined = requestedInstructions
      ? await collectUserInstructions({
          diagnostics,
          env: this.env,
          options: expandInstructionOptions(requestedInstructions, cwd, projectRoot),
        })
      : undefined;
    const detectedContext =
      request.projectContext ??
      (projectRoot === null ? undefined : await detectProjectContext(projectRoot));
    return {
      workingDirectory: cwd,
      envInfo,
      currentDate: request.currentDate ?? formatLocalIsoDate(new Date()),
      userInstructions: instructions,
      projectContext: detectedContext,
      diagnostics,
    };
  }

  private async detectEnvInfo(
    workingDirectory: string,
    effectiveShellDisplayName?: string,
  ): Promise<EnvInfo> {
    const gitSnapshot = await resolveGitSnapshot(workingDirectory);
    const shell = resolveShellName(this.env, effectiveShellDisplayName);
    return describeEnvironment(workingDirectory, shell, gitSnapshot);
  }
}

/** 工厂只是构造器的语法糖；适配器不使用全局单例，每个调用方拿到独立实例。 */
export function createNodeContextSourceAdapter(
  options: NodeContextSourceAdapterOptions = {},
): NodeContextSourceAdapter {
  return new NodeContextSourceAdapter(options);
}
