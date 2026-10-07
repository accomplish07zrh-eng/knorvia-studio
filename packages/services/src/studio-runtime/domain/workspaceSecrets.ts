// SPDX-License-Identifier: Apache-2.0
/** Known credential names only; source files are preserved, never inspected for secrets. */
export function studioWorkspaceSecretPath(path: string): boolean {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => {
      const name = part.toLowerCase();
      if (
        [
          ".ssh",
          ".aws",
          ".gnupg",
          ".npmrc",
          ".pypirc",
          ".netrc",
          "credentials.json",
          "id_rsa",
          "id_ed25519",
        ].includes(name)
      )
        return true;
      if (/\.(pem|p12|pfx|key)$/.test(name)) return true;
      return (
        (name === ".env" || name.startsWith(".env.")) &&
        ![".env.example", ".env.sample", ".env.template"].includes(name)
      );
    });
}
