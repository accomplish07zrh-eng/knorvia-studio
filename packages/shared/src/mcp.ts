// SPDX-License-Identifier: Apache-2.0
// MCP 的共享数据合同：clients、desktop 主进程与 CLI 都按这里的形状读写配置，
// 但落盘位置、凭据来源与进程启动都属于各自的适配层。
import type { SettingsDirectoryLocation } from "./settings-source.js";
import type { McpServerFailureKind } from "./protocol/index.js";

/** 配置来源：通用 JSON 配置，或 CLI 自己的目录结构。 */
const SOURCE_TABLE = ["mcp", "knorviaagentmcp"] as const;

/** 作用域由外向内：全局 → 用户 → 项目。 */
const SCOPE_TABLE = ["common", "user", "workspace"] as const;

/** 列表排序用：越前面的状态越需要用户先看到。 */
const STATUS_TABLE = ["error", "connecting", "connected", "disconnected", "unknown"] as const;

export type McpSource = (typeof SOURCE_TABLE)[number];

export type CliMcpSource = Extract<McpSource, "knorviaagentmcp">;

export type McpScope = (typeof SCOPE_TABLE)[number];

export type McpFileFormat = "json";

/** 一处登记传输字段：`type` 显式优先，缺失时再由 command/url 推断。 */
type TransportFields = { type?: string; url?: string; command?: string };

/** 子进程启动参数；`args` 与 `env` 的书写顺序必须原样保留。 */
type LaunchFields = { args?: string[]; env?: Record<string, string> };

/** 两种头字段名的历史差异由 B17 的选择规则收敛，这里都要保留。 */
type HeaderFields = { headers?: Record<string, string>; http_headers?: Record<string, string> };

/** 凭据既可能来自 OAuth，也可能是 Provider 自己的 key/token。 */
type CredentialFields = { oauth?: McpOAuthConfig; apiKey?: string; personalAccessToken?: string };

/** 账号侧归属信息，供远端同步对账使用。 */
type AccountFields = { projectId?: string; organizationName?: string; projectName?: string };

/** 观测/追踪配置：只透传，shared 不解释其含义。 */
type TraceFields = { issueType?: string; fileId?: string; nodeId?: string; dsn?: string };

/** 任意未知键都必须原样保留：配置文件可能被更新版本的客户端写过。 */
type OpenRecord = Record<string, any>;

/**
 * 一份 MCP 服务器配置。除已知字段外允许任意键，因此用开放索引而非 union：
 * 未知键在整个「读取 → 编辑 → 写回」链路上不会丢失。
 */
export type McpServerConfig = TransportFields &
  LaunchFields &
  HeaderFields &
  CredentialFields &
  AccountFields &
  TraceFields &
  OpenRecord;

export type McpServerStatus = (typeof STATUS_TABLE)[number];

type ServerMap = Record<string, McpServerConfig>;

/** CLI 目录里同时存在公共服务器表与按项目分组的服务器表。 */
export type CliMcpConfig = { mcpServers: ServerMap } & { projects: Record<string, ServerMap> };

/** 目录写入的目标：项目路径与设置位置总是成对出现。 */
type DirectoryTarget = { projectPath?: string; location?: SettingsDirectoryLocation };

/** 文件引用：格式固定为 JSON，路径是绝对路径。 */
export type NativeMcpFileReference = { format: McpFileFormat; filePath: string };

type SaveAction = "upsert" | "delete" | "set-enabled";

/** 写请求的定位部分：动作 + 来源 + 服务器名，三者共同确定目标行。 */
type SaveTarget = { action: SaveAction; source: CliMcpSource; name: string };

/** 对 CLI 用户目录的写请求；`config` 与 `enabled` 按 action 二选一。 */
export type SaveCliMcpToUserDirectoryRequest = SaveTarget & {
  config?: McpServerConfig;
  enabled?: boolean;
} & DirectoryTarget;

type ServerName = { name: string };
type ServerConfigRef = { config: McpServerConfig };
type ServerFileRef = { file?: NativeMcpFileReference; location?: SettingsDirectoryLocation };
type ServerOrigin = { source: McpSource; scope: McpScope } & { projectPath?: string };

/** 扫描结果里的一条记录：来源、作用域与可选文件位置足以回写原文件。 */
export type NativeMcpServerRecord = ServerName &
  ServerConfigRef &
  ServerOrigin & { enabled?: boolean } & ServerFileRef;

export type LoadCliMcpFromUserDirectoryRequest = { workspacePath?: string };

export type LoadCliMcpFromUserDirectoryResult = { servers: NativeMcpServerRecord[] };

export type MigrateLegacyCommonMcpRequest = { legacyStorageDir?: string };

/** 迁移统计：总数 = 导入 + 跳过，三项都保留便于对账。 */
type MigrationLedger = { totalCount: number; importedCount: number; skippedCount: number };

export type MigrateLegacyCommonMcpResult = { servers: ServerMap } & {
  sourcePath?: string;
} & MigrationLedger;

export type McpConfig = { mcp: { mcpServers: ServerMap } } & { knorviaagentmcp: CliMcpConfig };

/** 正在进行的 OAuth 授权：只记录 URL 与开始时间，令牌不进这里。 */
type PendingAuthorization = {
  type: "oauth_authorization_code";
  authorizationUrl: string;
  startedAt: string;
};

/** 列表页需要的运行态：状态、最近连接时间与最近一次错误。 */
type ServerRuntimeState = { status?: McpServerStatus; lastConnected?: Date; error?: string };

/** 失败归因：分类 + 请求 id，两者一起才能把错误对到具体那次调用。 */
type FailureClass = { failureKind?: McpServerFailureKind; serverRequestId?: string };

/** 工具计数单独一层：探测成功后才写入。 */
type ToolCount = { toolCount?: number };

/** 服务器身份与启用状态；`changed` 表示本地有未同步的编辑。 */
type ServerIdentity = { id: string; name: string; enabled: boolean; changed?: boolean };

/** 完整服务器记录 = 身份 + 配置 + 运行态 + 来源位置。 */
export type KnorviaMcpServer = ServerIdentity &
  ServerConfigRef &
  ServerRuntimeState &
  FailureClass &
  ToolCount & { authorization?: PendingAuthorization } & ServerOrigin &
  ServerFileRef;

/** 列表项是服务器记录的裁剪版：去掉配置与授权细节。 */
type ListFacts = { status: McpServerStatus; hasConfig: boolean };

export type McpServerListItem = ServerIdentity &
  ListFacts &
  ServerRuntimeState &
  ToolCount &
  ServerOrigin &
  ServerFileRef;

/** 一次连通性探测的工具摘要；`input_schema` 由服务端给出，可能缺失。 */
type ToolSummary = { name: string; description?: string; input_schema?: any };

type ServerInfoSummary = { name: string; version: string };

/** 探测载荷：工具列表、服务端信息与耗时都可缺省。 */
type ProbePayload = { tools?: ToolSummary[] } & {
  serverInfo?: ServerInfoSummary;
  response_time?: number;
};

export type McpTestResult = { success: boolean; error?: string } & ProbePayload;

/** 传输方式决定服务器是本地子进程还是远端端点。 */
type ServerKind = "http" | "sse";

type IsolationMode = "session" | "workspace";
type ProtocolVersion = "legacy" | "auto" | "2026-07-28";

/** 每个 agent 连接都带同一组可选调优项。 */
type ServerOptions = { isolation?: IsolationMode } & {
  protocolVersion?: ProtocolVersion;
  timeoutMs?: number;
};

/** 名值对：JSON 里是对象，进程边界上是数组，顺序必须稳定。 */
export type NameValue = { name: string; value: string };

/** 子进程形态：命令、参数与环境变量都以数组表达，保持顺序。 */
type StdioCommand = { name: string; command: string; args: string[] } & { env: NameValue[] };

type StdioLaunch = StdioCommand & ServerOptions;

/** 远端形态：头与 OAuth 直接透传，由连接层负责注入。 */
type HttpEndpoint = { name: string; type: ServerKind; url: string };
type HttpAuth = { headers: NameValue[] } & { oauth?: McpOAuthConfig };

type HttpLaunch = HttpEndpoint & HttpAuth & ServerOptions;

/** 转换后的服务器描述：两种形态靠 `command` / `type` 区分。 */
export type KnorviaAgentMcpServer = StdioLaunch | HttpLaunch;

/** 两种 OAuth 客户端模式的公共可选项。 */
type OAuthClientOptions = { clientName?: string; scope?: string };

/** 机器对机器：没有交互，必须同时具备 clientId 与 clientSecret。 */
type ClientCredentialsMode = { type: "client_credentials"; clientId: string } & {
  clientSecret: string;
};

export type McpClientCredentialsOAuthConfig = ClientCredentialsMode & OAuthClientOptions;

/** 授权码模式：clientId/secret 可选，回调路径由客户端决定。 */
type AuthorizationCodeMode = { type: "authorization_code" } & { clientId?: string } & {
  clientSecret?: string;
  redirectPath?: string;
};

export type McpAuthorizationCodeOAuthConfig = AuthorizationCodeMode & OAuthClientOptions;

export type McpOAuthConfig = McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig;

/** 三个 CUA 常量同源于一份声明：插件 id、工具命名空间与注入子进程的环境键。 */
const CUA_OFFICIAL = {
  pluginId: "computer-use@knorvia-plugins-bundled",
  namespace: "plugin:computer-use:computer-use",
  envKey: "KNORVIA_PLUGIN_ID",
} as const;

export const KNORVIA_CUA_OFFICIAL_PLUGIN_ID = CUA_OFFICIAL.pluginId;

export const KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME = CUA_OFFICIAL.namespace;

export const KNORVIA_PLUGIN_ID_ENV_KEY = CUA_OFFICIAL.envKey;

/** B17：显式 `headers` 优先；只有它缺失时才回落到 v1 的 `http_headers`。 */
export const getMcpServerRequestHeaders = (input: McpServerConfig) =>
  input.headers ?? input.http_headers;

/** CUA 包名可能带 `[`、`@`、`==`、`.` 版本或范围后缀，也允许下划线写法。 */
const CUA_PREFIXES = ["cua[", "cua@", "cua==", "cua."];

const isCuaToken = (token: string): boolean => {
  const normalized = token.replaceAll("_", "-");
  return normalized === "cua" || CUA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

/** 命令可能带目录前缀与结尾斜杠，先取最后一段再看。 */
const lastPathSegment = (value: string): string => {
  const segments = value.split(/[\\/]+/u).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? value;
};

/** 命令行（含绝对路径）是否指向 CUA。 */
export const isKnorviaCuaMcpCommand = (command: string): boolean =>
  isCuaToken(command) || isCuaToken(lastPathSegment(command));

/** 包名/版本参数是否指向 CUA；与命令判定共用同一套候选规则。 */
export const isKnorviaCuaMcpPackageArg = (value: string): boolean =>
  isCuaToken(value) || isCuaToken(lastPathSegment(value));

/** 可选文本字段：缺省或字符串都合法，数字/对象一律拒绝。 */
const isOptionalText = (record: Record<string, unknown>, field: string) => {
  const value = record[field];
  return value === undefined || typeof value === "string";
};

/** 必填文本字段：必须是非空字符串（纯空白视为未填）。 */
const hasText = (record: Record<string, unknown>, field: string) => {
  const value = record[field];
  return typeof value === "string" && value.trim().length > 0;
};

/** 每种 OAuth 模式各自声明必填与可为空的字段，避免两处规则漂移。 */
const OAUTH_RULES = {
  client_credentials: { required: ["clientId", "clientSecret"], optional: ["clientName", "scope"] },
  authorization_code: {
    required: [],
    optional: ["clientId", "clientSecret", "clientName", "redirectPath", "scope"],
  },
} as const;

type OAuthMode = keyof typeof OAUTH_RULES;

const isOAuthMode = (value: unknown): value is OAuthMode =>
  value === "client_credentials" || value === "authorization_code";

const toPairs = (record: Record<string, string> | undefined): NameValue[] =>
  Object.entries(record ?? {}).map(([name, value]) => ({ name, value }));

/** OAuth 只接受两种已知模式；其它类型一律忽略，不做部分接收。 */
const acceptsOAuth = (value: unknown): value is McpOAuthConfig => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isOAuthMode(candidate.type)) return false;
  const rule = OAUTH_RULES[candidate.type];
  const requiredOk = rule.required.every((field) => hasText(candidate, field));
  return requiredOk && rule.optional.every((field) => isOptionalText(candidate, field));
};

/** Windows 主机判定：主进程看 `process`，渲染进程只有 `navigator`。 */
const isWindowsHost = (): boolean => {
  if (typeof process !== "undefined" && process.platform === "win32") return true;
  return typeof navigator !== "undefined" && /win/iu.test(navigator.platform);
};

/**
 * 合同要求裸 `cmd` 原样保留，只解包显式 `cmd.exe /c` 的包装：
 * 解包后必须重新切片，调用方传入的数组不能被就地改写。
 */
function unwrapWindowsShell(command: string, args: string[]): [string, string[]] {
  if (!isWindowsHost()) return [command, args];
  if (command.toLowerCase() !== "cmd.exe") return [command, args];
  const [flag, executable, ...rest] = args;
  if (flag !== "/c" || executable === undefined) return [command, args];
  return [executable, rest];
}

/** 只接收正整数毫秒；其它类型（含字符串 `"1"`）视为未设置。 */
const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

/** 把可选调优项逐个校验后挂到结果上；非法值不产生键。 */
function applyServerOptions(server: KnorviaAgentMcpServer, config: McpServerConfig): void {
  const timeoutMs = positiveInteger(config.timeoutMs);
  if (timeoutMs !== undefined) server.timeoutMs = timeoutMs;
  const isolation = config.isolation;
  if (isolation === "session" || isolation === "workspace") server.isolation = isolation;
  const version = config.protocolVersion;
  if (version === "legacy" || version === "auto" || version === "2026-07-28") {
    server.protocolVersion = version;
  }
}

/** 传输方式推断：显式 `type` 优先，其次 command（stdio），最后 url（http）。 */
const inferTransport = (input: McpServerConfig): string => {
  if (input.type !== undefined) return input.type;
  if (input.command) return "stdio";
  return input.url ? "http" : "";
};

function makeStdioServer(serverName: string, input: McpServerConfig): KnorviaAgentMcpServer | null {
  if (!input.command) return null;
  const [command, args] = unwrapWindowsShell(input.command, input.args ?? []);
  return { name: serverName, command, args, env: toPairs(input.env) };
}

function makeHttpServer(
  serverName: string,
  input: McpServerConfig,
  transport: string,
): KnorviaAgentMcpServer | null {
  if (!input.url) return null;
  const created: HttpLaunch = {
    name: serverName,
    type: transport === "sse" ? "sse" : "http",
    url: input.url,
    headers: toPairs(getMcpServerRequestHeaders(input)),
  };
  if (acceptsOAuth(input.oauth)) created.oauth = input.oauth;
  return created;
}

/**
 * 把用户配置转换成 agent 侧描述。空配置返回 `null` 而不是抛错：
 * 扫描目录时经常遇到别的客户端写了一半的条目。
 */
export function convertToKnorviaAgentMcpServer(
  name: string,
  config: McpServerConfig,
): KnorviaAgentMcpServer | null {
  const transport = inferTransport(config);
  const created =
    transport === "stdio" ? makeStdioServer(name, config) : makeHttpServer(name, config, transport);
  if (created === null) return null;
  applyServerOptions(created, config);
  return created;
}
