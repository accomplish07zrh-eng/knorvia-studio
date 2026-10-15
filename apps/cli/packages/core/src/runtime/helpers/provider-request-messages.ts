// SPDX-License-Identifier: Apache-2.0
// 请求消息总管线的兼容面（B34）：实现见 ./provider/request-message-pipeline.js。
import * as pipeline from "./provider/request-message-pipeline.js";

export type ProviderRequestMessageProjectionResult =
  pipeline.ProviderRequestMessageProjectionResult;
export const buildProviderRequestMessages = pipeline.buildProviderRequestMessages;
