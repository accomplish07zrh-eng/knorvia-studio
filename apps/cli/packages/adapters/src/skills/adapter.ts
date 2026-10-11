// SPDX-License-Identifier: Apache-2.0
// 技能适配器：构造时解析禁用名单，两个公开方法转发给 catalog。
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type {
  SkillContent,
  SkillLoadOutcome,
  SkillOperationOptions,
  SkillPort,
  SkillRoot,
} from "@knorvia/contracts";
import { discoverSkillCatalog, loadSkillContent, type DiscoveryContext } from "./catalog.js";
import type { SkillRootResolutionOptions } from "./roots.js";

export interface NodeSkillAdapterOptions extends SkillRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}

/** 请求形状：`roots` 省略时按适配器选项发现默认根。 */
export interface SkillRequest {
  roots?: SkillRoot[];
  workingDirectory: string;
}

interface LoadSkillRequest extends SkillRequest {
  maxBytes?: number;
  name: string;
}

/** 禁用名单同时收原始路径与 realpath 别名：软链接指向同一文件也要挡住。 */
function blockedPathSet(paths: Iterable<string>): Set<string> {
  const blocked = new Set<string>();
  for (const entry of paths) {
    const canonical = resolve(entry);
    blocked.add(canonical);
    const real = realpathSync(canonical, { throwIfNoEntry: false });
    if (real !== undefined && real !== canonical) blocked.add(real);
  }
  return blocked;
}

/** 按名或限定名找技能；找不到返回 undefined，由调用方决定如何报错。 */
function matchSkill(skills: readonly SkillMetadata[], wanted: string): SkillMetadata | undefined {
  for (const skill of skills) {
    if (skill.name === wanted || skill.qualifiedName === wanted) return skill;
  }
  return undefined;
}

export class NodeSkillAdapter implements SkillPort {
  private readonly rootOptions: NodeSkillAdapterOptions;
  private readonly blocked: Set<string>;
  private readonly pluginNameCache = new Map<string, Promise<string | undefined>>();

  constructor(overrides: NodeSkillAdapterOptions = {}) {
    this.rootOptions = overrides;
    this.blocked = blockedPathSet(overrides.disabledPaths ?? []);
  }

  private context(runtime?: SkillOperationOptions): DiscoveryContext {
    const context = {} as DiscoveryContext;
    context.blocked = this.blocked;
    context.options = runtime;
    context.pluginNameCache = this.pluginNameCache;
    context.rootOptions = this.rootOptions;
    return context;
  }

  async discoverSkills(
    ask: SkillRequest,
    options?: SkillOperationOptions,
  ): Promise<SkillLoadOutcome> {
    return await discoverSkillCatalog(ask, this.context(options));
  }

  async loadSkill(ask: LoadSkillRequest, options?: SkillOperationOptions): Promise<SkillContent> {
    const outcome = await this.discoverSkills(
      { roots: ask.roots, workingDirectory: ask.workingDirectory },
      options,
    );
    return await loadSkillContent(
      matchSkill(outcome.skills, ask.name) as never,
      ask.name,
      ask.maxBytes,
    );
  }
}

export function createNodeSkillAdapter(overrides: NodeSkillAdapterOptions = {}): NodeSkillAdapter {
  return new NodeSkillAdapter(overrides);
}
