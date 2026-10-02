import { type RuntimeMessageEntry } from "../../agent/message-history.js";
export declare class ProviderEntryOrigins {
    get(entry: RuntimeMessageEntry): readonly RuntimeMessageEntry[];
    set(entry: RuntimeMessageEntry, inputs: readonly RuntimeMessageEntry[]): void;
    hasRealUser(entry: RuntimeMessageEntry): boolean;
    representative(entry: RuntimeMessageEntry): RuntimeMessageEntry | undefined;
}
export declare function isPresentedInput(entry: RuntimeMessageEntry): boolean;
export declare function projectIncomingMessageEntries(entries: readonly RuntimeMessageEntry[], origins: ProviderEntryOrigins): RuntimeMessageEntry[];
