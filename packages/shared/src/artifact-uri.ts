/** New artifacts use the Knorvia scheme; old saved sessions remain readable. */
export const KNORVIA_ARTIFACT_SCHEME = "knorvia-artifact://";
const LEGACY_ARTIFACT_SCHEME = "zcode-artifact://";
type ArtifactUri = `knorvia-artifact://${string}` | `zcode-artifact://${string}`;

export function createArtifactUri(sessionId: string, artifactId: string): string {
  return `${KNORVIA_ARTIFACT_SCHEME}${encodeURIComponent(sessionId)}/${encodeURIComponent(artifactId)}`;
}

export function isArtifactUri(value: string | null | undefined): value is ArtifactUri {
  return (
    typeof value === "string" &&
    (value.startsWith(KNORVIA_ARTIFACT_SCHEME) || value.startsWith(LEGACY_ARTIFACT_SCHEME))
  );
}

export function artifactUriBelongsToSession(value: string, sessionId: string): boolean {
  const sessionPrefix = `${encodeURIComponent(sessionId)}/`;
  return (
    value.startsWith(`${KNORVIA_ARTIFACT_SCHEME}${sessionPrefix}`) ||
    value.startsWith(`${LEGACY_ARTIFACT_SCHEME}${sessionPrefix}`)
  );
}
