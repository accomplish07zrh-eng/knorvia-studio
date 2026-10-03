import { BrowserWindow } from "electron";
import { desktopMenuMessageIds, type DesktopCommandId, type Locale } from "@knorvia/shared";
export declare function getDesktopMenuLabel(locale: Locale, id: (typeof desktopMenuMessageIds)[keyof typeof desktopMenuMessageIds]): string;
export declare function resolveSystemApplicationLocale(): Locale;
export declare function updateKnorviaStdioTapDevMenuState(): void;
export declare function rebuildApplicationMenu(options: {
    currentApplicationLocale: Locale;
    endpointSelection?: "production" | "test" | "custom";
    executeDesktopCommand: (command: DesktopCommandId, senderWindow?: BrowserWindow | null) => Promise<unknown>;
    currentZoomLevel?: number;
    shortcutBindings?: Record<string, string[]>;
    disableShortcutAccelerators?: boolean;
}): void;
