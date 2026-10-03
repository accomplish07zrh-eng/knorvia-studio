import test from "node:test";
import { SessionResidentPool } from "../src/protocol/session-resident-pool.js";
import { residentLifecycleCases } from "./resident-pool-lifecycle-fixture.js";
import { residentPolicyCases } from "./resident-pool-policy-fixture.js";

for (const observation of [...residentPolicyCases, ...residentLifecycleCases]) {
  test(observation.name, () =>
    observation.run((host, options) => new SessionResidentPool(host, options)),
  );
}
