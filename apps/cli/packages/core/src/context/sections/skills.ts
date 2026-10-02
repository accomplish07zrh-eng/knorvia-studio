import type { SkillLoadOutcome, SkillMetadata } from "@knorvia/contracts";
import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

interface SkillsSectionOptions {
  outcome: SkillLoadOutcome;
  metadataBudget?: number;
}

const SKILLS_INTRO = "The following skills are available for use with the Skill tool:";
const DEFAULT_METADATA_BUDGET = 20000;
const DESCRIPTION_LIMIT = 250;

function displayName(skill: SkillMetadata): string {
  return skill.qualifiedName ?? skill.name;
}

function aliasSuffix(skill: SkillMetadata): string {
  return skill.qualifiedName && skill.qualifiedName !== skill.name
    ? ` (also loadable as ${skill.name})`
    : "";
}

function detailedEntry(skill: SkillMetadata): string {
  const description = skill.whenToUse
    ? `${skill.description} - ${skill.whenToUse}`
    : skill.description;
  const trimmed = description.length > DESCRIPTION_LIMIT
    ? `${description.slice(0, DESCRIPTION_LIMIT - 1)}...`
    : description;
  return `- ${displayName(skill)}: ${trimmed}${aliasSuffix(skill)} (file: ${skill.path})`;
}

function nameEntry(skill: SkillMetadata): string {
  return `- ${displayName(skill)}${aliasSuffix(skill)} (file: ${skill.path})`;
}

function renderMetadata(skills: SkillMetadata[], budget: number): string {
  const ordered = [...skills].sort((left, right) =>
    displayName(left).localeCompare(displayName(right))
  );
  const full = [SKILLS_INTRO, "", ...ordered.map(detailedEntry)].join("\n");
  if (full.length <= budget) {
    return full;
  }
  return [SKILLS_INTRO, "", ...ordered.map(nameEntry)].join("\n");
}

export function buildSkillsSection(options: SkillsSectionOptions): ContextSection | null {
  if (options.outcome.skills.length === 0) {
    return null;
  }

  const content = renderMetadata(
    options.outcome.skills,
    options.metadataBudget ?? DEFAULT_METADATA_BUDGET
  );
  return {
    name: "Skills",
    source: "skills",
    injectionTarget: "meta_user",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
