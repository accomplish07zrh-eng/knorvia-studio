// SPDX-License-Identifier: Apache-2.0
import type { Locale } from "./protocol.js";

type LocaleUrlMap = Partial<Record<Locale, string>>;
type ConfigBag = Record<string, unknown>;
type UrlReader = (config: unknown) => string | undefined;

/** 远程配置是外部 JSON：对象（含数组实例上挂的字段）都可作为可读字段袋，其余形态按缺失处理。 */
const asBag = (value: unknown): ConfigBag | undefined => {
  const isObjectValue = typeof value === "object" && value !== null;
  return isObjectValue ? (value as ConfigBag) : undefined;
};

/** URL 只按「trim 后非空」准入；返回值保留原样，由展示层决定是否规整。 */
const usableUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  return value.trim().length === 0 ? undefined : value;
};

const urlReader =
  (field: string): UrlReader =>
  (config) => {
    const bag = asBag(config);
    return bag === undefined ? undefined : usableUrl(bag[field]);
  };

export const getFeedbackUrlFromConfig: UrlReader = urlReader("feedback_url");

export const getFeedbackApiBaseFromConfig: UrlReader = urlReader("feedback_api_base");

/** 外部表单开关只认布尔 true 与字符串 "true"；"1"、1 之类都不算显式开启。 */
export const getFeedbackUseExternalFormFromConfig = (config: unknown): boolean => {
  const bag = asBag(config);
  if (bag === undefined) return false;
  const flag = bag.feedback_use_external_form;
  return flag === true || flag === "true";
};

// 只读 zh-CN/en-US 两个键：其余语言既不在协议里，也不该透传到 UI。
const COMMUNITY_LOCALES: readonly Locale[] = ["zh-CN", "en-US"];

export const getCommunityUrlsFromConfig = (config: unknown): LocaleUrlMap => {
  const urls = asBag(asBag(config)?.community_urls);
  const pair: LocaleUrlMap = {};
  if (urls === undefined) return pair;
  for (const locale of COMMUNITY_LOCALES) pair[locale] = usableUrl(urls[locale]);
  return pair;
};

export const getCommunityUrlFromConfig = (config: unknown, locale: Locale): string | undefined =>
  getCommunityUrlsFromConfig(config)[locale];

/** 社区链接按 locale 就近取值：远端未配置该语言时回退本地，不跨语言混用。 */
export const getCommunityUrlFromConfigs = (
  remoteConfig: unknown,
  localConfig: unknown,
  locale: Locale,
): string | undefined => {
  const remote = getCommunityUrlsFromConfig(remoteConfig)[locale];
  const local = getCommunityUrlsFromConfig(localConfig)[locale];
  return remote ?? local;
};

export const getForceUpdateMinimalVersionFromConfig = (config: unknown): string | undefined => {
  const forceUpdate = asBag(asBag(config)?.forceUpdate);
  if (forceUpdate === undefined) return undefined;
  const minimalVersion = forceUpdate.minimalVersion;
  if (typeof minimalVersion !== "string") return undefined;
  const version = minimalVersion.trim();
  return version.length > 0 ? version : undefined;
};
