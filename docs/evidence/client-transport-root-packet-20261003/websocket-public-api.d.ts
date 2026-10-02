import { type IMessagePassingProtocol } from "@knorvia/rpc";
import type { IServiceAccessor } from "@knorvia/services";
export interface WebSocketConnectionCloseEvent {
    code: number;
    reason: string;
    wasClean: boolean;
}
interface WebSocketConnectionOptions {
    onClose?: (event: WebSocketConnectionCloseEvent) => void;
    onOpenSocket?: (socket: WebSocket) => void;
}
export declare function connectViaWebSocket(wsUrl: string, options?: WebSocketConnectionOptions): Promise<IServiceAccessor>;
export declare function connectViaProtocol(protocol: IMessagePassingProtocol): IServiceAccessor;
export {};
