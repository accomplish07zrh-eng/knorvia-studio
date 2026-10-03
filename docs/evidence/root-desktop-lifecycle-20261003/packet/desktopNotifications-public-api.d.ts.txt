import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
export declare function dispatchTaskNotification(options: {
    event: IpcMainEvent | IpcMainInvokeEvent;
    payload: unknown;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
}): boolean;
