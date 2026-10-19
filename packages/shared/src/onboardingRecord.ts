// SPDX-License-Identifier: Apache-2.0
/**
 * Onboarding 用户引导完成记录模型与校验规范。
 * 管理首次启动向导（职业选择、操作模式与偏好设置）在本地的持久化记录格式。
 */

import { z } from "zod";

const stringField = (minLength: number) => z.string().min(minLength);
const nullableString = (minLength: number) => stringField(minLength).nullable();
const nullableBool = () => z.boolean().nullable();

const PENDING_UPLOAD_STATE = "pending" as const;
const ONBOARDING_RECORD_VERSION = 1 as const;

/** 职业属性：非空字符串或显式跳过（null） */
export const onboardingOccupationSchema = nullableString(1);

/** 界面模式：编程 (coding) 或办公 (office)，或跳过 (null) */
const INTERFACE_MODES = ["coding", "office"] as const;
export const onboardingInterfaceModeSchema = z.enum(INTERFACE_MODES).nullable();

// --- 引导完成条目校验模式 ---

const entryFields = {
  userId: nullableString(1),
  occupation: onboardingOccupationSchema,
  interfaceMode: onboardingInterfaceModeSchema,
  memoryEnabled: nullableBool(),
  proactiveSuggestionsEnabled: nullableBool(),
  completedAt: stringField(1),
  uploadState: z.literal(PENDING_UPLOAD_STATE),
};

export const onboardingRecordEntrySchema = z.object(entryFields);

export type OnboardingRecordEntry = z.infer<typeof onboardingRecordEntrySchema>;

/** 写入新记录条目的上行参数（由宿主补齐 userId 与状态） */
export type OnboardingRecordEntryInput = Omit<OnboardingRecordEntry, "userId" | "uploadState">;

// --- 持久化文件结构模式 ---

const makeRecordList = (itemSchema: typeof onboardingRecordEntrySchema) => z.array(itemSchema);

const fileEnvelopeFields = {
  version: z.literal(ONBOARDING_RECORD_VERSION),
  deviceMid: stringField(1),
  entries: makeRecordList(onboardingRecordEntrySchema),
};

export const onboardingRecordFileSchema = z.object(fileEnvelopeFields);

export type OnboardingRecordFile = z.infer<typeof onboardingRecordFileSchema>;
