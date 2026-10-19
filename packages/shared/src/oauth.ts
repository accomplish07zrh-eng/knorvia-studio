// SPDX-License-Identifier: Apache-2.0

/*
 * 模型供应商 id 与本地凭据错误。产品登录入口已移除，这里只保留手工配置供应商与
 * 解密失败识别所需的稳定标识。
 */

/** 内置 BigModel 供应商 id。 */
const BIGMODEL_ID = "bigmodel" as const;
/** 内置 ZAI 供应商 id。 */
const ZAI_ID = "zai" as const;

/** 凭据解密失败的错误前缀（历史错误只带文案时靠它识别）。 */
const DECRYPT_ERROR_PREFIX = "凭据解密失败：" as const;
/** 凭据解密失败的稳定错误码（新错误应优先携带）。 */
const DECRYPT_ERROR_CODE = "KNORVIA_CREDENTIAL_DECRYPT_FAILED" as const;

export const BIGMODEL_PROVIDER_ID = BIGMODEL_ID;
export const ZAI_PROVIDER_ID = ZAI_ID;
export const CREDENTIAL_DECRYPT_ERROR_PREFIX = DECRYPT_ERROR_PREFIX;
export const CREDENTIAL_DECRYPT_ERROR_CODE = DECRYPT_ERROR_CODE;

/** 从任意错误对象上读一个字符串字段；非对象或缺失返回空串。 */
function readStringProperty(error: unknown, property: "code" | "message"): string {
  if (typeof error !== "object" || error === null) return "";
  const raw = (error as Record<string, unknown>)[property];
  return raw === undefined || raw === null ? "" : String(raw);
}

/** 错误消息：Error 实例优先取自身 message。 */
function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return readStringProperty(error, "message");
}

/**
 * 是否来自本地凭据解密失败。
 *
 * 判定顺序固定：错误码存在时只认码；没有码才回退到文案前缀，
 * 以兼容跨进程丢失 code 的旧 payload。
 */
export const isCredentialDecryptError = (error: unknown): boolean => {
  const carriedCode = readStringProperty(error, "code");
  if (carriedCode !== "") return carriedCode === DECRYPT_ERROR_CODE;
  return readMessage(error).startsWith(DECRYPT_ERROR_PREFIX);
};

/** 品牌位让任意字符串不能悄悄充当内置供应商 id。 */
type BrandedProviderIdentifier = string & { readonly __oauthProviderBrand?: never };

/** OAuth provider 标识：两个内置 id，或带品牌的第三方 id。 */
export type OAuthProviderId =
  | typeof BIGMODEL_PROVIDER_ID
  | typeof ZAI_PROVIDER_ID
  | BrandedProviderIdentifier;
