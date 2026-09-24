import { list, record, text } from "../../domain/kernelPolicy.js";
import type { ProtocolProcess } from "./processTransport.js";

/** Reuse only authentication already present in the user's local Grok CLI. */
export async function authenticateGrok(
  rpc: ProtocolProcess,
  initialized: Record<string, unknown>,
): Promise<void> {
  const methods = list(initialized.authMethods).map((value) => text(record(value).id));
  if (methods.includes("cached_token"))
    await rpc.request("authenticate", { methodId: "cached_token", _meta: { headless: true } });
  else if (methods.includes("xai.api_key") && process.env.XAI_API_KEY)
    await rpc.request("authenticate", { methodId: "xai.api_key", _meta: { headless: true } });
  else if (methods.length) throw new Error("Grok 没有可复用的本机认证方式，请在原 CLI 登录后重试");
}
