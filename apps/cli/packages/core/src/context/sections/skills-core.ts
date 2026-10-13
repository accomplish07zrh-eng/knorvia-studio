// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Skills 列表渲染：按显示名排序，先给「描述 + whenToUse」详表，超预算时退化成名字表。
import type { SkillLoadOutcome, SkillMetadata } from "@knorvia/contracts";

/** 公开入口的入参：技能加载结果与元数据预算。 */
export interface SkillsSectionOptions {
  outcome: SkillLoadOutcome;
  metadataBudget?: number;
}

const SKILL_LIST_INTRO = "The following skills are available for use with the Skill tool:";

const DEFAULT_METADATA_BUDGET = 20_000;

const MAX_DESCRIPTION_CHARS = 250;

const displayName = (skill: SkillMetadata): string => skill.qualifiedName ?? skill.name;

/** 别名后缀：合格名与短名不同时才补一句，方便按短名加载。 */
const aliasSuffix = (skill: SkillMetadata): string => {
  const alias = skill.qualifiedName;
  if (!alias || alias === skill.name) return "";
  return ` (also loadable as ${skill.name})`;
};

const detailedEntry = (skill: SkillMetadata): string => {
  const base = skill.whenToUse ? `${skill.description} - ${skill.whenToUse}` : skill.description;
  const text =
    base.length > MAX_DESCRIPTION_CHARS ? `${base.slice(0, MAX_DESCRIPTION_CHARS - 1)}...` : base;
  return `- ${displayName(skill)}: ${text}${aliasSuffix(skill)} (file: ${skill.path})`;
};

const nameEntry = (skill: SkillMetadata): string =>
  `- ${displayName(skill)}${aliasSuffix(skill)} (file: ${skill.path})`;

/** 详表放不下就换成名字表；两份都以 intro 加空行开头，条目按显示名排序。 */
export function renderSkillsList(skills: readonly SkillMetadata[], budget: number): string {
  const ordered = [...skills].sort((left, right) =>
    displayName(left).localeCompare(displayName(right)),
  );
  const detailed = [SKILL_LIST_INTRO, "", ordered.map(detailedEntry).join("\n")].join("\n");
  if (detailed.length <= budget) return detailed;
  return [SKILL_LIST_INTRO, "", ordered.map(nameEntry).join("\n")].join("\n");
}

export const skillsMetadataBudget = (budget: number | undefined): number =>
  budget ?? DEFAULT_METADATA_BUDGET;
