// SPDX-License-Identifier: Apache-2.0
// 取消语义：AbortSignal 检查与 AbortError 构造；调用方只需判断错误名。
//
// 约定：
// - 只有「已取消」才抛错，未提供 signal 或未取消时静默返回；
// - 错误名固定为 AbortError，上层据此归类成 cancelled 而不是 io_error；
// - 取消文案与文件系统取消路径保持一致，避免同一语义出现两种措辞。
const CANCELLED_MESSAGE = "File system operation was cancelled";

export function abortError(text: string): Error {
  const failure = new Error(text);
  failure.name = "AbortError";
  return failure;
}

export function aborted(signal?: AbortSignal): void {
  const cancelled = signal?.aborted === true;
  if (cancelled) throw abortError(CANCELLED_MESSAGE);
}
