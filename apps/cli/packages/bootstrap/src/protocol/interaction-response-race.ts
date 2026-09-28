// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { PermissionPreparation } from "@knorvia/core";
import type {
  V4InteractionAnswer,
  V4InteractionRegistrationOptions,
  V4InteractionRegistry,
} from "../protocol-v4/interaction-registry.js";
import { ProtocolRequestError, type KnorviaProtocolAgentServerContext } from "./server-types.js";

/** A single prepared result is shared by the existing registry callback and the legacy request. */
export function prepareClientRequestWithV4Interaction<T>(
  context: KnorviaProtocolAgentServerContext,
  interactionId: string,
  outerSignal: AbortSignal | undefined,
  startRequest: (signal: AbortSignal) => Promise<T>,
  mapAnswer: (answer: V4InteractionAnswer) => T,
  registrationOptions?: V4InteractionRegistrationOptions,
  requestMethod?: string,
): PermissionPreparation<T> {
  const controller = new AbortController();
  let registration: ReturnType<V4InteractionRegistry["prepare"]> | undefined;
  let failedCommit: Promise<void> | undefined;
  const cancelled = () =>
    new ProtocolRequestError(
      -32021,
      requestMethod ? `Client request cancelled: ${requestMethod}` : "Client request cancelled",
    );
  const owner = new PermissionPreparation<T>({
    signal: outerSignal,
    cancelled,
    dispose: () => {
      registration?.dispose();
      controller.abort();
    },
    activate: async () => {
      if (!registration!.activate()) {
        owner.dispose();
        return;
      }
      if (owner.settled) return;
      try {
        const value = await startRequest(controller.signal);
        await waitForCommit();
        if (!owner.settled) owner.resolve(value);
      } catch (error) {
        await waitForCommit();
        if (!owner.settled) owner.reject(error);
      }
    },
  });
  const closed = owner.result.then(
    () => {},
    () => {},
  );
  async function waitForCommit() {
    // 每次失败单独唤醒；若用户已开始重试，继续等待该次提交，不能用旧通知放行。
    while (failedCommit && !owner.settled) await Promise.race([failedCommit, closed]);
  }
  const fullAccess = registrationOptions?.fullAccess;
  const policy = fullAccess
    ? {
        ...registrationOptions!,
        fullAccess: async () => {
          let release!: () => void;
          const failure = new Promise<void>((resolve) => {
            release = resolve;
          });
          failedCommit = failure;
          try {
            await registrationOptions!.fullAccess!();
          } catch (error) {
            if (failedCommit === failure) failedCommit = undefined;
            release();
            throw error;
          }
        },
      }
    : registrationOptions;
  try {
    registration = context.v4Interactions.prepare(
      interactionId,
      (answer) => owner.resolveFrom(() => mapAnswer(answer)),
      policy,
      () => owner.dispose(),
    );
  } catch (error) {
    owner.reject(error);
    throw error;
  }
  return owner;
}

/** Existing direct callers still use exactly the same prepared request and cleanup path. */
export async function raceClientRequestWithV4Interaction<T>(
  ...args: Parameters<typeof prepareClientRequestWithV4Interaction<T>>
): Promise<T> {
  const handle = prepareClientRequestWithV4Interaction(...args);
  try {
    handle.activate();
    return await handle.result;
  } finally {
    handle.dispose();
  }
}
