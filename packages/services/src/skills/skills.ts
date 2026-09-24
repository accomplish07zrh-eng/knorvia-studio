import type { KnorviaProvider, SkillsPromptContext, SkillsListResult } from "@knorvia/shared";
import { ServiceChannels } from "@knorvia/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface ISkillsService {
  list(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
  }): Promise<SkillsListResult>;
  setEnabled(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
    scope?: "workspace" | "user" | "plugin";
    skillId: string;
    enabled: boolean;
  }): Promise<void>;
  buildPromptContext(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    provider?: KnorviaProvider;
    prompt: string;
  }): Promise<SkillsPromptContext>;
  /** 将指定 skill 复制到通用目录（.knorvia-studio/skills），成功后返回新 skill 的路径。 */
  copyToCommon(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    skillId: string;
  }): Promise<{ newPath: string }>;
  /** 从通用目录中移除指定 skill（仅当 skill 位于 .knorvia-studio/skills 时有效）。 */
  removeFromCommon(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    skillId: string;
  }): Promise<void>;
  /**
   * 删除本地技能（仅 workspace/user 作用域；plugin 作用域拒绝）。
   * 删除技能所在目录，仅允许命中 .knorvia-studio/skills 或 .agents/skills 根，越界则拒绝。
   */
  deleteSkill(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    skillId: string;
  }): Promise<void>;
}

export const ISkillsService = createServiceDescriptor<ISkillsService>(ServiceChannels.Skills);
