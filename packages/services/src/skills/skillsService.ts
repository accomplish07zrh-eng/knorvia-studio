import { appendFile, cp, mkdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { SKILL_FILE_NAME } from "@knorvia/shared";
import type { SkillSummary, SkillsCapability } from "@knorvia/shared";
import { getKnorviaDataRootDir } from "#src/paths.js";
import type { ISkillsService } from "./skills.js";
import { discoverSkills } from "./skillDiscovery.js";
import {
  exists,
  getUserAgentsRoot,
  getUserCommonRoot,
  getWorkspaceCommonRoot,
  getWorkspaceSkillRoots,
  normalizedPath,
  readEnabledMap,
  writeEnabledMap,
} from "./skillLocations.js";

function capability(options: { isDesktopRuntime?: boolean } | undefined): SkillsCapability {
  return (options?.isDesktopRuntime ?? Boolean(process.env.KNORVIA_PROCESS_LABEL))
    ? { userScopeAvailable: true }
    : { userScopeAvailable: false, userScopeReason: "desktop_only" };
}

function findSkill(skills: SkillSummary[], skillId: string): SkillSummary {
  const skill = skills.find((candidate) => candidate.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  return skill;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function appendAudit(
  params: { workspacePath: string; workspaceIdentity?: string },
  activatedSkillNames: string[],
): Promise<void> {
  await mkdir(join(getKnorviaDataRootDir(), "v2"), { recursive: true });
  await appendFile(
    join(getKnorviaDataRootDir(), "v2", "skills-audit.log"),
    `${JSON.stringify({
      createdAt: Date.now(),
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity ?? null,
      activatedSkillNames,
    })}\n`,
    "utf-8",
  );
}

export function createSkillsService(options?: { isDesktopRuntime?: boolean }): ISkillsService {
  let writeQueue = Promise.resolve();
  const service: ISkillsService = {
    async list(params) {
      const currentCapability = capability(options);
      const result = await discoverSkills(
        params.workspacePath,
        currentCapability.userScopeAvailable,
      );
      const enabled = await readEnabledMap();
      return {
        skills: result.skills.map((skill) => ({
          ...skill,
          enabled: enabled[normalizedPath(skill.path)] ?? true,
        })),
        capability: currentCapability,
        diagnostics: result.diagnostics,
      };
    },

    async setEnabled(params) {
      const task = async () => {
        const result = await discoverSkills(
          params.workspacePath,
          capability(options).userScopeAvailable,
        );
        const skill = findSkill(result.skills, params.skillId);
        const enabled = await readEnabledMap();
        enabled[normalizedPath(skill.path)] = params.enabled;
        await writeEnabledMap(enabled);
      };
      const queued = writeQueue.then(task, task);
      writeQueue = queued.catch(() => {});
      await queued;
    },

    async buildPromptContext(params) {
      const mentions = new Set<string>();
      for (const match of params.prompt.matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
        if (match[1]) mentions.add(match[1]);
      }
      if (!mentions.size) return { prompt: params.prompt, activatedSkillNames: [] };
      const result = await this.list({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: params.provider,
      });
      const activated = result.skills.filter((skill) => skill.enabled && mentions.has(skill.name));
      if (!activated.length) return { prompt: params.prompt, activatedSkillNames: [] };
      const activatedSkillNames = activated.map((skill) => skill.name);
      await appendAudit(params, activatedSkillNames);
      const lines = ["<available_skills>"];
      for (const skill of activated) {
        lines.push(
          `<activated_skill name="${escapeAttribute(skill.name)}" path="${escapeAttribute(skill.path)}">`,
          skill.body,
          "</activated_skill>",
        );
      }
      lines.push("</available_skills>");
      return { prompt: `${params.prompt}\n\n${lines.join("\n")}`, activatedSkillNames };
    },

    async copyToCommon(params) {
      const result = await this.list({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
      });
      const skill = findSkill(result.skills, params.skillId);
      const source = dirname(skill.path);
      const root =
        skill.scope === "workspace"
          ? getWorkspaceCommonRoot(params.workspacePath)
          : getUserCommonRoot();
      const folder = basename(source);
      const target = join(root, folder);
      if (await exists(target)) throw new Error(`通用目录已存在同名技能: ${folder}`);
      await mkdir(root, { recursive: true });
      await cp(source, target, { recursive: true });
      return { newPath: join(target, SKILL_FILE_NAME) };
    },

    async removeFromCommon(params) {
      const result = await this.list({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
      });
      const skill = findSkill(result.skills, params.skillId);
      const path = normalizedPath(skill.path).toLowerCase();
      const roots = [getUserCommonRoot(), getWorkspaceCommonRoot(params.workspacePath)];
      if (!roots.some((root) => path.includes(`${normalizedPath(root).toLowerCase()}/`))) {
        throw new Error("该技能不在通用目录中");
      }
      await rm(dirname(skill.path), { recursive: true, force: true });
    },

    async deleteSkill(params) {
      const result = await this.list({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
      });
      const skill = findSkill(result.skills, params.skillId);
      if (skill.scope === "plugin") throw new Error("插件提供的技能不可单独删除，请卸载对应插件");
      const skillDirectory = dirname(skill.sourcePath ?? skill.path);
      const leaf = basename(skillDirectory);
      // 删除边界只规范化父目录，保留叶子软链本体，避免删除链接指向的技能目录。
      const parent = await realpath(dirname(skillDirectory)).catch(() => null);
      if (parent === null) throw new Error(`该技能不可删除: ${skill.path}`);
      const roots = [
        ...(await getWorkspaceSkillRoots(params.workspacePath)),
        getUserCommonRoot(),
        getUserAgentsRoot(),
      ];
      let allowed = false;
      for (const root of roots) {
        const canonicalRoot = await realpath(root).catch(() => root);
        const distance = relative(canonicalRoot, parent);
        if (distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))) {
          allowed = true;
          break;
        }
      }
      if (!allowed) throw new Error(`该技能不可删除: ${skill.path}`);
      await rm(join(parent, leaf), { recursive: true, force: true });
    },
  };
  return service;
}
