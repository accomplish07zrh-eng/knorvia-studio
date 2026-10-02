# Provider author packet incident — bounded exposure record

Coordinator generated API appendices with an incorrect offset: slicing a node-local string using the absolute body offset could retain full or partial inherited function bodies. The first runtime, serialization and HTTP author packets were affected. Serialization author fresh_provider_serialization_author reported the retained bodies; coordinator then audited all three appendices, interrupted affected runs, retained packet/draft hashes and discarded every affected draft before committing provider source.

Affected authors: fresh_provider_runtime_author, fresh_provider_serialization_author, fresh_provider_http_author. They complied with permitted packet access; nevertheless those runs are SOURCE-EXPOSED. They are not evidence of implementation-body-free authorship. Runtime initial scoped types/lint passed only on its discarded draft and are not final-submission checks. HTTP attempt wrote no target source before interruption. No affected provider draft was committed, pushed or uploaded.

New distinct GPT-6.1 Sol high agents were spawned with fork_turns:none: fresh_runtime_bodyfree_author, fresh_serialization_bodyfree_author, fresh_http_bodyfree_author. They received corrected packets and were forbidden from reading original files, old packets/drafts/history, other authors or dependency bodies. New output replaces whole owners from behavior/API contracts. AST verification of corrected appendices before restart: runtime6, serialization17, HTTP10 exported function signatures, ZERO function bodies. Imports/interfaces/types and exact API/wire/error grammar remain supplied compatibility expression. Coordinator continues source-exposed review. Final sources and exposure reports belong to each batch evidence file; no package-wide independence/MIT claim follows from this process.

## Exposed packet hashes

| Packet                                                              | Raw SHA-256                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| packages/services/src/model-provider/RUNTIME-SPEC-20261002.md       | `4a60a50860fc46f8e65c67c9305bff65ac133167a724767cf6204d735b07deb1` |
| packages/services/src/model-provider/SERIALIZATION-SPEC-20261002.md | `5e9a84d68cce82340accd6b5a667a06162b42f9a0d37c0597c777888c1ed5366` |
| packages/services/src/providers/LIFECYCLE-SPEC-20261002.md          | `5e2950bc55ddf247431ab562b5f8f8b4ade7d7ed231fce781a9daf0112642fdd` |

## Discarded draft hashes

| Draft file                                                            | Raw SHA-256                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| packages/services/src/model-provider/providerConfigRuntime.ts         | `91a5157fc953e0d35c7653e7627d3a32518f8af45298d0a8f7d5e1ac3eda2062` |
| packages/services/src/model-provider/providerRuntime.ts               | `f6cd0534caa77b9c56904868e8b593006cd41aa748d808e772a4c63feba182c8` |
| packages/services/src/model-provider/providerFacadeServices.ts        | `22e01696898fdfce10fbc0872a46eb467431883dbde101ef4e0ada135aa817a4` |
| packages/services/src/model-provider/providerSettingsConnectivity.ts  | `8081d8d9a8d05480409a0e5cc2fb16e7d69e87bb2c8006d957066b912484daea` |
| packages/services/src/model-provider/legacyModelProviderSerialized.ts | `c560a7fbbc49467ce4e90c64bd96d63d3afaef416f798780b4ae630cb189c870` |
| packages/services/src/model-provider/legacyProviderEndpoints.ts       | `fe94e4dd688c51a4ec0da48ea003b5edf91fbaa4bc5c6ef94fc535be4227ed0c` |
| packages/services/src/model-provider/legacyProviderModels.ts          | `b6863bcba3c3f00bda30f88f69f82016b7200bc31b615a999bf7219f12121927` |
| packages/services/src/model-provider/legacyProviderTypes.ts           | `4961e3faf4f3d972f8cbbc14d338834a5cda25fab7e60cf6ea9ff49b2ad9c0d6` |
| packages/services/src/model-provider/legacyProviderSchemas.ts         | `af80f6ae277407a061b94668b6a35550bed59284315ec09950032cf266ab26fb` |
| packages/services/src/model-provider/legacyProviderMigration.ts       | `34d426ea00e3e1b2e4418e34469c42a27474bea00f60ec030fe0eba9fedbafa1` |
