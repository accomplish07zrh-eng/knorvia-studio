type QuitEvent = { preventDefault(): void };

/** 退出确认完成前不清理运行态；退出意图沿用 Main 的现有 refs。 */
export function createDesktopQuitLifecycle(options: {
  forceQuitRef: { current: boolean };
  explicitQuitRef: { current: boolean };
  confirmQuit: () => boolean;
  prepare: () => Promise<void>;
  requestQuit: () => void;
  relaunch: () => void;
  exit: () => void;
  onError: (error: unknown) => void;
}) {
  let relaunchRequested = false;
  let completion: Promise<void> | undefined;
  const cancel = () => {
    if (completion) return;
    options.forceQuitRef.current = false;
    options.explicitQuitRef.current = false;
    relaunchRequested = false;
  };
  return {
    cancel,
    requestRelaunch() {
      if (completion) return;
      relaunchRequested = true;
      options.explicitQuitRef.current = true;
      options.requestQuit();
    },
    beforeQuit(event: QuitEvent) {
      if (completion) {
        event.preventDefault();
        return;
      }
      if (!options.forceQuitRef.current && !options.confirmQuit()) {
        event.preventDefault();
        cancel();
        return;
      }
      options.forceQuitRef.current = true;
    },
    willQuit(event: QuitEvent) {
      event.preventDefault();
      // 所有窗口已允许卸载。再次 quit 共用屏障，不能再询问或重复退出。
      completion ??= Promise.resolve()
        .then(options.prepare)
        .catch(options.onError)
        .then(() => {
          try {
            if (relaunchRequested) options.relaunch();
          } finally {
            options.exit();
          }
        });
      return completion;
    },
  };
}
