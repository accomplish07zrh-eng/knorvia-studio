import { Emitter, type Event } from "@knorvia/rpc";

interface CloseEventController {
  event: Event<number>;
  fire(code: number): void;
}

export function createCloseEventController(): CloseEventController {
  const listeners = new Emitter<number>();
  let firstCode: number | undefined;

  return {
    event(listener) {
      if (firstCode === undefined) {
        return listeners.event(listener);
      }

      const code = firstCode;
      queueMicrotask(() => listener(code));
      return { dispose() {} };
    },
    fire(code) {
      if (firstCode !== undefined) return;
      firstCode = code;
      listeners.fire(code);
      listeners.dispose();
    },
  };
}
