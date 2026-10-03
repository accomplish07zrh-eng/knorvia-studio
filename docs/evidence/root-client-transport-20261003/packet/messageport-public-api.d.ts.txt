import type { IServiceAccessor } from "@knorvia/services";
export interface MessagePortServiceConnection {
    services: IServiceAccessor;
    dispose: (reason?: Error) => void;
}
export declare function createMessagePortServiceConnection(port: MessagePort): MessagePortServiceConnection;
export declare function connectViaMessagePort(port: MessagePort): IServiceAccessor;
