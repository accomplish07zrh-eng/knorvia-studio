/**
 * CLI 模型配置切换（specs/knorvia-cli-provider-switch.md）。
 * 只描述 Host 与界面之间的数据；读写 CLI 配置文件的唯一所有者是 services 中的切换服务。
 */

export const CLI_PROVIDER_SWITCH_TARGETS = ["claude-code", "codex", "grok-build"] as const;
export type CliProviderSwitchTarget = (typeof CLI_PROVIDER_SWITCH_TARGETS)[number];

export function isCliProviderSwitchTarget(value: unknown): value is CliProviderSwitchTarget {
  return CLI_PROVIDER_SWITCH_TARGETS.some((item) => item === value);
}

/** Knorvia 模型供应商的协议，与 provider 配置的 `api.type` 一致。 */
export type CliProviderSwitchApiType =
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses";

export interface CliProviderSwitchCandidate {
  providerId: string;
  providerName: string;
  modelId: string;
  apiType: CliProviderSwitchApiType;
}

/**
 * - `official`：没有任何由切换器管理的字段，CLI 使用自身登录。
 * - `knorvia`：当前字段与 Studio 上次写入的完全一致。
 * - `external`：字段被手动或其他工具（如 CC Switch）改过，接管前需用户确认。
 * - `unreadable`：配置文件无法解析，Studio 不会重写它。
 */
export type CliProviderSwitchState = "official" | "knorvia" | "external" | "unreadable";

export interface CliProviderSwitchActive {
  providerId: string;
  providerName: string;
  modelId: string;
  appliedAt: number;
  /** 供应商的地址、密钥、协议或该模型已变化或被删除，需要重新应用。 */
  stale: boolean;
}

export interface CliProviderSwitchStatus {
  cli: CliProviderSwitchTarget;
  configPath: string;
  state: CliProviderSwitchState;
  active?: CliProviderSwitchActive;
  /** 可安全展示的原因，不含密钥。 */
  error?: string;
}

export interface CliProviderSwitchView {
  statuses: CliProviderSwitchStatus[];
  /** 每个 CLI 可选的模型；协议不匹配的模型不在列表中。 */
  candidates: Record<CliProviderSwitchTarget, CliProviderSwitchCandidate[]>;
}

export type CliProviderSwitchTargetChoice =
  | { kind: "official" }
  | { kind: "provider"; providerId: string; modelId: string };

export interface CliProviderSwitchApplyRequest {
  cli: CliProviderSwitchTarget;
  target: CliProviderSwitchTargetChoice;
  /** 当前状态为 `external` 时，用户确认接管才可写入。 */
  takeOver?: boolean;
}

export interface CliProviderSwitchApplyResult {
  status: CliProviderSwitchStatus;
  /** 切换只对新开的会话生效；从第三方切回官方时 Claude Code 运行中的会话必须重启。 */
  restartRequired: "new-sessions" | "restart-running";
}

/** 每个 CLI 接受的 Knorvia 协议。 */
export const CLI_PROVIDER_SWITCH_PROTOCOLS: Record<
  CliProviderSwitchTarget,
  readonly CliProviderSwitchApiType[]
> = {
  "claude-code": ["anthropic-messages"],
  codex: ["openai-responses"],
  "grok-build": ["openai-chat-completions", "openai-responses", "anthropic-messages"],
};
