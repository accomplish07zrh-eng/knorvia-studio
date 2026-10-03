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
  profile: ExploreSubagentRuntimeRequest["profile"],
  policy: OfficialCuaPolicy,
): SkillPort | undefined {
  if (!parent) return parent;
  const allowed = request.profile.skills?.length ? new Set(request.profile.skills) : undefined;
  const port: SkillPort = {
    async discoverSkills(request, options) {
      const outcome = await parent.discoverSkills(request, options);
      const skills = outcome.skills.filter(
        (skill) =>
          !policy.isOfficialSkill(skill) &&
          (!allowed ||
            allowed.has(skill.name) ||
            (skill.qualifiedName !== undefined && allowed.has(skill.qualifiedName))),
      );
      return { ...outcome, skills, totalDiscovered: skills.length };
    },
    async loadSkill(request, options) {
      if (
        policy.isOfficialSkillRequest(request.name) ||
        (await isUniqueOfficialSkill(parent, policy, request, options))
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
      const resolved = await resolveAllowedSkillName(port, allowed, request, options);
      if (!resolved) {
        throw createCoreError(
          CoreErrorType.ToolExecutionFailed,
          "Skill is not allowed for subagent",
          {
            context: {
              allowedSkills: allowed ? [...allowed] : [],
              skill: request.name,
              toolName: "Skill",
            },
            recoverable: true,
          },
        );
      }
      return parent.loadSkill({ ...request, name: resolved }, options);
    },
  };
  return port;
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
      explicitSkill = request.request.profile.skills?.find((name) => {
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
