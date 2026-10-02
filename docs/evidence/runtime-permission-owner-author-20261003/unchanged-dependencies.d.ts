// module runtime/permission-grant-recovery.ts
import type { AgentRuntimeInternal } from "./internal.js";
export declare const unpublishedPermissionGrants: WeakMap<AgentRuntimeInternal, {
    interactionId: string;
    recover: () => Promise<string>;
}>;
export declare function recoverPendingPermissionGrant(runtime: AgentRuntimeInternal): Promise<void>;
//# sourceMappingURL=permission-grant-recovery.d.ts.map
// module runtime/helpers/permission-broker.ts
import type { PermissionBrokerPort, PermissionBrokerRequest, PermissionBrokerResult } from "../deps.js";
interface ResolvablePermissionBroker extends PermissionBrokerPort {
    resolvePermission(requestIdOrToolCallId: string, result: PermissionBrokerResult): boolean;
}
interface InspectablePermissionBroker extends PermissionBrokerPort {
    listPendingRequests(): PermissionBrokerRequest[];
}
export declare function isResolvablePermissionBroker(broker: PermissionBrokerPort): broker is ResolvablePermissionBroker;
export declare function isInspectablePermissionBroker(broker: PermissionBrokerPort): broker is InspectablePermissionBroker;
export {};
//# sourceMappingURL=permission-broker.d.ts.map