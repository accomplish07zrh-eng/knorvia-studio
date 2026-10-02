import { createCoreError } from "../deps.js";
interface ProviderBusinessMetadataFailure {
    message: string;
    providerCode?: string;
    responseBodySummary?: Record<string, unknown>;
}
export declare function findProviderBusinessFailureInMetadata(providerMetadata: Record<string, unknown> | undefined): ProviderBusinessMetadataFailure | undefined;
export declare function createCoreErrorFromProviderBusinessLike(error: unknown): ReturnType<typeof createCoreError> | undefined;
export {};
