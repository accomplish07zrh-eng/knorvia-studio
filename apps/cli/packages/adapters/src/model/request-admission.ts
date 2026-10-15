// SPDX-License-Identifier: Apache-2.0
// attempt 准入：优先 tryAcquire 秒回票据；拿不到则排队（onQueued → acquire → 取消复查 → onAdmitted）。
// release 幂等；无 admission 端口时为空操作。排队回调只在端口提供 tryAcquire 时触发（历史语义）。

import type {
  ModelRequestAdmission,
  ModelRequestAdmissionTicket,
  ModelRequestTarget,
} from "@knorvia/contracts";

export interface AttemptAdmission {
  readonly ticket?: ModelRequestAdmissionTicket; // 持有的准入票据（可缺省）
  release(): void; // 幂等释放
}

function throwIfAborted(link?: AbortSignal): void {
  if (link?.aborted) throw link.reason ?? new DOMException("Aborted", "AbortError");
}

interface AdmissionCall {
  admission?: ModelRequestAdmission; // 注入的准入端口（可缺省）
  model: ModelRequestTarget; // 排队目标（模型身份）
  signal?: AbortSignal; // 取消信号
  onQueued?: () => Promise<void>; // 进入排队时的通知
  onAdmitted?: (queuedMs: number) => Promise<void>; // 拿到票据时的通知（带排队毫秒）
}

function sealedTicket(ticket: ModelRequestAdmissionTicket | undefined): AttemptAdmission {
  let surrendered = false;
  return {
    ticket,
    release: () => {
      if (surrendered) return;
      surrendered = true;
      ticket?.release();
    },
  };
}

export async function admitAttempt(input: AdmissionCall): Promise<AttemptAdmission> {
  throwIfAborted(input.signal);
  const port = input.admission;
  if (!port) return sealedTicket(undefined);
  const quick = port.tryAcquire?.({ model: input.model });
  if (quick) return sealedTicket(quick);
  const queuedAt = Date.now();
  if (port.tryAcquire) await input.onQueued?.();
  const acquired = await port.acquire({ model: input.model, signal: input.signal });
  throwIfAborted(input.signal);
  if (port.tryAcquire) await input.onAdmitted?.(Date.now() - queuedAt);
  return sealedTicket(acquired);
}
