import { type RepairRemoteSessionPathsInput, type SessionInfo, type SessionStorePort } from "@knorvia/contracts";
type RemoteSessionPathRepairStore = Pick<SessionStorePort, "getSession"> & {
    repairRemoteSessionPaths?: (input: RepairRemoteSessionPathsInput) => Promise<boolean>;
};
export declare function repairPersistedRemoteSessionPaths(sessionStore: RemoteSessionPathRepairStore, session: SessionInfo, options?: {
    onPersistenceFailure?: (error: unknown) => void;
}): Promise<SessionInfo>;
export {};
//# sourceMappingURL=persisted-remote-session-path-repair.d.ts.map