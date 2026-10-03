import type { Session } from "electron";
interface DesktopNetworkPolicySettings {
    httpProxy?: string;
    httpProxyNoProxy?: string;
    httpProxyCaCertPath?: string;
    embeddedBrowserAllowInsecureCertificates?: boolean;
}
interface DesktopNetworkPolicyLogger {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}
interface DesktopSessionProvider {
    readonly defaultSession: Session;
    fromPartition(partition: string): Session;
}
export declare function applyDesktopChromiumNetworkPolicies(sessionProvider: DesktopSessionProvider, settings: DesktopNetworkPolicySettings, logger: DesktopNetworkPolicyLogger): Promise<void>;
export {};
