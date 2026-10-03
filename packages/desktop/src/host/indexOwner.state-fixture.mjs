export function createIndexOwnerControl({ startupGate, phaseGate }) {
  const control = {
    startupGate,
    phaseGate,
    startupOptions: null,
    localOptions: null,
    remoteOptions: null,
    collectionOptions: null,
    browserOptions: null,
    registryOptions: null,
    controllerOptions: null,
    attachmentOptions: null,
    phases: null,
    exposures: [],
    attachWait: null,
    flowGate: null,
    promptGate: null,
    fixedSelection: { id: "synthetic-model", options: { reasoningLevel: "high" } },
    persistedSelection: { id: "synthetic-fixed-model", options: { reasoningLevel: "low" } },
    automations: new Map(),
    runs: new Map(),
    ledgerFailure: null,
    replacedFailure: null,
    backendLoads: 0,
    settings: {
      httpProxy: "synthetic-proxy",
      httpProxyNoProxy: "synthetic-no-proxy",
      httpProxyCaCertPath: "synthetic-ca",
    },
  };
  return { control };
}
