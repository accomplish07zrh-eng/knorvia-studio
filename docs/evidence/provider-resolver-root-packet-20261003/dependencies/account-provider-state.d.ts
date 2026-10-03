import type { AccountProviderUnavailableReason } from "@knorvia/shared/account-provider-state";

export interface AccountProviderState {
    readonly availability: "available" | "pending" | "unavailable" | "unknown";
    readonly entitled: boolean;
    readonly unavailableReason?: AccountProviderUnavailableReason;
    readonly current?: boolean;
    readonly connectionKey?: string;
    readonly effectiveAt?: number;
}

export type AccountProviderStates = Readonly<Record<string, AccountProviderState>>;
