import { homedir } from "node:os";
import type { ISystemService } from "#src/system/system.js";
import { listIntegratedTerminalShellOptions } from "#src/system/integratedTerminalShells.js";
import type {
  OwnerOptions,
  OwnerPolicy,
  ServiceProbe,
  TcpProbe,
} from "./system-probe/contracts.js";
import { probeHttp, probeTcp } from "./system-probe/defaultAdapters.js";
import { runTarget } from "./system-probe/targetLifecycle.js";

export type { ProbeTarget } from "./system-probe/contracts.js";

export function createSystemServiceOwner(
  options: OwnerOptions,
  policy: OwnerPolicy,
): ISystemService {
  const tcpProbe: TcpProbe = options.tcpProbe ?? probeTcp;
  const serviceProbe: ServiceProbe =
    options.serviceProbe ?? ((params) => probeHttp(params, policy));
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  return {
    async info() {
      return { homedir: homedir(), platform: process.platform };
    },
    async listIntegratedTerminalShells() {
      return listIntegratedTerminalShellOptions({
        env,
        isExecutable: options.isExecutable,
        platform,
      });
    },
    async probeIntranet(request) {
      const { targets, attempts, requiredSuccessCount } = policy.plan(request);
      const results = await Promise.all(
        targets.map((target) => runTarget(target, attempts, tcpProbe, serviceProbe)),
      );
      const reachedTargetCount = results.filter((result) => result.reachable).length;
      return {
        isIntranet: targets.length > 0 && reachedTargetCount >= requiredSuccessCount,
        reachedTargetCount,
        requiredSuccessCount,
        totalTargets: targets.length,
        checkedAt: now(),
        strategy: policy.strategy(targets),
        results,
      };
    },
  };
}
