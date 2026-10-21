// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

/**
 * 示例 1：基础 IPC。
 *
 * 演示最小闭环：操作表 → 手写 IServerChannel → ChannelServer/ChannelClient
 * 通过内存队列互发序列化消息。这里刻意不借助 ProxyChannel，让 call/listen
 * 的分发过程完全可见。
 */

import { toDisposable } from "../src/index.js";
import {
  ChannelClient,
  ChannelServer,
  DisposableStore,
  Emitter,
  Event,
  createQueuePair,
  type IChannel,
  type IServerChannel,
} from "../src/index.js";

interface ComputeEvent {
  readonly expression: string;
  readonly value: number;
}

type Arithmetic = (left: number, right: number) => number;

const ARITHMETIC: Record<string, Arithmetic> = {
  add: (left, right) => left + right,
  multiply: (left, right) => left * right,
  divide: (left, right) => {
    if (right === 0) {
      throw new Error("Division by zero");
    }
    return left / right;
  },
};

/** 记录服务端实际执行过的运算，供示例观察事件通道。 */
class ComputeLog {
  private readonly changed = new Emitter<ComputeEvent>();
  readonly onDidCompute = this.changed.event;

  record(command: string, args: readonly number[], value: number): void {
    this.changed.fire({ expression: `${command}(${args.join(", ")})`, value });
  }

  dispose(): void {
    this.changed.dispose();
  }
}

function bindCalculator(log: ComputeLog): IServerChannel<string> {
  return {
    call(_ctx, command, args: number[] = []): Promise<any> {
      const arithmetic = ARITHMETIC[command];
      if (!arithmetic) {
        return Promise.reject(new Error(`Unknown command: ${command}`));
      }
      const value = arithmetic(args[0], args[1]);
      log.record(command, args, value);
      return Promise.resolve(value);
    },
    listen(_ctx, event): Event<any> {
      if (event !== "onDidCompute") {
        throw new Error(`Unknown event: ${event}`);
      }
      return log.onDidCompute;
    },
  };
}

async function demo(): Promise<void> {
  console.log("--- Basic IPC Demo ---");

  const subscriptions = new DisposableStore();
  const [localEnd, hostEnd] = createQueuePair();
  const client = new ChannelClient(localEnd);
  const log = new ComputeLog();
  const host = new ChannelServer(hostEnd, "demo-host");
  host.registerChannel("calculator", bindCalculator(log));

  subscriptions.add(toDisposable(() => log.dispose()));
  subscriptions.add(toDisposable(() => client.dispose()));
  subscriptions.add(toDisposable(() => host.dispose()));

  await Event.toPromise(client.onDidInitialize);
  const calculator = client.getChannel<IChannel>("calculator");

  subscriptions.add(
    calculator.listen<ComputeEvent>("onDidCompute")(({ expression, value }) => {
      console.log(`  [audit] ${expression} → ${value}`);
    }),
  );

  const cases: ReadonlyArray<{ command: string; args: [number, number] }> = [
    { command: "add", args: [10, 20] },
    { command: "multiply", args: [6, 7] },
    { command: "divide", args: [100, 3] },
  ];

  for (const entry of cases) {
    const value = await calculator.call<number>(entry.command, entry.args);
    console.log(`${entry.command}(${entry.args.join(", ")}) = ${value}`);
  }

  try {
    await calculator.call("divide", [1, 0]);
  } catch (error) {
    console.log(`divide(1, 0) → Error: ${(error as Error).message}`);
  }

  subscriptions.dispose();
  console.log("\nDone!");
}

demo().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
