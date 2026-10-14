// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Skills section：没有 skill 就不出段；有则把列表注入 meta user。渲染规则见 skills-core。
import type { ContextSection } from "../types.js";
import { contextSectionFromText } from "./section-core.js";
import {
  renderSkillsList,
  skillsMetadataBudget,
  type SkillsSectionOptions,
} from "./skills-core.js";

export const buildSkillsSection = (options: SkillsSectionOptions): ContextSection | null => {
  const skills = options.outcome.skills;
  if (skills.length === 0) return null;
  const content = renderSkillsList(skills, skillsMetadataBudget(options.metadataBudget));
  return contextSectionFromText("Skills", "skills", "meta_user", "dynamic", content);
};
