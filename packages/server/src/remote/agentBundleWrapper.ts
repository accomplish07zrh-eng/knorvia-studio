export const REMOTE_AGENT_BUNDLE_NAME = "knorvia.cjs";

export function buildRemoteAgentBundleWrapper(runtimeResourceDir: string): string {
  return [
    "#!/bin/sh",
    "set -eu",
    'runtime_root="${KNORVIA_SERVER_RUNTIME_ROOT:-$HOME/.knorvia-studio/server}"',
    `exec "$runtime_root/node" "$HOME/.knorvia-studio/server/agents/${runtimeResourceDir}/${REMOTE_AGENT_BUNDLE_NAME}" "$@"`,
    "",
  ].join("\n");
}

export function isRemoteAgentBundleWrapperCurrent(
  content: string,
  runtimeResourceDir: string,
): boolean {
  return content.replace(/\r\n/g, "\n") === buildRemoteAgentBundleWrapper(runtimeResourceDir);
}
