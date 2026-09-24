/** RPC 的接收与排空归同一作用域；数据库只能在 stop + drain 后关闭。 */
export class StudioRuntimeLifecycle {
  private readonly pending = new Set<Promise<void>>();
  private closed = false;

  get stopping(): boolean {
    return this.closed;
  }

  assertOpen(): void {
    if (this.closed) throw new Error("应用正在退出，请重开后继续");
  }

  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    this.assertOpen();
    let done!: () => void;
    const settled = new Promise<void>((resolve) => {
      done = resolve;
    });
    // 先登记再进入 operation，连同步异常与重入退出也不能漏掉已接收的操作。
    this.pending.add(settled);
    try {
      return await operation();
    } finally {
      this.pending.delete(settled);
      done();
    }
  }

  stop(): void {
    this.closed = true;
  }

  async drain(): Promise<void> {
    if (!this.closed) throw new Error("Studio lifecycle must stop admission before draining");
    await Promise.all(this.pending);
  }
}
