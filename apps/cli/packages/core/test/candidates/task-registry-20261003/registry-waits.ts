type TaskWaitKind = "terminal" | "background";
type TaskWaitTicket<T> = {
  resolve: (value: T | undefined) => void;
  cleanup: () => void;
  cohort?: TaskWaitCohort<T>;
  previous?: TaskWaitTicket<T>;
  next?: TaskWaitTicket<T>;
};
type TaskWaitCohort<T> = { head?: TaskWaitTicket<T>; tail?: TaskWaitTicket<T> };
type TaskWaitBook<T> = Partial<Record<TaskWaitKind, TaskWaitCohort<T>>>;

const ABORT_EVENT = "abort";
const WAIT_ABORT_MESSAGE = "Runtime task wait aborted";

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error(WAIT_ABORT_MESSAGE);
}

// 订阅独立于快照：signal 安装时可以重入 remove/register，安装返回后仍按 id 接纳。
export class TaskWaitSubscriptions<T> {
  private readonly books = new Map<string, TaskWaitBook<T>>();

  subscribe(id: string, kind: TaskWaitKind, signal?: AbortSignal): Promise<T | undefined> {
    // getter 异常必须同步传播，不能移入 native Promise executor 后改成 rejection。
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<T | undefined>((resolve, reject) => {
      let onAbort: (() => void) | undefined;
      const ticket: TaskWaitTicket<T> = {
        resolve,
        cleanup: () => {
          if (signal && onAbort) signal.removeEventListener(ABORT_EVENT, onAbort);
        },
      };
      if (signal) {
        onAbort = () => {
          this.forget(id, kind, ticket);
          reject(abortReason(signal));
        };
        signal.addEventListener(ABORT_EVENT, onAbort, { once: true });
      }

      let book = this.books.get(id);
      if (!book) {
        book = {};
        this.books.set(id, book);
      }
      const cohort: TaskWaitCohort<T> = book[kind] ?? {};
      book[kind] = cohort;
      ticket.cohort = cohort;
      ticket.previous = cohort.tail;
      if (cohort.tail) cohort.tail.next = ticket;
      else cohort.head = ticket;
      cohort.tail = ticket;
    });
  }

  publish(id: string, kind: TaskWaitKind, value: T | undefined): void {
    const book = this.books.get(id);
    const cohort = book?.[kind];
    if (!book || !cohort) return;
    delete book[kind];
    if (!book.terminal && !book.background) this.books.delete(id);
    // cohort 在 cleanup 前整体脱离；重入订阅不加入旧 cohort，抛错后也不能重放旧成员。
    let ticket = cohort.head;
    while (ticket) {
      ticket.cleanup();
      ticket.resolve(value);
      ticket = ticket.next;
    }
  }

  private forget(id: string, kind: TaskWaitKind, ticket: TaskWaitTicket<T>): void {
    const book = this.books.get(id);
    const cohort = book?.[kind];
    if (!book || !cohort || ticket.cohort !== cohort) return;
    if (ticket.previous) ticket.previous.next = ticket.next;
    else cohort.head = ticket.next;
    if (ticket.next) ticket.next.previous = ticket.previous;
    else cohort.tail = ticket.previous;
    ticket.cohort = undefined;
    ticket.previous = undefined;
    ticket.next = undefined;
    // 最后一个 abort 要释放空订阅簿，避免长程任务积累已取消 id。
    if (cohort.head) return;
    delete book[kind];
    if (!book.terminal && !book.background) this.books.delete(id);
  }
}
