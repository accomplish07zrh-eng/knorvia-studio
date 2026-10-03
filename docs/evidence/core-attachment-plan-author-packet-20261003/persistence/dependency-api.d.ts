// Distinct unchanged collaborator surfaces; no dependency implementation.
// Original owner: packages/shared/src/artifact-uri.ts
type ArtifactUri = `knorvia-artifact://${string}` | `zcode-artifact://${string}`;
export declare function isArtifactUri(value: string | null | undefined): value is ArtifactUri;
// Original owner: apps/cli/packages/contracts/src/interfaces/shared.ts
export declare function createPartId(id?: string): PartId;
