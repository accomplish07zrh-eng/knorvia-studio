import type { KnorviaProvider } from "@knorvia/shared";

type SkillSourceType = "knorvia" | "unknown";

function resolveSkillSourceType(skillPath: string): SkillSourceType {
  const normalized = skillPath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("/.knorvia-studio/skills/")) {
    return "knorvia";
  }
  if (normalized.includes("/.knorvia-studio/cli/plugins/cache/")) {
    return "knorvia";
  }
  return "unknown";
}

const SKILL_ID_PROVIDER_RE = /^knorvia:/;

function isKnorviaSkill(skill: { id?: string; path: string; scope?: string }): boolean {
  return (
    // plugin skill 的真实路径在 CLI plugin cache 下，不在 `.knorvia-studio/skills`。
    // 服务层已用 scope 标记来源，前端过滤时要放行，否则 `/` 和 `$` 面板会漏掉插件技能。
    skill.scope === "plugin" ||
    (typeof skill.id === "string" && SKILL_ID_PROVIDER_RE.test(skill.id)) ||
    resolveSkillSourceType(skill.path) === "knorvia"
  );
}

export function filterSkillsForProvider<T extends { path: string; id?: string; scope?: string }>(
  skills: T[],
  _legacyProvider: KnorviaProvider,
): T[] {
  return skills.filter(isKnorviaSkill);
}
