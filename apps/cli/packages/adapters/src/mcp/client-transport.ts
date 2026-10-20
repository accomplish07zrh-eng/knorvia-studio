// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 浼犺緭閫傞厤鍣ㄧ殑瑁呴厤銆備竴涓湇鍔℃寜鍏堕厤缃惤鍦ㄤ笁绉嶄紶杈撲箣涓€锛歴tdio銆丼treamable HTTP銆?// SSE锛涗笁鑰呯殑宸埆闆嗕腑鍦ㄣ€岀敤浠€涔堟壙杞姐€嶄笌銆岃涓嶈瀹樻柟閴存潈鍖呰銆嶏紝鍏朵綑瑁呴厤閫昏緫鍏辩敤銆?//
// 瑁呴厤绾﹀畾锛堝疄鐜颁晶锛夛細
// 涓€銆乻tdio锛氬懡浠や笌鍙傛暟鏉ヨ嚜閰嶇疆锛沜wd 鑻ユ槸鐩稿璺緞锛屾寜銆岃皟鐢ㄦ柟宸ヤ綔鐩綍 鈫?瀹㈡埛绔姸鎬?鈫?//     杩涚▼ cwd銆嶉€愮骇鍏滃簳銆?// 浜屻€乻tdio 鐜鍏堢敱 buildMcpStdioEnv 瑁呴厤锛屽啀琚厤缃噷鐨?env 瑕嗙洊銆?// 涓夈€丠TTP/SSE锛氬厛寤哄甫缃戠粶绛栫暐鐨?fetch锛涘畼鏂归壌鏉冩椂鍐嶅寘涓€灞?officialHttpFetch銆?// 鍥涖€佽姹傚ご鍙湪閰嶇疆鐪熺殑鎻愪緵鏃堕€忎紶 鈥斺€?绌哄璞′笉杩?SDK銆?// 浜斻€佸崗璁崗鍟嗭細鍥哄畾鐗堟湰璧?pin锛宻se 涓?legacy 璧?legacy锛屽叾浣欒蛋 auto 鎺㈡祴锛?//     鎺㈡祴瓒呮椂鍙栦竴鍗婁笖涓嶈秴杩?5 绉掋€?// 鍏€佸崗璁け璐ヨ閫掑綊鍚戜笅鎵?cause锛圫DK 鐨勬椂浠ｅ崗鍟嗗け璐ャ€佷笉鏀寔鐗堟湰涓ょ被锛夈€?// 涓冦€乬eneration 鍙備笌瀹樻柟 HTTP 閴存潈鍖呰锛氶噸杩炴崲浠ｅ悗鏃ц姹備細琚瘑鍒苟涓㈠純銆?// 鍏€乻ignal 閫忎紶缁?stdio 鐨?requestMetaProvider锛屽彇娑堟椂鍏冩暟鎹彁渚涜€呴殢涔嬪け鏁堛€?// 涔濄€佷紶杈撳璞¤嚜韬笉甯﹂噸璇?鈥斺€?閲嶈繛鐢变笂灞傝繛鎺ユ睜鎸?generation 鍐崇瓥銆?
import { resolve } from "node:path";
import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
  SdkError,
  SdkErrorCode,
  UnsupportedProtocolVersionError,
  type VersionNegotiationOptions,
} from "@modelcontextprotocol/client";
import type { McpServerConfig } from "@knorvia/contracts";
import { authProvider } from "./client-auth.js";
import { officialHttpFetch, officialStdioMeta, usesOfficialAuth } from "./client-official.js";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { buildMcpStdioEnv, createMcpTransportFetch } from "./network.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

/** 鍥哄畾鐨勫崗璁増鏈細閰嶇疆绛変簬瀹冩椂鐩存帴 pin 浣忋€?*/
const PINNED_PROTOCOL = "2026-07-28";

/** auto 鎺㈡祴鐨勬椂闂翠笂闄愶紙姣锛夈€?*/
const MAX_AUTO_PROBE_MS = 5_000;

/** 涓€娆′紶杈撹閰嶆墍闇€鐨勫叏閮ㄤ俊鎭€?*/
type TransportAsk = {
  clientState: McpClientState;
  serverName: string;
  serverConfig: McpServerConfig;
  generation: number;
  signal: AbortSignal | undefined;
  workingDirectory: string | undefined;
};

/** stdio 褰㈡€佺殑閰嶇疆锛堝垽鍒仈鍚堥噷鐨勪竴鏀級銆?*/
type StdioConfig = Extract<McpServerConfig, { type: "stdio" }>;

/** stdio 瑁呴厤鍏ュ弬锛氬湪閫氱敤鍏ュ弬鍩虹涓婃妸閰嶇疆绐勫寲鍒?stdio 涓€鏀€?*/
type StdioAsk = Omit<TransportAsk, "serverConfig"> & { serverConfig: StdioConfig };

/** HTTP / SSE 形态的配置（判别联合里带 url 的那一支）。 */
type HttpConfig = Extract<McpServerConfig, { url: string }>;

/** HTTP / SSE 装配入参：配置窄化到带 url 的那一支。 */
type HttpAsk = Omit<TransportAsk, "serverConfig"> & { serverConfig: HttpConfig };

/** 鎺㈡祴瓒呮椂涓嬮檺锛氳嚦灏?1 姣锛岄伩鍏?0 鎴栬礋鏁般€?*/
function probeTimeout(budgetMs: number): number {
  return Math.max(1, Math.floor(budgetMs));
}

/** 鍗忓晢绛栫暐锛氬浐瀹氱増鏈?/ legacy / auto 涓夐€変竴銆?*/
export function negotiation(
  serverConfig: McpServerConfig,
  timeoutMs: number,
): VersionNegotiationOptions {
  if (serverConfig.protocolVersion === PINNED_PROTOCOL) {
    return { mode: { pin: PINNED_PROTOCOL }, probe: { timeoutMs: probeTimeout(timeoutMs) } };
  }
  if (serverConfig.type === "sse" || serverConfig.protocolVersion === "legacy") {
    return { mode: "legacy" };
  }
  const half = Math.floor(timeoutMs / 2);
  return {
    mode: "auto",
    probe: {
      timeoutMs: Math.max(1, Math.min(MAX_AUTO_PROBE_MS, Number.isFinite(half) ? half : 0)),
    },
  };
}

/** stdio 鐨?cwd锛氱浉瀵硅矾寰勯€愮骇鍏滃簳锛岀粷瀵硅矾寰勭洿鎺ヨВ鏋愩€?*/
function stdioWorkingDirectory(ask: StdioAsk): string | undefined {
  const { serverConfig, clientState, workingDirectory } = ask;
  const base = workingDirectory ?? clientState.workingDirectory;
  if (!serverConfig.cwd) return base;
  return resolve(base ?? process.cwd(), serverConfig.cwd);
}

/** stdio 鐨勭幆澧冿細鍩虹瑁呴厤缁撴灉琚厤缃鐩栥€?*/
function stdioEnvironment(ask: StdioAsk): Record<string, string> {
  const base = buildMcpStdioEnv({ env: ask.clientState.env, network: ask.clientState.network });
  return { ...base, ...ask.serverConfig.env };
}

/** 閫?stdio 浼犺緭锛涘畼鏂归壌鏉冩椂棰濆鎸?requestMetaProvider銆?*/
function stdioTransport(ask: StdioAsk): ProtocolTransport {
  const options = {} as ConstructorParameters<typeof ProcessTreeStdioClientTransport>[0];
  options.command = ask.serverConfig.command;
  options.args = ask.serverConfig.args ?? [];
  options.cwd = stdioWorkingDirectory(ask);
  options.env = stdioEnvironment(ask);
  options.stderr = "pipe";
  if (usesOfficialAuth(ask.serverConfig)) {
    options.requestMetaProvider = () =>
      officialStdioMeta(ask.clientState, ask.serverName, ask.serverConfig, ask.signal);
  }
  return new ProcessTreeStdioClientTransport(options);
}

/** HTTP/SSE 鍏辩敤鐨勮姹傚垵濮嬪寲锛氬彧鍦ㄩ厤缃粰浜嗗ご鏃堕€忎紶銆?*/
function requestInitOf(serverConfig: HttpConfig): { headers: Record<string, string> } | undefined {
  return serverConfig.headers ? { headers: serverConfig.headers } : undefined;
}

/** 閫?Streamable HTTP 浼犺緭锛氬畼鏂归壌鏉冩椂 fetch 浼氳鍐嶅寘涓€灞傘€?*/
function httpTransport(
  ask: HttpAsk & { serverConfig: Extract<McpServerConfig, { type: "http" }> },
  plainFetch: typeof fetch,
): ProtocolTransport {
  const fetchImpl = officialHttpFetch(
    ask.clientState,
    ask.serverName,
    ask.serverConfig,
    ask.generation,
    plainFetch,
  );
  return new StreamableHTTPClientTransport(new URL(ask.serverConfig.url), {
    authProvider: authProvider(ask.clientState, ask.serverName, ask.serverConfig),
    fetch: fetchImpl,
    requestInit: requestInitOf(ask.serverConfig),
  });
}

/** 閫?SSE 浼犺緭锛氳蛋涓嶅甫瀹樻柟閴存潈鍖呰鐨?fetch銆?*/
function sseTransport(ask: HttpAsk, plainFetch: typeof fetch): ProtocolTransport {
  return new SSEClientTransport(new URL(ask.serverConfig.url), {
    authProvider: authProvider(ask.clientState, ask.serverName, ask.serverConfig),
    fetch: plainFetch,
    requestInit: requestInitOf(ask.serverConfig),
  });
}

export function createTransport(
  clientState: McpClientState,
  serverName: string,
  serverConfig: McpServerConfig,
  generation: number,
  signal: AbortSignal | undefined,
  workingDirectory: string | undefined,
): ProtocolTransport {
  const ask: TransportAsk = {
    clientState,
    serverName,
    serverConfig,
    generation,
    signal,
    workingDirectory,
  };
  if (serverConfig.type === "stdio") return stdioTransport({ ...ask, serverConfig });

  const plainFetch = createMcpTransportFetch({
    env: clientState.env,
    network: clientState.network,
  });
  if (serverConfig.type === "http") return httpTransport({ ...ask, serverConfig }, plainFetch);
  return sseTransport({ ...ask, serverConfig }, plainFetch);
}

/** 璇ラ敊璇槸鍚﹀睘浜庛€屽崗璁崗鍟嗗け璐ャ€嶏細SDK 鏃朵唬鍗忓晢澶辫触銆佷笉鏀寔鐗堟湰锛屾垨瀹冧滑鐨?cause 閾句笂鍑虹幇銆?*/
export function protocolFailure(error: unknown): boolean {
  if (error instanceof SdkError && error.code === SdkErrorCode.EraNegotiationFailed) return true;
  if (UnsupportedProtocolVersionError.isInstance(error)) return true;
  if (error === null || typeof error !== "object" || !("cause" in error)) return false;
  const cause = (error as { cause: unknown }).cause;
  if (cause === undefined || cause === error) return false;
  return protocolFailure(cause);
}
