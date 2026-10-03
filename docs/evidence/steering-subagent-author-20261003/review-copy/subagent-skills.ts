import { createCoreError, CoreErrorType } from "../deps.js";
import type { ExploreSubagentRuntimeRequest, SkillOperationOptions, SkillPort } from "../deps.js";
import {
  SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE,
  SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE,
  type OfficialCuaPolicy,
} from "../../subagent/computer-use-policy.js";

type LoadRequest = Parameters<SkillPort["loadSkill"]>[0];

async function isUniqueOfficialSkill(
  parent: SkillPort,
  policy: OfficialCuaPolicy,
  request: LoadRequest,
  options?: SkillOperationOptions,
): Promise<boolean> {
  if (request.name.includes(":")) return false;
  const outcome = await parent.discoverSkills(
    { workingDirectory: request.workingDirectory, roots: request.roots, trace: request.trace },
    options,
  );
  const matches = outcome.skills.filter(
    (skill) => skill.name === request.name || skill.qualifiedName === request.name,
  );
  return matches.length === 1 && policy.isOfficialSkill(matches[0]);
}

async function resolveAllowedSkillName(
  port: SkillPort,
  allowed: Set<string> | undefined,
  request: LoadRequest,
  options?: SkillOperationOptions,
): Promise<string | undefined> {
  const outcome = await port.discoverSkills(
    { workingDirectory: request.workingDirectory, roots: request.roots, trace: request.trace },
    options,
  );
  const matching = outcome.skills.filter(
    (skill) => skill.name === request.name || skill.qualifiedName === request.name,
  );
  if (matching.length > 1) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      "Skill name is ambiguous for subagent; use the fully qualified skill name",
      {
        context: {
          allowedSkills: allowed ? [...allowed] : [],
          matchingSkills: matching.map((skill) => skill.qualifiedName ?? skill.name),
          skill: request.name,
          toolName: "Skill",
        },
        recoverable: true,
      },
    );
  }
  if (matching.length === 0) return undefined;
  return matching[0].qualifiedName ?? matching[0].name;
}

export function createChildSkillPort(
  parent: SkillPort | undefined,
  skills: readonly string[] | undefined,
  policy: OfficialCuaPolicy,
): SkillPort | undefined {
  if (!parent) return parent;
  return new ChildSkills(parent, skills && skills.length > 0 ? new Set(skills) : undefined, policy);
}

class ChildSkills implements SkillPort {
  constructor(
    private readonly parent: SkillPort,
    private readonly allowedSkills: Set<string> | undefined,
    private readonly cuaPolicy: OfficialCuaPolicy,
  ) {}

  async discoverSkills(
    request: Parameters<SkillPort["discoverSkills"]>[0],
    options?: SkillOperationOptions,
  ): Promise<Awaited<ReturnType<SkillPort["discoverSkills"]>>> {
    const outcome = await this.parent.discoverSkills(request, options);
    const skills = outcome.skills.filter(
      (skill) =>
        !this.cuaPolicy.isOfficialSkill(skill) &&
        (this.allowedSkills === undefined ||
          this.allowedSkills.has(skill.name) ||
          (skill.qualifiedName !== undefined && this.allowedSkills.has(skill.qualifiedName))),
    );
    return { ...outcome, skills, totalDiscovered: skills.length };
  }

  async loadSkill(
    request: LoadRequest,
    options?: SkillOperationOptions,
  ): Promise<Awaited<ReturnType<SkillPort["loadSkill"]>>> {
    if (
      this.cuaPolicy.isOfficialSkillRequest(request.name) ||
      (await isUniqueOfficialSkill(this.parent, this.cuaPolicy, request, options))
    ) {
      throw createCoreError(
        CoreErrorType.ToolExecutionFailed,
        SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE,
        {
          context: {
            code: SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE,
            skill: request.name,
            toolName: "Skill",
          },
          recoverable: true,
        },
      );
    }
    const resolved = await resolveAllowedSkillName(this, this.allowedSkills, request, options);
    if (!resolved)
      throw createCoreError(
        CoreErrorType.ToolExecutionFailed,
        "Skill is not allowed for subagent",
        {
          context: {
            allowedSkills: this.allowedSkills ? [...this.allowedSkills] : [],
            skill: request.name,
            toolName: "Skill",
          },
          recoverable: true,
        },
      );
    return this.parent.loadSkill({ ...request, name: resolved }, options);
  }
}

export async function validateChildComputerUse(
  request: ExploreSubagentRuntimeRequest,
  parentSkillPort: SkillPort | undefined,
  policy: OfficialCuaPolicy,
): Promise<void> {
  const explicitServer = request.profile.mcpServers?.find((name) =>
    policy.serverNames.has(name.trim()),
  );
  const explicitTool = request.allowedTools.find(
    (name) => policy.isOfficialToolRequest(name) || policy.isOfficialServerSelector(name),
  );
  let explicitSkill = request.profile.skills?.find((name) => policy.isOfficialSkillRequest(name));
  if (!explicitSkill && parentSkillPort && request.profile.skills?.length) {
    try {
      const outcome = await parentSkillPort.discoverSkills({
        workingDirectory: request.workingDirectory,
        trace: request.traceContext,
      });
      explicitSkill = request.profile.skills?.find((name) => {
        if (name.includes(":")) return false;
        const matching = outcome.skills.filter(
          (skill) => skill.name === name || skill.qualifiedName === name,
        );
        return (
          matching.length === 1 && matching[0] !== undefined && policy.isOfficialSkill(matching[0])
        );
      });
    } catch {
      // 元数据识别仍在原有惰性发现的捕获边界内，失败由后续 Skill 调用处理。
    }
  }
  if (!explicitServer && !explicitTool && !explicitSkill) return;
  throw createCoreError(
    CoreErrorType.ConfigurationError,
    SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE,
    {
      context: {
        agentType: request.agentType,
        code: SUBAGENT_COMPUTER_USE_UNAVAILABLE_CODE,
        ...(explicitServer ? { mcpServer: explicitServer } : {}),
        ...(explicitTool ? { mcpTool: explicitTool } : {}),
        ...(explicitSkill ? { skill: explicitSkill } : {}),
      },
      recoverable: true,
    },
  );
}
