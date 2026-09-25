export const studioRuntimeModule = {
  id: "studio-runtime",
  requires: ["shared", "rpc", "services", "session", "creation"],
  provides: ["studio-runtime-service"],
  publicEntrypoints: ["contract.ts", "node.ts"],
} as const;
