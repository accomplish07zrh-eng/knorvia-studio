// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

import { getCommunityUrlFromConfigs, getFeedbackUrlFromConfig } from "./remoteAppConfig.js";

/*
 * 帮助页配置的本地/远端合并：URL 字段遵循「远端非空优先，否则回落本地」；
 * feedback_use_external_form 是唯一特例——false 也是显式配置，不能回退。
 */

const optionalString = z.string().optional().catch(undefined);

const localeUrlField = (): z.ZodType<string | undefined> => optionalString;

const localeUrls = z
  .object({ "zh-CN": localeUrlField(), "en-US": localeUrlField() })
  .optional()
  .catch(undefined);

/** 宽容解析：任何字段坏掉都只丢该字段，不影响其它字段。 */
const helpConfig = z.object({
  community_urls: localeUrls,
  feedback_url: optionalString,
  feedback_use_external_form: z.boolean().optional().catch(undefined),
});

export type HelpAppConfig = z.infer<typeof helpConfig>;

/** 优先取远端显式布尔值；远端没给才看本地，最后缺省 false。 */
function pickExternalFormFlag(
  remote: HelpAppConfig | undefined,
  local: HelpAppConfig | undefined,
): boolean {
  const remoteValue = remote?.feedback_use_external_form;
  return remoteValue === undefined ? (local?.feedback_use_external_form ?? false) : remoteValue;
}

export function resolveHelpAppConfig(remote: unknown, local: unknown): HelpAppConfig {
  const remoteConfig = helpConfig.safeParse(remote).data;
  const localConfig = helpConfig.safeParse(local).data;
  const community = (locale: "zh-CN" | "en-US") =>
    getCommunityUrlFromConfigs(remoteConfig, localConfig, locale);

  return {
    community_urls: { "zh-CN": community("zh-CN"), "en-US": community("en-US") },
    feedback_url: getFeedbackUrlFromConfig(remoteConfig) ?? getFeedbackUrlFromConfig(localConfig),
    // 远端显式 false 不得按 truthy 判断后回退到本地 true。
    feedback_use_external_form: pickExternalFormFlag(remoteConfig, localConfig),
  };
}
