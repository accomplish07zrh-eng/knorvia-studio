// Distinct unchanged collaborator surfaces; no dependency implementation.
// Original owner: packages/shared/src/artifact-uri.ts
type ArtifactUri = `knorvia-artifact://${string}` | `zcode-artifact://${string}`;
export declare function isArtifactUri(value: string | null | undefined): value is ArtifactUri;
