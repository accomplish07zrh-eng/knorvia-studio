import type { ServerRemoteInfo } from "@knorvia/shared";

export interface WebBootstrapResult {
  wsUrl: string;
  initialWorkspaceAbsPath?: string;
  initialWorkspaceIdentity?: string;
  initialTaskId?: string;
  restoreSession?: boolean;
  allowOpenWorkspace?: boolean;
}

export interface WebBootstrapSource {
  readonly location: Pick<Location, "search" | "protocol" | "host">;
  serverInfo(): Promise<Partial<ServerRemoteInfo> | undefined>;
}

export async function readWebServerInfo(): Promise<Partial<ServerRemoteInfo> | undefined> {
  const response = await fetch("/api/server-info", { cache: "no-store" });
  return response.ok ? (await response.json()) as Partial<ServerRemoteInfo> : undefined;
}

export async function resolveWebBootstrap(source: WebBootstrapSource): Promise<WebBootstrapResult> {
  const remote = new URLSearchParams(source.location.search).get("remote");
  const scheme = source.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${scheme}//${source.location.host}/ws`;
  const plan: WebBootstrapResult = { wsUrl: remote ? `${base}/remote/${remote}` : base };
  if (remote) return plan;
  try {
    const info = await source.serverInfo();
    if (info === undefined) return plan;
    const first = Array.isArray(info.workspaces) ? info.workspaces[0] : undefined;
    const initialized = { ...plan };
    if (first?.path) initialized.initialWorkspaceAbsPath = first.path;
    if (first?.workspaceIdentity) initialized.initialWorkspaceIdentity = first.workspaceIdentity;
    return initialized;
  } catch {
    // server-info 是可选的初始投影；失败仍沿用普通 /ws，不能把连接阶段跳过。
  }
  return plan;
}
