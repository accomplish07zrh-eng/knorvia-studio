import { createLocalServices, getAppConfigDir } from "@knorvia/services/node";
import {
  materializeBundledKnorviaBuiltinProviderConfig,
  readBundledKnorviaBuiltinProviderConfig,
} from "./bundledBuiltinProviderConfig.js";
import { createHttpServer } from "./http.js";

async function main(): Promise<void> {
  const knorviaBuiltinProviderConfigFilePath = await materializeBundledKnorviaBuiltinProviderConfig(
    {
      environmentConfigRoot: getAppConfigDir(),
      content: readBundledKnorviaBuiltinProviderConfig(),
    },
  );
  const port = Number(process.env["PORT"]) || 3030;
  const host =
    process.env["KNORVIA_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || undefined;
  const staticRoot = process.env["KNORVIA_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["KNORVIA_SERVER_AUTH_TOKEN"]?.trim() || undefined;
  const services = createLocalServices({
    knorviaBuiltinProviderConfigFilePath,
  });

  createHttpServer(services, port, {
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken, authRequired: true } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[knorvia-server:http] startup failed", error);
  process.exitCode = 1;
});
