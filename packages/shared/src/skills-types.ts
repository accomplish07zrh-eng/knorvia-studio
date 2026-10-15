// SPDX-License-Identifier: Apache-2.0
// 技能（skill）清单与诊断类型（纯声明）。
const SKILL_SCOPE_TABLE = { workspace: "workspace", user: "user", plugin: "plugin" } as const;
export type SkillScope = (typeof SKILL_SCOPE_TABLE)[keyof typeof SKILL_SCOPE_TABLE];

export type SkillMetadata = {
  slug?: /* 发布 slug */ string;
  version?: /* 版本 */ string;
  ownerId?: /* 发布者 ID */ string;
  publishedAt?: /* 发布毫秒时间戳 */ number;
};

export type SkillSummary = {
  id: /* 技能标识 */ string;
  name: /* 技能名 */ string;
  description: /* 描述 */ string;
  body: /* 技能正文 */ string;
  path: /* 目标文件路径（软链已解析） */ string;
  /**
   * 发现阶段命中的原始 SKILL.md 路径（未经 realpath 解析）。
   * 软链导入的技能里 `path` 是 realpath 后的目标文件，`sourcePath` 才指向
   * `~/.knorvia-studio/skills/<name>` 下的链接本体；删除时必须用它才能只删链接不动目标。
   * 普通技能两者相同。
   */
  sourcePath?: string;
  scope: /* 作用域 */ SkillScope;
  enabled: /* 是否启用 */ boolean;
  // plugin scope 时为来源插件名；其它 scope 留空。
  pluginName?: string;
  // plugin scope 时为来源插件完整 ID（name@marketplace）；旧 payload 可缺省。
  pluginId?: string;
  metadata?: /* 发布元数据 */ SkillMetadata;
};

export type SkillsCapability = {
  userScopeAvailable: /* 是否有用户级目录 */ boolean;
  userScopeReason?: /* 缺席原因 */ "desktop_only";
};

const DIAGNOSTIC_SEVERITY_TABLE = { warning: "warning", error: "error" } as const;
export type SkillDiagnosticSeverity =
  (typeof DIAGNOSTIC_SEVERITY_TABLE)[keyof typeof DIAGNOSTIC_SEVERITY_TABLE];

const DIAGNOSTIC_CODE_TABLE = {
  skillRootNotFound: "skill_root_not_found",
  skillScanFailed: "skill_scan_failed",
  skillReadFailed: "skill_read_failed",
  skillMissingFrontmatter: "skill_missing_frontmatter",
  skillInvalidFrontmatter: "skill_invalid_frontmatter",
  skillMissingName: "skill_missing_name",
  skillInvalidName: "skill_invalid_name",
  skillMissingDescription: "skill_missing_description",
  skillDescriptionTooLong: "skill_description_too_long",
  skillUnknownFrontmatter: "skill_unknown_frontmatter",
  skillDuplicateName: "skill_duplicate_name",
  skillTooLarge: "skill_too_large",
  skillNotFound: "skill_not_found",
} as const;
// 与 cli `SkillDiagnosticCode` 同步。变动时一并改 apps/cli/packages/contracts/src/skills/index.ts。
export type SkillDiagnosticCode =
  (typeof DIAGNOSTIC_CODE_TABLE)[keyof typeof DIAGNOSTIC_CODE_TABLE];

export type SkillDiagnostic = {
  code: /* 诊断码 */ SkillDiagnosticCode;
  severity: /* 严重度 */ SkillDiagnosticSeverity;
  message: /* 可读描述 */ string;
  path?: /* 相关文件 */ string;
  skillName?: /* 相关技能名 */ string;
};

export type SkillsListResult = {
  skills: /* 技能列表 */ SkillSummary[];
  capability: /* 能力说明 */ SkillsCapability;
  diagnostics: /* 扫描诊断 */ SkillDiagnostic[];
};

export type SkillsPromptContext = {
  prompt: /* 提示词正文 */ string;
  activatedSkillNames: /* 已激活技能名 */ string[];
};
