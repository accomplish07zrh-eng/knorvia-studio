import { z } from "zod";
import { getCommunityUrlFromConfigs, getFeedbackUrlFromConfig } from "./remoteAppConfig.js";

const helpConfigSchema = z.object({
  community_urls: z
    .object({
      "zh-CN": z.string().optional().catch(undefined),
      "en-US": z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  feedback_url: z.string().optional().catch(undefined),
  feedback_use_external_form: z.boolean().optional().catch(undefined),
});
export type HelpAppConfig = z.infer<typeof helpConfigSchema>;

export function resolveHelpAppConfig(remote: unknown, local: unknown): HelpAppConfig {
  const remoteConfig = helpConfigSchema.safeParse(remote).data;
  const localConfig = helpConfigSchema.safeParse(local).data;
  return {
    community_urls: {
      "zh-CN": getCommunityUrlFromConfigs(remoteConfig, localConfig, "zh-CN"),
      "en-US": getCommunityUrlFromConfigs(remoteConfig, localConfig, "en-US"),
    },
    feedback_url: getFeedbackUrlFromConfig(remoteConfig) ?? getFeedbackUrlFromConfig(localConfig),
    // false 是远端明确配置，不能按 truthy 判断后回退到本地 true。
    feedback_use_external_form:
      remoteConfig?.feedback_use_external_form ?? localConfig?.feedback_use_external_form ?? false,
  };
}
