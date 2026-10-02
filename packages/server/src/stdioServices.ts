import { createLocalServices, type KnorviaAgentCommandResolver } from "@knorvia/services/node";
import {
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  parseServiceAuthorityMode,
} from "@knorvia/shared";

interface StdioServicesOptions {
  env?: Record<string, string | undefined>;
  knorviaBuiltinProviderConfigFilePath: string;
  agentCommandResolver?: KnorviaAgentCommandResolver;
}

export function createStdioServices(options: StdioServicesOptions) {
  const env = options.env ?? process.env;
  const authorityModeParseResult = parseServiceAuthorityMode(env);
  const remoteAgentNetwork =
    env[KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY]?.trim() === "1"
      ? {
          httpProxy: env[KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY]?.trim() || undefined,
          noProxy: env[KNORVIA_REMOTE_NO_PROXY_ENV_KEY]?.trim() || undefined,
        }
      : undefined;
  const services = createLocalServices({
    knorviaBuiltinProviderConfigFilePath: options.knorviaBuiltinProviderConfigFilePath,
    serviceAuthorityMode: authorityModeParseResult.mode,
    agentCommandResolver: options.agentCommandResolver,
    remoteAgentNetwork,
  });
  return { authorityModeParseResult, services };
}
