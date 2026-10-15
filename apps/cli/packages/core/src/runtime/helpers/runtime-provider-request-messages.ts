// SPDX-License-Identifier: Apache-2.0
// 运行时请求消息入口的兼容面（B34）：实现见 ./provider/request-message-pipeline.js。
import * as pipeline from "./provider/request-message-pipeline.js";

export const buildRuntimeProviderRequestMessages = pipeline.buildRuntimeProviderRequestMessages;
