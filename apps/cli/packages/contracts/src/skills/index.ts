// SPDX-License-Identifier: Apache-2.0
// 技能（skill）域的公开类型面：只声明类型与端口，不引入任何运行时值——
// 入口命名空间必须保持为空，否则 `./skills` 与包根的运行时表面会变化。
// 这些形状由合同 B6 的编译期用例冻结：放宽字段或联合取值都会让用例编译失败。

// ---- 取值域 ----

export type SkillScope = "project" | "user" | "system" | "admin";

export type SkillSource = "agents" | "knorvia" | "bundled" | "plugin" | "remote";

export type SkillDiagnosticSeverity = "warning" | "error";

export type SkillDiagnosticCode =
  | "skill_root_not_found"
  | "skill_scan_failed"
  | "skill_read_failed"
  | "skill_missing_frontmatter"
  | "skill_invalid_frontmatter"
  | "skill_missing_name"
  | "skill_invalid_name"
  | "skill_missing_description"
  | "skill_description_too_long"
  | "skill_unknown_frontmatter"
  | "skill_duplicate_name"
  | "skill_too_large"
  | "skill_not_found";

// ---- 发现与加载 ----

export interface SkillRoot {
  path: string;
  scope: SkillScope;
  source: SkillSource;
  priority: number;
  // 所属 plugin 的完整 id；只有 plugin root 会带这个字段。
  pluginId?: string;
}

export interface SkillPolicy {
  allowImplicitInvocation?: boolean;
}

export interface SkillMetadata {
  name: string;
  description: string;
  whenToUse?: string;
  pluginName?: string;
  // 所属 plugin 的完整 id；非 plugin skill 不设置。
  pluginId?: string;
  qualifiedName?: string;
  path: string;
  directory: string;
  rootPath: string;
  scope: SkillScope;
  source: SkillSource;
  safeToAutoLoad: boolean;
  frontmatterKeys: string[];
  policy?: SkillPolicy;
}

// Skill tool 结果里允许跨边界传播的最小元数据：不含正文，也不含 description。
export interface SkillTelemetryMetadata {
  qualifiedName?: string;
  pluginId?: string;
  source?: SkillSource;
}

export interface SkillDiagnostic {
  code: SkillDiagnosticCode;
  severity: SkillDiagnosticSeverity;
  message: string;
  path?: string;
  skillName?: string;
}

export interface SkillLoadOutcome {
  skills: SkillMetadata[];
  diagnostics: SkillDiagnostic[];
  totalDiscovered: number;
}

export interface SkillContent {
  metadata: SkillMetadata;
  content: string;
  baseDirectory: string;
  bytesRead: number;
  sizeBytes: number;
  truncated: boolean;
}

export interface SkillDiscoverRequest {
  workingDirectory: string;
  roots?: SkillRoot[];
  trace?: import("../tracing/tracer.js").TraceContext;
}

export interface SkillLoadRequest {
  name: string;
  workingDirectory: string;
  roots?: SkillRoot[];
  maxBytes?: number;
  trace?: import("../tracing/tracer.js").TraceContext;
}

export interface SkillOperationOptions {
  signal?: AbortSignal;
  context?: import("../tracing/tracer.js").ExecutionContext;
}

// ---- 端口与配置 ----

export interface SkillPort {
  discoverSkills(
    request: SkillDiscoverRequest,
    options?: SkillOperationOptions,
  ): Promise<SkillLoadOutcome>;
  loadSkill(request: SkillLoadRequest, options?: SkillOperationOptions): Promise<SkillContent>;
}

export interface SkillConfig {
  enabled: boolean;
  includeInstructions: boolean;
  metadataBudget: number;
  roots: string[];
}
