// SPDX-License-Identifier: Apache-2.0
// Provider Family 的连接选择 schema（B31）。
import { z } from "zod";

const requiredText = z.string().trim().min(1);

const startPlanChoice = z.object({ kind: z.literal("start-plan") }).strict();
const individualPlanChoice = z.object({ kind: z.literal("individual-coding-plan") }).strict();
const teamPlanChoice = z
  .object({
    // team 档除判别标签外还要带产品/组织/项目三元组。
    kind: /* 判别标签 */ z.literal("team-coding-plan"),
    productId: /* 产品 ID */ requiredText,
    organizationId: /* 组织 ID */ requiredText,
    projectId: /* 项目 ID */ requiredText,
  })
  .strict(); // 未知键拒绝

export const providerFamilyConnectionSelectionSchema = z.discriminatedUnion("kind", [
  startPlanChoice,
  individualPlanChoice,
  teamPlanChoice,
]); // 三种连接选择意图

const familySelectionFields = {
  zai: /* zai 家族槽 */ providerFamilyConnectionSelectionSchema.optional(),
  bigmodel: /* bigmodel 家族槽 */ providerFamilyConnectionSelectionSchema.optional(),
};

export const providerFamilyConnectionSelectionSettingsSchema = z
  .object(familySelectionFields)
  .partial(); // 两个家族槽各自可缺席

type SelectionOutput = z.output<typeof providerFamilyConnectionSelectionSchema>;
type SettingsOutput = z.output<typeof providerFamilyConnectionSelectionSettingsSchema>;

// 用户对一个 Provider Family 的连接选择意图；不包含账号身份或动态凭据。
export type ProviderFamilyConnectionSelection = Readonly<SelectionOutput>;

export type ProviderFamilyConnectionSelectionSettings = SettingsOutput;
