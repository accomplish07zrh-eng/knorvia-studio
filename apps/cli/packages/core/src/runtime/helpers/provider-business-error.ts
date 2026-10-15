// SPDX-License-Identifier: Apache-2.0
// 提供商业务错误识别与转换的兼容面（B29）：实现见 ./model/provider-business-failure.js。
import * as business from "./model/provider-business-failure.js";

export const findProviderBusinessFailureInMetadata = business.findProviderBusinessFailureInMetadata;
export const createCoreErrorFromProviderBusinessLike =
  business.createCoreErrorFromProviderBusinessLike;
