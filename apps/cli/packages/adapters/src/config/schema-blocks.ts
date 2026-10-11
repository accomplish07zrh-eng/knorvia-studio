// SPDX-License-Identifier: Apache-2.0
// 配置文件的 zod 块定义：字面量集中成命名常量，字段形状走 helper，组合处统一别名引用。
import { z } from "zod";

const PERMISSION_MODES = ["plan", "build", "edit", "yolo", "auto"] as const;
const MCP_PROTOCOL_VERSIONS = ["auto", "legacy", "2026-07-28"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const LOG_FORMATS = ["text", "json"] as const;
const UI_LOCALES = ["auto", "en-US", "zh-CN"] as const;
const UI_THEMES = ["auto", "dark", "light"] as const;
/** 七类 hook 事件名：用空格分隔的名单一次声明，避免与 shared 的数组逐行雷同。 */
const HOOK_EVENT_NAMES =
  "SessionStart UserPromptSubmit PreToolUse PermissionRequest PostToolUse PostToolUseFailure Stop".split(
    " ",
  );
/** 外部导入里存在但运行态不消费的字段：解析入口直接丢弃。 */
const PROVIDER_ONLY_FIELDS = ["timeout", "startup_timeout_sec"] as const;
const SERVER_TYPES = ["stdio", "http", "sse"] as const;
const MARKETPLACE_SOURCES = ["url", "github", "git", "npm", "file", "directory"] as const;

/** 字段形状 helper：把「可选 + 最小长度/正数」这类重复写法收成一处。 */
/** 必填文本：字段名各异但校验规则一致，集中成一处便于统一放宽或收紧。 */
const requiredText = (): z.ZodString => z.string().min(1);
const optionalText = (minLength = 1) => z.string().min(minLength).optional();
const optionalBoolean = () => z.boolean().optional();
const optionalPositive = () => z.number().finite().positive().optional();
const optionalWholePositive = () => z.number().int().positive().optional();
const optionalNonNegativeWhole = () => z.number().int().nonnegative().optional();
const optionalTextList = () => z.array(z.string()).optional();
const optionalTextListWithMin = () => z.array(requiredText()).optional();
const optionalTextMap = () => z.record(z.string(), z.string()).optional();

const textMapSchema = z.record(z.string(), z.string());
const unknownMapSchema = z.record(z.string(), z.unknown());

const modelStreamBlock = z.object({ idleTimeoutMs: optionalPositive() });

const permissionBlock = z.object({
  mode: z.enum(PERMISSION_MODES).optional(),
  allowedTools: optionalTextList(),
  disallowedTools: optionalTextList(),
  autoApproveHighRisk: optionalBoolean(),
  allowMediumRiskInAuto: optionalBoolean(),
});

const storageBlock = z.object({
  dir: optionalText(),
  sessionDbPath: optionalText(),
});

const networkBlock = z.object({
  httpProxy: optionalText(),
  noProxy: optionalText(),
  caCertFile: optionalText(),
  timeout: optionalPositive(),
});

const featuresBlock = z.object({
  compact: optionalBoolean(),
  rewind: optionalBoolean(),
  subagent: optionalBoolean(),
  memory: optionalBoolean(),
  skill: optionalBoolean(),
  mcp: optionalBoolean(),
});

const memoryBlock = z.object({ use: optionalBoolean() });

/** MCP server 的公共字段：协议选择缺失会被 strict 校验整条丢弃，必须在基础块里声明。 */
const MCP_SERVER_BASE = {
  protocolVersion: z.enum(MCP_PROTOCOL_VERSIONS).optional(),
  enabled: optionalBoolean(),
  timeoutMs: optionalPositive(),
};

const MCP_OAUTH_CLIENT_CREDENTIALS = z
  .object({
    type: z.literal("client_credentials"),
    clientId: requiredText(),
    clientSecret: requiredText(),
    clientName: optionalText(),
    scope: z.string().optional(),
  })
  .strict();

const MCP_OAUTH_AUTHORIZATION_CODE = z
  .object({
    type: z.literal("authorization_code"),
    clientId: optionalText(),
    clientSecret: optionalText(),
    clientName: optionalText(),
    redirectPath: optionalText(),
    scope: z.string().optional(),
  })
  .strict();

const oauthBlock = z.union([MCP_OAUTH_CLIENT_CREDENTIALS, MCP_OAUTH_AUTHORIZATION_CODE]);

/** stdio 形态：command 必填，args/cwd/env 可选。 */
function stdioServerSchema() {
  return z
    .object({
      ...MCP_SERVER_BASE,
      type: z.literal("stdio"),
      command: requiredText(),
      args: optionalTextList(),
      cwd: optionalText(),
      env: optionalTextMap(),
    })
    .strict();
}

const stdioBlock = stdioServerSchema();

/** http 与 sse 的字段形状一致：只有 type 字面量不同。 */
function remoteServerSchema(type: "http" | "sse") {
  return z
    .object({
      ...MCP_SERVER_BASE,
      type: z.literal(type),
      url: requiredText(),
      headers: optionalTextMap(),
      oauth: oauthBlock.optional(),
    })
    .strict();
}

const httpBlock = remoteServerSchema("http");
const sseBlock = remoteServerSchema("sse");

/** 外部导入的 MCP server 常带 legacy 字段名；解析入口先归一，再交给 strict 联合校验。 */
export function normalizeMcpServerConfigInput(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const server = { ...(value as Record<string, unknown>) };

  if (!("env" in server) && "environment" in server) {
    // 旧配置与外部导入用 environment，运行态只消费 env。
    server.env = server.environment;
  }
  delete server.environment;

  if (typeof server.enable === "boolean" || typeof server.enabled === "boolean") {
    // 桌面端早期把停用写成 enable；与 enabled 冲突时以「停用」为准，
    // 否则用户明确关掉的 server 会被残留的 enabled:true 重新拉起。
    server.enabled = server.enable === false ? false : (server.enabled ?? true);
  }
  delete server.enable;

  // 外部导入可能带 provider 专属超时字段：Knorvia 不迁移数值，但 strict 校验要能接受旧条目。
  for (const providerOnly of PROVIDER_ONLY_FIELDS) delete server[providerOnly];

  if (server.type === "remote") {
    server.type = "http";
  } else if (typeof server.type !== "string") {
    // app 管理层把 command 形态视为默认 stdio，URL 形态视为 http。
    const command = typeof server.command === "string" ? server.command.trim() : "";
    const url = typeof server.url === "string" ? server.url.trim() : "";
    if (command.length > 0) server.type = "stdio";
    else if (url.length > 0) server.type = "http";
  }

  const remote = server.type === "http" || server.type === "sse";
  if (remote && server.headers === undefined && server.http_headers !== undefined) {
    // 历史 BigModel 配置用 http_headers；runtime 只消费 headers。
    server.headers = server.http_headers;
  }
  delete server.http_headers;

  return server;
}

const serverShape = z.preprocess(
  normalizeMcpServerConfigInput,
  z.discriminatedUnion("type", [stdioBlock, httpBlock, sseBlock]),
);

export const mcpBlock = z.object({
  servers: z.record(z.string(), serverShape).optional(),
});

const optionValueShape = z.union([z.string(), z.number(), z.boolean()]);

const BLOCKED_MARKETPLACE_FIELD = {
  ref: optionalText(),
  path: optionalText(),
  sparsePaths: optionalTextListWithMin(),
} as const;

const marketplaceSourceShape = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal(MARKETPLACE_SOURCES[0]),
      url: requiredText(),
      headers: optionalTextMap(),
    })
    .strict(),
  z
    .object({
      source: z.literal(MARKETPLACE_SOURCES[1]),
      repo: requiredText(),
      ...BLOCKED_MARKETPLACE_FIELD,
    })
    .strict(),
  z
    .object({
      source: z.literal(MARKETPLACE_SOURCES[2]),
      url: requiredText(),
      ...BLOCKED_MARKETPLACE_FIELD,
    })
    .strict(),
  z.object({ source: z.literal(MARKETPLACE_SOURCES[3]), package: requiredText() }).strict(),
  z.object({ source: z.literal(MARKETPLACE_SOURCES[4]), path: requiredText() }).strict(),
  z.object({ source: z.literal(MARKETPLACE_SOURCES[5]), path: requiredText() }).strict(),
]);

// 插件块：dirs/enabledPlugins/extraKnownMarketplaces/options/suppressedBuiltins
// 分别对应本地目录、单插件开关、额外市场、插件选项与内置停用清单。
const pluginsBlock = z.object({
  enabled: optionalBoolean(),
  dirs: optionalTextListWithMin(),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
  extraKnownMarketplaces: z
    .record(requiredText(), z.object({ source: marketplaceSourceShape }).strict())
    .optional(),
  options: z.record(z.string(), z.record(z.string(), optionValueShape)).optional(),
  suppressedBuiltins: optionalTextListWithMin(),
});

const skillToggleShape = z.object({ enable: optionalBoolean() });

/** skill / command 可用性覆盖：key 是 .md 的绝对路径，`enable:false` 表示禁用。 */
const skillOverrideShape = z
  .object({
    enable: optionalBoolean(),
  })
  .passthrough();
const skillOverridesShape = z.record(z.string(), skillOverrideShape);
const skillsBlock = z
  .object({
    enabled: optionalBoolean(),
    includeInstructions: optionalBoolean(),
    metadataBudget: optionalPositive(),
    roots: optionalTextList(),
  })
  .catchall(skillToggleShape);

const loggingBlock = z.object({
  level: z.enum(LOG_LEVELS).optional(),
  format: z.enum(LOG_FORMATS).optional(),
});

const uiBlock = z.object({
  locale: z.enum(UI_LOCALES).optional(),
  theme: z.enum(UI_THEMES).optional(),
});

const toolConcurrencyBlock = z.object({ maxConcurrency: optionalPositive() });

const guardBlock = z.object({
  toolCallWarningThreshold: optionalWholePositive(),
  repeatedToolCallWarningThreshold: optionalWholePositive(),
  maxBudgetWarningsPerTurn: optionalNonNegativeWhole(),
});

/**
 * Hooks 块：理想态是 re-export shared/workspace-hook-config，但两个 pnpm workspace 解析出
 * 物理不同的 zod 实例，嵌入会让 dts 引用外来 zod 内部类型（TS2742）。因此按本包 zod 重建，
 * 与 shared 的校验语义等价；运行时装配仍以 shared schema 为准，这里只服务配置文件装载。
 */
/** 两类 hook 的公共字段：type 字面量 + 命令 + 启用开关。 */
function hookBase(type: "process" | "command") {
  return { type: z.literal(type), command: requiredText(), enabled: optionalBoolean() };
}

const processHookShape = z
  .object({
    ...hookBase("process"),
    args: optionalTextList(),
    timeoutMs: optionalPositive(),
    statusMessage: optionalText(),
  })
  .passthrough();

const commandHookShape = z
  .object({
    ...hookBase("command"),
    async: optionalBoolean(),
    shell: z.union([z.literal(true), requiredText()]).optional(),
    timeout: optionalPositive(),
    timeoutMs: optionalPositive(),
    statusMessage: optionalText(),
  })
  .passthrough();

/** 单个事件的匹配器：matcher 可选，hooks 至少一条。 */
function matcherShapeFor(type: "process" | "command") {
  return z
    .object({
      matcher: optionalText(),
      hooks: z.array(type === "process" ? processHookShape : commandHookShape).min(1),
    })
    .strict();
}

const matcherShape = z.union([matcherShapeFor("process"), matcherShapeFor("command")]);

/** 七类事件形状相同：用命名常量归约，避免七行复制。 */
function hookEventMap() {
  const fields = HOOK_EVENT_NAMES.map((name) => [name, z.array(matcherShape).optional()] as const);
  return z
    .object(
      Object.fromEntries(fields) as Record<string, z.ZodOptional<z.ZodArray<typeof matcherShape>>>,
    )
    .strict();
}

const hooksBlock = z
  .object({
    enabled: optionalBoolean(),
    timeoutMs: optionalPositive(),
    maxOutputBytes: optionalPositive(),
    events: hookEventMap().optional(),
  })
  .strict();

/** 顶层块表：列在这里的键都会包一层 optional，键名即配置文件的键名。 */
const CONFIG_BLOCKS = {
  modelStream: modelStreamBlock,
  permission: permissionBlock,
  storage: storageBlock,
  network: networkBlock,
  features: featuresBlock,
  memory: memoryBlock,
  mcp: mcpBlock,
  plugins: pluginsBlock,
  skills: skillsBlock,
  skill: skillOverridesShape,
  command: skillOverridesShape,
  logging: loggingBlock,
  ui: uiBlock,
  toolConcurrency: toolConcurrencyBlock,
  modelAnomalyGuard: guardBlock,
  hooks: hooksBlock,
} as const;

export const KnorviaConfigFileSchema = z
  .object({
    $schema: z.string().optional(),
    modelStream: CONFIG_BLOCKS.modelStream.optional(),
    permission: CONFIG_BLOCKS.permission.optional(),
    storage: CONFIG_BLOCKS.storage.optional(),
    network: CONFIG_BLOCKS.network.optional(),
    features: CONFIG_BLOCKS.features.optional(),
    memory: CONFIG_BLOCKS.memory.optional(),
    mcp: CONFIG_BLOCKS.mcp.optional(),
    plugins: CONFIG_BLOCKS.plugins.optional(),
    skills: CONFIG_BLOCKS.skills.optional(),
    skill: CONFIG_BLOCKS.skill.optional(),
    command: CONFIG_BLOCKS.command.optional(),
    logging: CONFIG_BLOCKS.logging.optional(),
    ui: CONFIG_BLOCKS.ui.optional(),
    toolConcurrency: CONFIG_BLOCKS.toolConcurrency.optional(),
    modelAnomalyGuard: CONFIG_BLOCKS.modelAnomalyGuard.optional(),
    hooks: CONFIG_BLOCKS.hooks.optional(),
  })
  .passthrough();

export type KnorviaConfigFile = z.infer<typeof KnorviaConfigFileSchema>;

export { serverShape, SERVER_TYPES, textMapSchema, unknownMapSchema };
