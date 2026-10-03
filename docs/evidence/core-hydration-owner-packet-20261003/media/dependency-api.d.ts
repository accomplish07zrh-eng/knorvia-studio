// Original public port/type owner: packages/shared/src/artifact-uri.ts
type ArtifactUri = `knorvia-artifact://${string}` | `zcode-artifact://${string}`;
export declare function isArtifactUri(value: string | null | undefined): value is ArtifactUri;
