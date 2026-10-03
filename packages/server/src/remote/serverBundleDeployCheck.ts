import type { IRemoteBackend, StdioStream } from "@knorvia/server/remote/backend.js";
import { quotePosixPathArg, quotePosixShellArg } from "@knorvia/server/remote/posixShell.js";

export type ServerBundleDeployDecision =
  | { shouldDeploy: false }
  | { shouldDeploy: true; reason: string };

function waitForMarkerCheck(stream: StdioStream): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    stream.stderr.on("data", (chunk: Buffer | string) => {
      if (stderr.length < 2048) stderr += chunk.toString();
    });
    stream.onClose((code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `remote deploy check exited with code ${code}`));
      }
    });
  });
}

export async function checkServerBundleRequiredMarkers(
  backend: IRemoteBackend,
  nodePath: string,
  serverPath: string,
): Promise<ServerBundleDeployDecision> {
  const script = `
const fs = require("fs");
const content = fs.readFileSync(process.argv[1], "utf8");
const missing = ["skill-sync","mcp-sync","plugin-sync","__knorvia_rpc_nested_uint8array_v1","exportMarketplaceSourceArchive","importMarketplaceSourceArchive"].filter((marker) => !content.includes(marker));
if (missing.length > 0) {
  console.error("missing required server bundle markers: " + missing.join(","));
  process.exit(2);
}
`;
  const stream = await backend.exec(
    `${quotePosixPathArg(nodePath)} -e ${quotePosixShellArg(script)} ${quotePosixPathArg(serverPath)}`,
  );
  try {
    await waitForMarkerCheck(stream);
    return { shouldDeploy: false };
  } catch (error) {
    return {
      shouldDeploy: true,
      reason: `remote server bundle missing required markers: ${String(error)}`,
    };
  }
}
