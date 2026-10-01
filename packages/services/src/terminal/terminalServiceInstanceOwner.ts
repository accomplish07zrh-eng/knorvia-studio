// Source-exposed reconstruction from frozen lifecycle contracts; inherited failure policies are preserved.
import { Emitter, type Event } from "@knorvia/rpc";
import type { IPty } from "node-pty";

interface Reservation {
  readonly id: string;
  readonly data: Emitter<string>;
  readonly exit: Emitter<number>;
}
interface PublishedInstance extends Reservation {
  readonly pty: IPty;
}
type Retirement = { kind: "caller" } | { kind: "exit"; code: number };
type RetirementStep = "kill" | "notify" | "data" | "exit" | "forget";
const retirementSteps: Readonly<Record<Retirement["kind"], readonly RetirementStep[]>> = {
  caller: ["kill", "data", "exit", "forget"],
  exit: ["notify", "data", "exit", "forget"],
};

/** One factory-local owner; reservations become accepted only after native listeners attach. */
export class TerminalServiceInstanceOwner {
  private sequence = 0;
  private readonly published = new Map<string, PublishedInstance>();

  get count(): number {
    return this.published.size;
  }

  reserveId(): string {
    return String(this.sequence++);
  }

  prepare(id: string): Reservation {
    return { id, data: new Emitter<string>(), exit: new Emitter<number>() };
  }

  attach(reservation: Reservation, pty: IPty): void {
    const instance: PublishedInstance = { ...reservation, pty };
    pty.onData((data) => instance.data.fire(data));
    pty.onExit(({ exitCode }) => this.retire(instance, { kind: "exit", code: exitCode }));
    // 旧契约在两次监听注册后才发布；同步 exit 或监听失败不能在此范围内改为新清理策略。
    this.published.set(instance.id, instance);
  }

  write(params: { id: string; data: string }): void {
    this.lookup(params.id).pty.write(params.data);
  }

  resize(params: { id: string; cols: number; rows: number }): void {
    this.lookup(params.id).pty.resize(params.cols, params.rows);
  }

  dataEvent(id: string): Event<string> {
    return this.lookup(id).data.event;
  }

  exitEvent(id: string): Event<number> {
    return this.lookup(id).exit.event;
  }

  dispose(id: string): void {
    const instance = this.published.get(id);
    if (instance) this.retire(instance, { kind: "caller" });
  }

  disposeAll(): void {
    const ids = [...this.published.keys()];
    for (const id of ids) this.dispose(id);
  }

  private lookup(id: string): PublishedInstance {
    const instance = this.published.get(id);
    if (!instance) throw new Error(`Terminal not found: ${id}`);
    return instance;
  }

  private retire(instance: PublishedInstance, reason: Retirement): void {
    // 顺序来自冻结测试：kill/exit 通知可重入，异常中断后续步骤，不能提前删除或吞掉错误。
    for (const step of retirementSteps[reason.kind]) {
      switch (step) {
        case "kill":
          instance.pty.kill();
          break;
        case "notify":
          if (reason.kind === "exit") instance.exit.fire(reason.code);
          break;
        case "data":
          instance.data.dispose();
          break;
        case "exit":
          instance.exit.dispose();
          break;
        case "forget":
          this.published.delete(instance.id);
          break;
      }
    }
  }
}
