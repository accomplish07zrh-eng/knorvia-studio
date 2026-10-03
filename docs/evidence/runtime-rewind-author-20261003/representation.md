# Private representation choice

The command owner keeps dispatch and outcome publication together. Message routing stays in the message owner. Conversation planning, branch commit, and derived-state hydration share one helper module; workspace cascade selection and restoration share another.

A discriminated available/unavailable conversation plan records the selected branch without performing writes. Cascade reads use an ordered array of checkpoint/artifact pairs. The array is fully populated before restoration begins. Native async helpers are called directly with the caller's runtime receiver, retaining the specified awaits and direct-return paths.

Source inputs: contract.md and api.json in this directory only. No repository, historical implementation, tests, or oracle content is an authoring input. This note describes implementation organization only.
