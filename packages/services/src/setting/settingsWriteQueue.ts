/** Bound preparation time; once commit starts, completion owns the queue slot. */
export function withSettingsWriteQueueTimeout(
  runUpdate: (enterCommitPhase: () => void) => Promise<void>,
  expireCurrentWrite: () => void,
): Promise<void> {
  const configured = Number(process.env.KNORVIA_SETTING_WRITE_QUEUE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopDeadline = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const deadline = new Promise<void>((_resolve, reject) => {
    timer = setTimeout(() => {
      expireCurrentWrite();
      reject(new Error(`settingService update timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
  });

  let operation: Promise<void>;
  try {
    operation = runUpdate(stopDeadline);
  } catch (error) {
    stopDeadline();
    throw error;
  }
  return Promise.race([operation, deadline]).finally(stopDeadline);
}
