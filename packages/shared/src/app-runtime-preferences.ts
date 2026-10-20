// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/* 运行时偏好的广播协议：频道名、E2E 时钟入口与载荷字段都只登记一次。 */

/** 协议里两个对外字符串（频道名与 E2E 环境变量名）。 */
const PROTOCOL_STRINGS = {
  broadcastChannel: "settings:app-runtime-preferences",
  clockScaleEnv: "KNORVIA_E2E_ASK_USER_QUESTION_CLOCK_SCALE",
} as const;

export const APP_RUNTIME_PREFERENCES_CHANGED_BROADCAST_CHANNEL = PROTOCOL_STRINGS.broadcastChannel;
export const ASK_USER_QUESTION_E2E_CLOCK_SCALE_ENV = PROTOCOL_STRINGS.clockScaleEnv;

/** 必填布尔开关。 */
const requiredSwitch = () => z.boolean();

/** 缺省为给定值的布尔开关：老 renderer 不发送该字段时按 fallback 处理。 */
const switchDefaultingTo = (fallback: boolean) => z.boolean().default(fallback);

/** 偏好字段登记：字段名 → 校验器。新增偏好只改这一处。 */
const preferenceFields = {
  askUserQuestionAutoResolutionEnabled: requiredSwitch(),
  modelIoFullRetentionEnabled: switchDefaultingTo(false),
};

const payloadSchema = z.strictObject(preferenceFields);

export { payloadSchema as appRuntimePreferencesChangedBroadcastPayloadSchema };

/** 由 schema 推导的载荷类型；调用方不需要手写第二份字段列表。 */
export type AppRuntimePreferencesChangedBroadcastPayload = z.output<typeof payloadSchema>;
