// 显式业务时钟避免测试冻结文件写入退避；沿用原生安排、unref 和取消语义。
export function scheduleNativeRunDeadline(callback: () => void, delayMs: number): () => void {
  const timeout = setTimeout(callback, delayMs);
  timeout.unref?.();
  return () => clearTimeout(timeout);
}
