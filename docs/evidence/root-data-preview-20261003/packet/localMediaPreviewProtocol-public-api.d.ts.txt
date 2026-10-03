import { buildLocalMediaPreviewUrl } from "@knorvia/shared";
interface LocalMediaPreviewSchemeRegistrar {
    registerSchemesAsPrivileged(schemes: Array<{
        scheme: string;
        privileges: {
            standard: boolean;
            secure: boolean;
            stream: boolean;
        };
    }>): void;
}
interface LocalMediaPreviewProtocolRequest {
    url: string;
}
type LocalMediaPreviewProtocolResponse = string | {
    error: number;
};
interface LocalMediaPreviewProtocol {
    registerFileProtocol(scheme: string, handler: (request: LocalMediaPreviewProtocolRequest, callback: (response: LocalMediaPreviewProtocolResponse) => void) => void): boolean;
}
interface LocalMediaPreviewPathRegistry {
    authorize(path: string): Promise<string>;
    isAuthorized(path: string): boolean;
    clear(): void;
}
export declare function createLocalMediaPreviewPathRegistry(dependencies?: {
    isAbsolutePath?: (path: string) => boolean;
    realpath?: (path: string) => Promise<string>;
    realpathSync?: (path: string) => string;
    isRegularFileSync?: (path: string) => boolean;
    now?: () => number;
    ttlMs?: number;
    maxEntries?: number;
}): LocalMediaPreviewPathRegistry;
export declare function registerLocalMediaPreviewScheme(protocol: LocalMediaPreviewSchemeRegistrar): void;
export declare function installLocalMediaPreviewProtocol(protocol: LocalMediaPreviewProtocol, options: {
    isPathAuthorized: (path: string) => boolean;
}): void;
export { buildLocalMediaPreviewUrl };
