// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 运行期输入的呈现标记 → 消息元数据：新标记决定真实输入身份，
// 不能让 coordinator 继承 guide 的 real_user。
import { parseRuntimeInputPresentation } from "@knorvia/contracts";
import type { RuntimeMessageMetadata } from "./message-history.js";

export const runtimeInputMetadata = (value: unknown): RuntimeMessageMetadata | undefined => {
  const presentation = parseRuntimeInputPresentation(value);
  if (presentation === undefined) return undefined;
  const presentationMeta = {} as RuntimeMessageMetadata;
  presentationMeta.source = presentation === "user_steer" ? "real_user" : "legacy_synthetic";
  presentationMeta.inputPresentation = presentation;
  return presentationMeta;
};
