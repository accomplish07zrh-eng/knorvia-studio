import { BrowserWindow } from "electron";
import { type AppSettings, type DesktopCommandId, type Locale } from "@knorvia/shared";
export declare const HELP_TOGGLE_DEV_TOOLS_MENU_ID = "help.toggle-dev-tools";
export declare const HELP_TOGGLE_KNORVIA_STDIO_TAP_MENU_ID = "help.toggle-stdio-tap";
export declare function resolveCommunityUrl(_options: unknown): Promise<string | undefined>;
export declare function executeDesktopCommand(options: {
    command: DesktopCommandId;
    fetchHelpConfig?: () => Promise<unknown>;
    senderWindow?: BrowserWindow | null;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    updateKnorviaStdioTapDevMenuState: () => void;
    onDesktopZoomChanged?: (zoomLevel: number) => Promise<void> | void;
    onRelaunchApp: () => Promise<void>;
    settingService: {
        get(): Promise<Pick<AppSettings, "knorviaEndpointOrigin" | "desktopZoomLevel">>;
        update(patch: Partial<Pick<AppSettings, "knorviaEndpointOrigin" | "desktopZoomLevel">>): Promise<void>;
    };
    credentialsDir: string;
    currentApplicationLocale: Locale;
}): unknown;
