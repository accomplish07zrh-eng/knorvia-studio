// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export class RuntimeHeadersRefreshError extends Error {
  constructor(cause: unknown) {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
export async function resolveModelForAttempt(input: {
  attempt: number;
  reason?: "model-request";
  request: AiSdkModelTextRequest;
  resolveModel: (requestAuth?: ModelRequestAuth) => ResolvedAiSdkModel;
}): Promise<ResolvedAiSdkModel> {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
