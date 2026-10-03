import { type DesktopCommandId, type Locale } from "@knorvia/shared";
export declare function createWindowsDesktopTray(options: {
    getLocale: () => Locale;
    showCurrentWindow: () => Promise<void> | void;
    executeDesktopCommand: (command: DesktopCommandId) => Promise<unknown>;
    quitApp: () => void;
    logger: {
        warn: (...args: unknown[]) => void;
    };
}): any;
export declare function updateWindowsDesktopTrayMenu(): void;
