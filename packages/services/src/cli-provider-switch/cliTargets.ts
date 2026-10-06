import { join } from "node:path";
import type { CliProviderSwitchApiType, CliProviderSwitchTarget } from "@knorvia/shared";
import { parseToml, patchToml, type TomlEdit } from "./tomlPatch.js";

/**
 * 每个 CLI 由切换器管理的字段（specs/knorvia-cli-provider-switch.md）。
 * 只读写这些字段，其余内容原样保留；官方登录凭据文件从不读取。
 */

export interface CliConnection {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  apiType: CliProviderSwitchApiType;
  label: string;
}

/** 切到 Knorvia 模型前用户自己设置的模型类字段；切回官方时还原，`null` 表示原本不存在。 */
export type CliRestoreSnapshot = Record<string, string | null>;

export interface CliInspection {
  /** 当前文件是否在把请求路由到第三方（无论是谁写的）。 */
  routing: boolean;
  /** 切换器管理的全部字段的当前值，用于判断是否仍是 Studio 写入的内容。 */
  owned: unknown;
  /** 若此刻从官方切走，需要记录以便还原的用户字段。 */
  restore: CliRestoreSnapshot;
}

export interface CliTargetAdapter {
  configPath(env: NodeJS.ProcessEnv, home: string): string;
  inspect(text: string): CliInspection;
  toKnorvia(text: string, connection: CliConnection): string;
  toOfficial(text: string, restore: CliRestoreSnapshot, takeOver: boolean): string;
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
function stripSuffix(url: string, suffixes: readonly string[]): string {
  let result = trimSlash(url);
  for (const suffix of suffixes)
    if (result.toLowerCase().endsWith(suffix)) {
      result = trimSlash(result.slice(0, -suffix.length));
      break;
    }
  return result;
}
/** Claude Code 与 Anthropic SDK 自行追加 `/v1/messages`，因此去掉 Knorvia 地址里可能带的 `/v1`。 */
function anthropicRoot(url: string): string {
  return stripSuffix(stripSuffix(url, ["/v1/messages", "/messages"]), ["/v1"]);
}
function homeDir(env: NodeJS.ProcessEnv, name: string, home: string, fallback: string): string {
  return env[name]?.trim() || join(home, fallback);
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------- Claude Code (JSON)

const CLAUDE_ROUTING = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] as const;
const CLAUDE_MODELS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
] as const;

export class CliConfigParseError extends Error {}

function parseClaude(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new CliConfigParseError("settings.json 不是有效的 JSON 对象，Studio 未改动它");
  }
}
function writeClaude(settings: Record<string, unknown>, env: Record<string, unknown>): string {
  const next = { ...settings };
  if (Object.keys(env).length) next.env = env;
  else delete next.env;
  return `${JSON.stringify(next, null, 2)}\n`;
}

const claude: CliTargetAdapter = {
  configPath: (env, home) =>
    join(homeDir(env, "CLAUDE_CONFIG_DIR", home, ".claude"), "settings.json"),
  inspect(text) {
    const env = record(parseClaude(text).env);
    const owned = Object.fromEntries(
      [...CLAUDE_ROUTING, ...CLAUDE_MODELS].map((key) => [key, stringOrNull(env[key])]),
    );
    return {
      routing: CLAUDE_ROUTING.some((key) => typeof env[key] === "string" && env[key] !== ""),
      owned,
      restore: Object.fromEntries(CLAUDE_MODELS.map((key) => [key, stringOrNull(env[key])])),
    };
  },
  toKnorvia(text, connection) {
    const settings = parseClaude(text);
    const env = { ...record(settings.env) };
    delete env.ANTHROPIC_API_KEY; // AUTH_TOKEN 不触发交互式确认，且两者同时存在时语义不清。
    env.ANTHROPIC_BASE_URL = anthropicRoot(connection.baseUrl);
    env.ANTHROPIC_AUTH_TOKEN = connection.apiKey;
    for (const key of CLAUDE_MODELS) env[key] = connection.modelId;
    return writeClaude(settings, env);
  },
  toOfficial(text, restore) {
    const settings = parseClaude(text);
    const env = { ...record(settings.env) };
    for (const key of CLAUDE_ROUTING) delete env[key];
    for (const key of CLAUDE_MODELS) {
      const previous = restore[key];
      if (typeof previous === "string") env[key] = previous;
      else delete env[key];
    }
    return writeClaude(settings, env);
  },
};

// ---------------------------------------------------------------- Codex (TOML)

const CODEX_PROVIDER = "knorvia";

function parseTomlFile(text: string): Record<string, unknown> {
  try {
    return parseToml(text);
  } catch (error) {
    throw new CliConfigParseError(error instanceof Error ? error.message : String(error));
  }
}
function restoreTop(key: string, previous: string | null | undefined, ours: string): TomlEdit {
  return typeof previous === "string" && previous !== ours
    ? { op: "set-top", key, value: previous }
    : { op: "remove-top", key };
}

const codex: CliTargetAdapter = {
  configPath: (env, home) => join(homeDir(env, "CODEX_HOME", home, ".codex"), "config.toml"),
  inspect(text) {
    const tree = parseTomlFile(text);
    const provider = stringOrNull(tree.model_provider);
    return {
      routing:
        (provider !== null && provider !== "openai") ||
        typeof tree.openai_base_url === "string" ||
        CODEX_PROVIDER in record(tree.model_providers),
      owned: {
        model_provider: provider,
        model: stringOrNull(tree.model),
        table: record(tree.model_providers)[CODEX_PROVIDER] ?? null,
      },
      restore: { model: stringOrNull(tree.model), model_provider: provider },
    };
  },
  toKnorvia(text, connection) {
    return patchToml(text, [
      {
        op: "replace-table",
        header: `model_providers.${CODEX_PROVIDER}`,
        entries: {
          name: connection.label,
          base_url: stripSuffix(connection.baseUrl, ["/responses"]),
          // Codex 已移除 Chat Completions；`wire_api = "chat"` 会导致配置加载失败。
          wire_api: "responses",
          experimental_bearer_token: connection.apiKey,
          // 为 true 时 Codex 可能把官方 ChatGPT 登录凭据发往第三方地址。
          requires_openai_auth: false,
        },
      },
      { op: "set-top", key: "model_provider", value: CODEX_PROVIDER },
      { op: "set-top", key: "model", value: connection.modelId },
    ]);
  },
  toOfficial(text, restore, takeOver) {
    const edits: TomlEdit[] = [
      { op: "remove-table", header: `model_providers.${CODEX_PROVIDER}` },
      restoreTop("model_provider", takeOver ? null : restore.model_provider, CODEX_PROVIDER),
      restoreTop("model", restore.model, ""),
    ];
    if (takeOver) edits.push({ op: "remove-top", key: "openai_base_url" });
    return patchToml(text, edits);
  },
};

// ---------------------------------------------------------------- Grok Build (TOML)

const GROK_MODEL = "knorvia";
const GROK_BACKEND: Record<CliProviderSwitchApiType, string> = {
  "openai-chat-completions": "chat_completions",
  "openai-responses": "responses",
  "anthropic-messages": "messages",
};
function grokBaseUrl(connection: CliConnection): string {
  switch (connection.apiType) {
    case "openai-chat-completions":
      return stripSuffix(connection.baseUrl, ["/chat/completions"]);
    case "openai-responses":
      return stripSuffix(connection.baseUrl, ["/responses"]);
    case "anthropic-messages":
      return anthropicRoot(connection.baseUrl);
  }
}

const grok: CliTargetAdapter = {
  configPath: (env, home) => join(homeDir(env, "GROK_HOME", home, ".grok"), "config.toml"),
  inspect(text) {
    const tree = parseTomlFile(text);
    const selected = stringOrNull(record(tree.models).default);
    const custom = record(tree.model);
    return {
      routing: GROK_MODEL in custom || (selected !== null && selected in custom),
      owned: { default: selected, table: custom[GROK_MODEL] ?? null },
      restore: { default: selected },
    };
  },
  toKnorvia(text, connection) {
    return patchToml(text, [
      {
        op: "replace-table",
        header: `model.${GROK_MODEL}`,
        entries: {
          name: connection.label,
          model: connection.modelId,
          base_url: grokBaseUrl(connection),
          api_key: connection.apiKey,
          api_backend: GROK_BACKEND[connection.apiType],
        },
      },
      { op: "set-in-table", header: "models", key: "default", value: GROK_MODEL },
    ]);
  },
  toOfficial(text, restore, takeOver) {
    const previous = takeOver ? null : restore.default;
    return patchToml(text, [
      { op: "remove-table", header: `model.${GROK_MODEL}` },
      typeof previous === "string" && previous !== GROK_MODEL
        ? { op: "set-in-table", header: "models", key: "default", value: previous }
        : { op: "remove-in-table", header: "models", key: "default" },
    ]);
  },
};

export const CLI_TARGET_ADAPTERS: Record<CliProviderSwitchTarget, CliTargetAdapter> = {
  "claude-code": claude,
  codex,
  "grok-build": grok,
};
